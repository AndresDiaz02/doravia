import { db, asientos_contables, lineas_asiento, cuentas_contables, periodos_contables } from "@workspace/db";
import { eq, and, gte, lte, isNull, or } from "drizzle-orm";
import type { Factura, Gasto, VentaPOS, Fiado, AbonoFiado } from "@workspace/db";

/**
 * Verifica que la fecha no caiga dentro de un período contable cerrado.
 * Lanza un Error si el período está cerrado — el llamador debe capturarlo y devolver 422.
 */
export async function verificarPeriodoAbierto(tenantId: string, fecha: Date | string): Promise<void> {
  const fechaStr = typeof fecha === "string" ? fecha.slice(0, 10) : fecha.toISOString().slice(0, 10);

  const [periodoCerrado] = await db
    .select({ nombre: periodos_contables.nombre })
    .from(periodos_contables)
    .where(
      and(
        eq(periodos_contables.tenant_id, tenantId),
        eq(periodos_contables.estado, "cerrado"),
        lte(periodos_contables.fecha_inicio, fechaStr),
        gte(periodos_contables.fecha_fin, fechaStr),
      ),
    )
    .limit(1);

  if (periodoCerrado) {
    throw new Error(`El período contable "${periodoCerrado.nombre}" está cerrado. No se pueden registrar documentos en fechas dentro de un período cerrado.`);
  }
}

// Códigos PUC usados en asientos automáticos
const CODIGOS = {
  CLIENTES: "1305",
  CAJA: "1105",
  BANCOS: "1110",
  IVA_POR_PAGAR: "2408",
  INGRESOS_COMERCIO: "4135",
  INGRESOS_SERVICIOS: "4175",
  PROVEEDORES: "2205",
} as const;

// Método de pago POS → cuenta PUC del activo que recibe el dinero
const METODO_PAGO_A_CUENTA: Record<string, string> = {
  efectivo:      "1105", // Caja general
  tarjeta:       "1110", // Bancos (datáfono deposita en banco)
  transferencia: "1110",
  nequi:         "1110",
  daviplata:     "1110",
  mixto:         "1110", // Conservador: banco
};

// Mapa de categoría de gasto → código PUC
const CATEGORIA_A_PUC: Record<string, string> = {
  nomina:            "5105",
  honorarios:        "5110",
  impuestos:         "5115",
  servicios_publicos:"5135",
  mantenimiento:     "5145",
  arrendamiento:     "5195",
  transporte:        "5195",
  publicidad:        "5195",
  papeleria:         "5195",
  tecnologia:        "5195",
  compra_mercancia:  "6135",
  otros:             "5195",
};

async function getCuenta(tenantId: string, codigo: string) {
  const rows = await db
    .select()
    .from(cuentas_contables)
    .where(
      and(
        eq(cuentas_contables.codigo, codigo),
        or(eq(cuentas_contables.tenant_id, tenantId), isNull(cuentas_contables.tenant_id))
      )
    )
    .orderBy(cuentas_contables.tenant_id) // tenant-specific primero si existe
    .limit(1);

  if (!rows[0]) throw new Error(`Cuenta PUC no encontrada: ${codigo}`);
  return rows[0];
}

async function getConsecutivoAsiento(tenantId: string, anio: number): Promise<string> {
  // Contador simple: cuenta asientos del año para el tenant
  const { count } = await import("drizzle-orm");
  const [{ value }] = await db
    .select({ value: count() })
    .from(asientos_contables)
    .where(eq(asientos_contables.tenant_id, tenantId));

  const seq = String(Number(value) + 1).padStart(5, "0");
  return `AC-${anio}-${seq}`;
}

/**
 * Genera el asiento contable automático para una factura de venta emitida.
 *
 * Partida doble:
 *   Débito:  1305 Clientes nacionales    = total factura
 *   Crédito: 4135 Ingresos               = subtotal
 *   Crédito: 2408 IVA por pagar          = iva_total (omitida si iva = 0)
 *
 * Devuelve el id del asiento creado.
 */
export async function crearAsientoFactura(
  tenantId: string,
  factura: Factura,
  ingresosCodigo: "4135" | "4175" = "4135"
): Promise<string> {
  const fecha = new Date(factura.fecha_emision);
  const numero = await getConsecutivoAsiento(tenantId, fecha.getFullYear());

  const [cClientes, cIngresos, cIva] = await Promise.all([
    getCuenta(tenantId, CODIGOS.CLIENTES),
    getCuenta(tenantId, ingresosCodigo),
    getCuenta(tenantId, CODIGOS.IVA_POR_PAGAR),
  ]);

  const total = Number(factura.total);
  const subtotal = Number(factura.subtotal) - Number(factura.descuento_total);
  const iva = Number(factura.iva_total);

  const [asiento] = await db
    .insert(asientos_contables)
    .values({
      tenant_id: tenantId,
      numero,
      fecha: fecha.toISOString().split("T")[0],
      descripcion: `Factura de venta ${factura.numero}`,
      origen: "factura",
      referencia_id: factura.id,
    })
    .returning();

  const lineas = [
    { asiento_id: asiento.id, cuenta_id: cClientes.id, descripcion: "Clientes", debito: String(total), credito: "0" },
    { asiento_id: asiento.id, cuenta_id: cIngresos.id, descripcion: "Ingresos por venta", debito: "0", credito: String(subtotal) },
  ];

  if (iva > 0) {
    lineas.push({
      asiento_id: asiento.id,
      cuenta_id: cIva.id,
      descripcion: "IVA generado",
      debito: "0",
      credito: String(iva),
    });
  }

  await db.insert(lineas_asiento).values(lineas);

  return asiento.id;
}

/**
 * Verifica si una fecha cae dentro de un período cerrado.
 * Lanza error 422 si está bloqueado.
 */
export async function verificarPeriodoCerrado(tenantId: string, fechaStr: string) {
  const cerrados = await db
    .select()
    .from(periodos_contables)
    .where(
      and(
        eq(periodos_contables.tenant_id, tenantId),
        eq(periodos_contables.estado, "cerrado"),
        lte(periodos_contables.fecha_inicio, fechaStr),
        gte(periodos_contables.fecha_fin, fechaStr),
      )
    )
    .limit(1);

  if (cerrados.length > 0) {
    throw Object.assign(new Error(`El período "${cerrados[0].nombre}" está cerrado. No se pueden crear ni modificar asientos en fechas cerradas.`), { status: 422, code: "PERIOD_CLOSED" });
  }
}

/**
 * Genera el asiento contable automático para un gasto aprobado.
 *
 * Partida doble:
 *   Débito:  5xxx Gasto (según categoría)   = monto base
 *   Débito:  2408 IVA por pagar (reducción)  = iva (si > 0)
 *   Crédito: 2205 Proveedores nacionales     = total (si tiene proveedor)
 *   Crédito: 1110 Bancos                     = total (si no tiene proveedor)
 */
export async function crearAsientoGasto(tenantId: string, gasto: Gasto): Promise<string> {
  const fecha = gasto.fecha; // date string "YYYY-MM-DD"
  await verificarPeriodoCerrado(tenantId, fecha);

  const numero = await getConsecutivoAsiento(tenantId, new Date(fecha).getFullYear());
  const codigoGasto = CATEGORIA_A_PUC[gasto.categoria] ?? "5195";

  const cuentaCodigos = [codigoGasto, CODIGOS.IVA_POR_PAGAR, gasto.proveedor_id ? CODIGOS.PROVEEDORES : CODIGOS.BANCOS];
  const cuentasUnicas = [...new Set(cuentaCodigos)];

  const cuentasMap: Record<string, string> = {};
  await Promise.all(cuentasUnicas.map(async (cod) => {
    const c = await getCuenta(tenantId, cod);
    cuentasMap[cod] = c.id;
  }));

  const monto = Number(gasto.monto);
  const iva = Number(gasto.iva);
  const total = Number(gasto.total);

  const [asiento] = await db
    .insert(asientos_contables)
    .values({
      tenant_id: tenantId,
      numero,
      fecha,
      descripcion: `Gasto: ${gasto.descripcion}`,
      origen: "compra",
      referencia_id: gasto.id,
    })
    .returning();

  const lineas = [
    { asiento_id: asiento.id, cuenta_id: cuentasMap[codigoGasto], descripcion: gasto.descripcion, debito: String(monto), credito: "0" },
  ];

  if (iva > 0) {
    lineas.push({
      asiento_id: asiento.id,
      cuenta_id: cuentasMap[CODIGOS.IVA_POR_PAGAR],
      descripcion: "IVA descontable",
      debito: String(iva),
      credito: "0",
    });
  }

  const codigoContraparte = gasto.proveedor_id ? CODIGOS.PROVEEDORES : CODIGOS.BANCOS;
  lineas.push({
    asiento_id: asiento.id,
    cuenta_id: cuentasMap[codigoContraparte],
    descripcion: gasto.proveedor_id ? "Proveedor — cuenta por pagar" : "Pago directo banco",
    debito: "0",
    credito: String(total),
  });

  await db.insert(lineas_asiento).values(lineas);
  return asiento.id;
}

/**
 * Genera el asiento contable automático para una venta del POS.
 *
 * Partida doble:
 *   Débito:  1105 Caja / 1110 Bancos   = total venta  (según método de pago)
 *   Crédito: 4135 Ingresos comercio    = subtotal
 *   Crédito: 2408 IVA por pagar        = iva_total (si > 0)
 *
 * Se ejecuta dentro de la transacción de la venta (tx opcional).
 */
export async function crearAsientoVentaPOS(
  tenantId: string,
  venta: VentaPOS,
  tx?: typeof db,
): Promise<string> {
  const runner = tx ?? db;
  const fecha = venta.created_at.toISOString().split("T")[0];
  await verificarPeriodoCerrado(tenantId, fecha);

  const numero = await getConsecutivoAsiento(tenantId, venta.created_at.getFullYear());
  const codigoCaja = METODO_PAGO_A_CUENTA[venta.metodo_pago] ?? "1105";

  const [cCaja, cIngresos, cIva] = await Promise.all([
    getCuenta(tenantId, codigoCaja),
    getCuenta(tenantId, CODIGOS.INGRESOS_COMERCIO),
    getCuenta(tenantId, CODIGOS.IVA_POR_PAGAR),
  ]);

  const total    = Number(venta.total);
  const subtotal = Number(venta.subtotal) - Number(venta.descuento_total);
  const iva      = Number(venta.iva_total);

  const [asiento] = await runner
    .insert(asientos_contables)
    .values({
      tenant_id: tenantId,
      numero,
      fecha,
      descripcion: `Venta POS ${venta.numero}`,
      origen: "factura",
      referencia_id: venta.id,
    })
    .returning();

  const lineas = [
    {
      asiento_id: asiento.id,
      cuenta_id: cCaja.id,
      descripcion: `${venta.metodo_pago.charAt(0).toUpperCase() + venta.metodo_pago.slice(1)} — ingreso POS`,
      debito: String(total),
      credito: "0",
    },
    {
      asiento_id: asiento.id,
      cuenta_id: cIngresos.id,
      descripcion: "Ingresos por ventas POS",
      debito: "0",
      credito: String(subtotal),
    },
  ];

  if (iva > 0) {
    lineas.push({
      asiento_id: asiento.id,
      cuenta_id: cIva.id,
      descripcion: "IVA generado POS",
      debito: "0",
      credito: String(iva),
    });
  }

  await runner.insert(lineas_asiento).values(lineas);
  return asiento.id;
}

/**
 * Asiento al crear un fiado:
 *   Débito:  1305 Clientes nacionales  = total
 *   Crédito: 4135 Ingresos comercio    = total - iva
 *   Crédito: 2408 IVA por pagar        = iva (si > 0)
 */
export async function crearAsientoFiado(
  tenantId: string,
  fiado: Fiado,
  ivaTotal = 0,
): Promise<string> {
  const fecha = fiado.created_at.toISOString().split("T")[0];
  await verificarPeriodoCerrado(tenantId, fecha);

  const numero = await getConsecutivoAsiento(tenantId, fiado.created_at.getFullYear());
  const total = Number(fiado.monto_total);
  const subtotal = total - ivaTotal;

  const [cClientes, cIngresos, cIva] = await Promise.all([
    getCuenta(tenantId, CODIGOS.CLIENTES),
    getCuenta(tenantId, CODIGOS.INGRESOS_COMERCIO),
    getCuenta(tenantId, CODIGOS.IVA_POR_PAGAR),
  ]);

  const [asiento] = await db.insert(asientos_contables).values({
    tenant_id: tenantId,
    numero,
    fecha,
    descripcion: `Fiado — ${fiado.nombre_cliente}`,
    origen: "factura",
    referencia_id: fiado.id,
  }).returning();

  const lineas = [
    { asiento_id: asiento.id, cuenta_id: cClientes.id, descripcion: `Fiado ${fiado.nombre_cliente}`, debito: String(total), credito: "0" },
    { asiento_id: asiento.id, cuenta_id: cIngresos.id, descripcion: "Ingresos fiado POS", debito: "0", credito: String(subtotal) },
  ];
  if (ivaTotal > 0) {
    lineas.push({ asiento_id: asiento.id, cuenta_id: cIva.id, descripcion: "IVA fiado POS", debito: "0", credito: String(ivaTotal) });
  }
  await db.insert(lineas_asiento).values(lineas);
  return asiento.id;
}

/**
 * Asiento al recibir un abono de un fiado:
 *   Débito:  1105 Caja / 1110 Bancos   = monto abono
 *   Crédito: 1305 Clientes nacionales  = monto abono
 */
export async function crearAsientoAbonoFiado(
  tenantId: string,
  abono: AbonoFiado,
  nombreCliente: string,
): Promise<string> {
  const fecha = abono.created_at.toISOString().split("T")[0];
  await verificarPeriodoCerrado(tenantId, fecha);

  const numero = await getConsecutivoAsiento(tenantId, abono.created_at.getFullYear());
  const codigoCaja = METODO_PAGO_A_CUENTA[abono.metodo_pago] ?? "1105";

  const [cCaja, cClientes] = await Promise.all([
    getCuenta(tenantId, codigoCaja),
    getCuenta(tenantId, CODIGOS.CLIENTES),
  ]);

  const [asiento] = await db.insert(asientos_contables).values({
    tenant_id: tenantId,
    numero,
    fecha,
    descripcion: `Abono fiado — ${nombreCliente}`,
    origen: "pago",
    referencia_id: abono.fiado_id,
  }).returning();

  await db.insert(lineas_asiento).values([
    { asiento_id: asiento.id, cuenta_id: cCaja.id, descripcion: `Abono recibido (${abono.metodo_pago})`, debito: String(abono.monto), credito: "0" },
    { asiento_id: asiento.id, cuenta_id: cClientes.id, descripcion: `Cancelación fiado ${nombreCliente}`, debito: "0", credito: String(abono.monto) },
  ]);

  return asiento.id;
}

/**
 * Libro diario del tenant: todos los asientos con sus líneas, en orden cronológico.
 */
export async function getLibroDiario(tenantId: string, desde: Date, hasta: Date) {
  return db
    .select({
      asiento: asientos_contables,
      linea: lineas_asiento,
      cuenta: cuentas_contables,
    })
    .from(asientos_contables)
    .innerJoin(lineas_asiento, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(
      and(
        eq(asientos_contables.tenant_id, tenantId),
        gte(asientos_contables.fecha, desde.toISOString().split("T")[0]),
        lte(asientos_contables.fecha, hasta.toISOString().split("T")[0])
      )
    )
    .orderBy(asientos_contables.fecha, asientos_contables.numero);
}

/**
 * Mayor de una cuenta: todos los movimientos de una cuenta dada.
 */
export async function getMayorCuenta(tenantId: string, cuentaCodigo: string) {
  const cuenta = await getCuenta(tenantId, cuentaCodigo);

  return db
    .select({
      asiento: asientos_contables,
      linea: lineas_asiento,
    })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .where(
      and(
        eq(asientos_contables.tenant_id, tenantId),
        eq(lineas_asiento.cuenta_id, cuenta.id)
      )
    )
    .orderBy(asientos_contables.fecha);
}
