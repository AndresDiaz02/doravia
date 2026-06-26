import { Router } from "express";
import { db, asientos_contables, lineas_asiento, cuentas_contables, periodos_contables } from "@workspace/db";
import { eq, and, gte, lte, isNull, or, desc, sum, inArray, sql } from "drizzle-orm";
import { requireAccountingLevel, requireNotContador } from "../middleware/require-plan-feature.js";
import * as XLSX from "xlsx";

const router = Router();

// Libro diario — todos los asientos del periodo con sus líneas
router.get("/diario", async (req, res) => {
  const { desde, hasta } = req.query as { desde?: string; hasta?: string };

  const condiciones = [eq(asientos_contables.tenant_id, req.tenantId)];
  if (desde) condiciones.push(gte(asientos_contables.fecha, desde));
  if (hasta) condiciones.push(lte(asientos_contables.fecha, hasta));

  const asientos = await db
    .select()
    .from(asientos_contables)
    .where(and(...condiciones))
    .orderBy(asientos_contables.fecha, asientos_contables.numero);

  const asientoIds = asientos.map((a) => a.id);
  if (asientoIds.length === 0) return res.json([]);

  const lineas = await db
    .select({ linea: lineas_asiento, cuenta: cuentas_contables })
    .from(lineas_asiento)
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(inArray(lineas_asiento.asiento_id, asientoIds));

  // Agrupar líneas por asiento
  const lineaMap = new Map<string, typeof lineas>();
  lineas.forEach((l) => {
    const key = l.linea.asiento_id;
    if (!lineaMap.has(key)) lineaMap.set(key, []);
    lineaMap.get(key)!.push(l);
  });

  res.json(asientos.map((a) => ({ ...a, lineas: lineaMap.get(a.id) ?? [] })));
});

// Mayor de cuenta — movimientos de una cuenta en el periodo
router.get("/mayor/:codigo", async (req, res) => {
  const { desde, hasta } = req.query as { desde?: string; hasta?: string };
  const { codigo } = req.params;

  const [cuenta] = await db
    .select()
    .from(cuentas_contables)
    .where(
      and(
        eq(cuentas_contables.codigo, codigo),
        or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id))
      )
    )
    .orderBy(cuentas_contables.tenant_id)
    .limit(1);

  if (!cuenta) return res.status(404).json({ error: `Cuenta ${codigo} no encontrada.` });

  const condiciones = [
    eq(asientos_contables.tenant_id, req.tenantId),
    eq(lineas_asiento.cuenta_id, cuenta.id),
  ];
  if (desde) condiciones.push(gte(asientos_contables.fecha, desde));
  if (hasta) condiciones.push(lte(asientos_contables.fecha, hasta));

  const movimientos = await db
    .select({ asiento: asientos_contables, linea: lineas_asiento })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .where(and(...condiciones))
    .orderBy(asientos_contables.fecha);

  // Calcular saldo acumulado
  let saldo = 0;
  const conSaldo = movimientos.map(({ asiento, linea }) => {
    const mov = cuenta.naturaleza === "debito"
      ? Number(linea.debito) - Number(linea.credito)
      : Number(linea.credito) - Number(linea.debito);
    saldo += mov;
    return { asiento, linea, saldo };
  });

  res.json({ cuenta, movimientos: conSaldo });
});

// Lista de cuentas PUC disponibles para el tenant
router.get("/cuentas", async (req, res) => {
  const cuentas = await db
    .select()
    .from(cuentas_contables)
    .where(
      and(
        or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
        eq(cuentas_contables.activo, true)
      )
    )
    .orderBy(cuentas_contables.codigo);

  res.json(cuentas);
});

// ── Reportes nivel 2 (Raíz y superior) ────────────────────────────────────────

// GET /api/contabilidad/balance-general?corte=YYYY-MM-DD
router.get("/balance-general", requireAccountingLevel(2), async (req, res) => {
  const corte = (req.query.corte as string | undefined) ?? new Date().toISOString().split("T")[0];

  const filas = await db
    .select({
      tipo: cuentas_contables.tipo,
      codigo: cuentas_contables.codigo,
      nombre: cuentas_contables.nombre,
      naturaleza: cuentas_contables.naturaleza,
      total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
      total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
    })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(
      and(
        eq(asientos_contables.tenant_id, req.tenantId),
        lte(asientos_contables.fecha, corte),
        or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
      ),
    )
    .groupBy(
      cuentas_contables.tipo,
      cuentas_contables.codigo,
      cuentas_contables.nombre,
      cuentas_contables.naturaleza,
    )
    .orderBy(cuentas_contables.codigo);

  // Calcular saldos: naturaleza débito → saldo = debito - credito; crédito → credito - debito
  const conSaldo = filas.map((f) => {
    const saldo =
      f.naturaleza === "debito"
        ? Number(f.total_debito) - Number(f.total_credito)
        : Number(f.total_credito) - Number(f.total_debito);
    return { ...f, saldo };
  });

  const activos = conSaldo.filter((f) => f.tipo === "activo");
  const pasivos = conSaldo.filter((f) => f.tipo === "pasivo");
  const patrimonio = conSaldo.filter((f) => f.tipo === "patrimonio");

  res.json({
    corte,
    activos,
    pasivos,
    patrimonio,
    totales: {
      activos: activos.reduce((s, f) => s + f.saldo, 0),
      pasivos: pasivos.reduce((s, f) => s + f.saldo, 0),
      patrimonio: patrimonio.reduce((s, f) => s + f.saldo, 0),
    },
  });
});

// GET /api/contabilidad/estado-resultados?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/estado-resultados", requireAccountingLevel(2), async (req, res) => {
  const hoy = new Date().toISOString().split("T")[0];
  const desde = (req.query.desde as string | undefined) ?? hoy.slice(0, 7) + "-01";
  const hasta = (req.query.hasta as string | undefined) ?? hoy;

  const filas = await db
    .select({
      tipo: cuentas_contables.tipo,
      codigo: cuentas_contables.codigo,
      nombre: cuentas_contables.nombre,
      naturaleza: cuentas_contables.naturaleza,
      total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
      total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
    })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(
      and(
        eq(asientos_contables.tenant_id, req.tenantId),
        gte(asientos_contables.fecha, desde),
        lte(asientos_contables.fecha, hasta),
        or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
        // Solo cuentas de resultado
        sql`${cuentas_contables.tipo} IN ('ingreso', 'costo', 'gasto')`,
      ),
    )
    .groupBy(
      cuentas_contables.tipo,
      cuentas_contables.codigo,
      cuentas_contables.nombre,
      cuentas_contables.naturaleza,
    )
    .orderBy(cuentas_contables.codigo);

  const ingresos = filas
    .filter((f) => f.tipo === "ingreso")
    .map((f) => ({ ...f, saldo: Number(f.total_credito) - Number(f.total_debito) }));

  const costos = filas
    .filter((f) => f.tipo === "costo")
    .map((f) => ({ ...f, saldo: Number(f.total_debito) - Number(f.total_credito) }));

  const gastos = filas
    .filter((f) => f.tipo === "gasto")
    .map((f) => ({ ...f, saldo: Number(f.total_debito) - Number(f.total_credito) }));

  const totalIngresos = ingresos.reduce((s, f) => s + f.saldo, 0);
  const totalCostos = costos.reduce((s, f) => s + f.saldo, 0);
  const totalGastos = gastos.reduce((s, f) => s + f.saldo, 0);

  res.json({
    periodo: { desde, hasta },
    ingresos,
    costos,
    gastos,
    totales: {
      ingresos: totalIngresos,
      costos: totalCostos,
      gastos: totalGastos,
      utilidad_bruta: totalIngresos - totalCostos,
      utilidad_neta: totalIngresos - totalCostos - totalGastos,
    },
  });
});

// ── Períodos contables ────────────────────────────────────────────────────────

// GET /api/contabilidad/periodos
router.get("/periodos", async (req, res) => {
  const periodos = await db
    .select()
    .from(periodos_contables)
    .where(eq(periodos_contables.tenant_id, req.tenantId))
    .orderBy(desc(periodos_contables.fecha_inicio));
  res.json(periodos);
});

// POST /api/contabilidad/periodos
router.post("/periodos", requireNotContador, async (req, res) => {
  const { nombre, tipo, fecha_inicio, fecha_fin } = req.body;
  if (!nombre || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: "Campos requeridos: nombre, fecha_inicio, fecha_fin." });
  }

  const [nuevo] = await db
    .insert(periodos_contables)
    .values({
      tenant_id: req.tenantId,
      nombre,
      tipo: tipo ?? "mensual",
      fecha_inicio,
      fecha_fin,
      estado: "abierto",
    })
    .returning();

  res.status(201).json(nuevo);
});

// PATCH /api/contabilidad/periodos/:id/cerrar
router.patch("/periodos/:id/cerrar", requireNotContador, async (req, res) => {
  const [periodo] = await db
    .select()
    .from(periodos_contables)
    .where(and(eq(periodos_contables.id, req.params.id), eq(periodos_contables.tenant_id, req.tenantId)))
    .limit(1);

  if (!periodo) return res.status(404).json({ error: "Período no encontrado." });
  if (periodo.estado === "cerrado") return res.status(422).json({ error: "El período ya está cerrado." });

  const [cerrado] = await db
    .update(periodos_contables)
    .set({ estado: "cerrado", cerrado_at: new Date(), cerrado_por_id: req.userId })
    .where(eq(periodos_contables.id, periodo.id))
    .returning();

  res.json(cerrado);
});

// PATCH /api/contabilidad/periodos/:id/reabrir
router.patch("/periodos/:id/reabrir", requireNotContador, async (req, res) => {
  const [periodo] = await db
    .select()
    .from(periodos_contables)
    .where(and(eq(periodos_contables.id, req.params.id), eq(periodos_contables.tenant_id, req.tenantId)))
    .limit(1);

  if (!periodo) return res.status(404).json({ error: "Período no encontrado." });

  const [reabierto] = await db
    .update(periodos_contables)
    .set({ estado: "abierto", cerrado_at: null, cerrado_por_id: null })
    .where(eq(periodos_contables.id, periodo.id))
    .returning();

  res.json(reabierto);
});

// ── Exportar a Excel ──────────────────────────────────────────────────────────

function enviarExcel(res: import("express").Response, wb: XLSX.WorkBook, nombre: string) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(buf);
}

// GET /api/contabilidad/exportar/diario?desde=&hasta=
router.get("/exportar/diario", async (req, res) => {
  const { desde, hasta } = req.query as { desde?: string; hasta?: string };
  const hoy = new Date().toISOString().split("T")[0];

  const condiciones = [eq(asientos_contables.tenant_id, req.tenantId)];
  if (desde) condiciones.push(gte(asientos_contables.fecha, desde));
  if (hasta) condiciones.push(lte(asientos_contables.fecha, hasta));

  const filas = await db
    .select({
      asiento_numero: asientos_contables.numero,
      asiento_fecha: asientos_contables.fecha,
      asiento_descripcion: asientos_contables.descripcion,
      asiento_origen: asientos_contables.origen,
      cuenta_codigo: cuentas_contables.codigo,
      cuenta_nombre: cuentas_contables.nombre,
      linea_descripcion: lineas_asiento.descripcion,
      debito: lineas_asiento.debito,
      credito: lineas_asiento.credito,
    })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(and(...condiciones))
    .orderBy(asientos_contables.fecha, asientos_contables.numero);

  const data = filas.map((f) => ({
    "Número asiento": f.asiento_numero,
    "Fecha":          f.asiento_fecha,
    "Descripción asiento": f.asiento_descripcion,
    "Origen":         f.asiento_origen,
    "Cuenta código":  f.cuenta_codigo,
    "Cuenta nombre":  f.cuenta_nombre,
    "Detalle línea":  f.linea_descripcion ?? "",
    "Débito":         Number(f.debito),
    "Crédito":        Number(f.credito),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [12, 12, 35, 10, 8, 30, 30, 14, 14].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Libro Diario");
  enviarExcel(res, wb, `libro_diario_${desde ?? hoy}_${hasta ?? hoy}.xlsx`);
});

// GET /api/contabilidad/exportar/balance?corte=
router.get("/exportar/balance", requireAccountingLevel(2), async (req, res) => {
  const corte = (req.query.corte as string | undefined) ?? new Date().toISOString().split("T")[0];

  const filas = await db
    .select({
      tipo: cuentas_contables.tipo,
      codigo: cuentas_contables.codigo,
      nombre: cuentas_contables.nombre,
      naturaleza: cuentas_contables.naturaleza,
      total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
      total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
    })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(and(eq(asientos_contables.tenant_id, req.tenantId), lte(asientos_contables.fecha, corte), or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id))))
    .groupBy(cuentas_contables.tipo, cuentas_contables.codigo, cuentas_contables.nombre, cuentas_contables.naturaleza)
    .orderBy(cuentas_contables.codigo);

  const data = filas.map((f) => {
    const saldo = f.naturaleza === "debito"
      ? Number(f.total_debito) - Number(f.total_credito)
      : Number(f.total_credito) - Number(f.total_debito);
    return {
      "Tipo":    f.tipo.charAt(0).toUpperCase() + f.tipo.slice(1),
      "Código":  f.codigo,
      "Cuenta":  f.nombre,
      "Débitos": Number(f.total_debito),
      "Créditos": Number(f.total_credito),
      "Saldo":   saldo,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [12, 8, 35, 14, 14, 14].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Balance General");
  enviarExcel(res, wb, `balance_general_${corte}.xlsx`);
});

// GET /api/contabilidad/exportar/estado-resultados?desde=&hasta=
router.get("/exportar/estado-resultados", requireAccountingLevel(2), async (req, res) => {
  const hoy = new Date().toISOString().split("T")[0];
  const desde = (req.query.desde as string | undefined) ?? hoy.slice(0, 7) + "-01";
  const hasta = (req.query.hasta as string | undefined) ?? hoy;

  const filas = await db
    .select({
      tipo: cuentas_contables.tipo,
      codigo: cuentas_contables.codigo,
      nombre: cuentas_contables.nombre,
      naturaleza: cuentas_contables.naturaleza,
      total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
      total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
    })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(and(eq(asientos_contables.tenant_id, req.tenantId), gte(asientos_contables.fecha, desde), lte(asientos_contables.fecha, hasta), or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)), sql`${cuentas_contables.tipo} IN ('ingreso', 'costo', 'gasto')`))
    .groupBy(cuentas_contables.tipo, cuentas_contables.codigo, cuentas_contables.nombre, cuentas_contables.naturaleza)
    .orderBy(cuentas_contables.codigo);

  const conSaldo = filas.map((f) => {
    const saldo = f.tipo === "ingreso"
      ? Number(f.total_credito) - Number(f.total_debito)
      : Number(f.total_debito) - Number(f.total_credito);
    return {
      "Tipo":    f.tipo.charAt(0).toUpperCase() + f.tipo.slice(1),
      "Código":  f.codigo,
      "Cuenta":  f.nombre,
      "Total":   saldo,
    };
  });

  const totalIngresos = conSaldo.filter((f) => f["Tipo"] === "Ingreso").reduce((s, f) => s + f["Total"], 0);
  const totalCostos = conSaldo.filter((f) => f["Tipo"] === "Costo").reduce((s, f) => s + f["Total"], 0);
  const totalGastos = conSaldo.filter((f) => f["Tipo"] === "Gasto").reduce((s, f) => s + f["Total"], 0);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(conSaldo);
  ws["!cols"] = [10, 8, 35, 14].map((w) => ({ wch: w }));

  // Fila de utilidad neta al final
  const resumen = [
    { "Tipo": "", "Código": "", "Cuenta": "Total Ingresos", "Total": totalIngresos },
    { "Tipo": "", "Código": "", "Cuenta": "Total Costos", "Total": -totalCostos },
    { "Tipo": "", "Código": "", "Cuenta": "Total Gastos", "Total": -totalGastos },
    { "Tipo": "", "Código": "", "Cuenta": "UTILIDAD NETA", "Total": totalIngresos - totalCostos - totalGastos },
  ];
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, ws, "Estado de Resultados");
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  enviarExcel(res, wb, `estado_resultados_${desde}_${hasta}.xlsx`);
});

export default router;
