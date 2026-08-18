import { Router } from "express";
import { db, cajas_pos, turnos_pos, ventas_pos, items_venta_pos, pagos_venta_pos, productos, movimientos_inventario, bodegas, fiados, items_fiado, abonos_fiado, citas_pos, gastos_caja_pos, devoluciones_pos, resoluciones_dian } from "@workspace/db";
import type { GrameraConfig } from "@workspace/db";
import { eq, and, desc, sql, count, ne, gte, lt, sum, between, inArray } from "drizzle-orm";
import { users } from "@workspace/db";
import { crearAsientoVentaPOS, crearAsientoFiado, crearAsientoAbonoFiado, crearAsientoGastoCaja, crearAsientoDevolucionPOS, crearAsientoAnulacionVentaPOS, verificarPeriodoAbierto } from "../services/contabilidad.service.js";
import { siguienteConsecutivo } from "../services/consecutivo.service.js";
import Anthropic from "@anthropic-ai/sdk";
import { completarIdempotencia, reservarIdempotencia } from "../services/idempotency.service.js";
import { buildItems, calcularTotalesPlemsi, emitirDocumentoPOS, metodoPagoId } from "../services/plemsi.service.js";
import { getPlemsiCredentials, PlemsiNotConfiguredError } from "../services/get-plemsi-credentials.js";

const router = Router();
const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"] as const;

/** Un cajero solo puede operar el turno que abrió; administración conserva supervisión total. */
function puedeOperarTurno(req: { userId: string; userRole: string }, turno: { usuario_id: string }) {
  return req.userRole === "admin" || turno.usuario_id === req.userId;
}

function puedeOperarDian(req: { userRole: string; userDian?: boolean }) {
  return req.userRole === "admin" || req.userRole === "vendedor" || (req.userRole === "contador" && req.userDian === true);
}

function puedeAdministrarPOS(req: { userRole: string }) {
  return req.userRole === "admin";
}

// ── Cajas ─────────────────────────────────────────────────────────────────────

router.get("/cajas", async (req, res) => {
  const rows = await db
    .select()
    .from(cajas_pos)
    .where(eq(cajas_pos.tenant_id, req.tenantId))
    .orderBy(cajas_pos.nombre);
  res.json(rows);
});

router.post("/cajas", async (req, res) => {
  if (!puedeAdministrarPOS(req)) return res.status(403).json({ error: "Solo administración puede crear cajas POS." });
  const { nombre, descripcion } = req.body as { nombre?: string; descripcion?: string };
  if (!nombre) return res.status(400).json({ error: "Campo requerido: nombre." });

  // Plan "punto" solo permite 1 caja; "punto_plus" es ilimitado
  const tieneMultiCaja = req.tenant.plan.features?.pos_multi_caja ||
    (req.tenant.addons as Record<string, boolean> | null)?.pos_multi_caja;

  if (!tieneMultiCaja) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(cajas_pos)
      .where(and(eq(cajas_pos.tenant_id, req.tenantId), eq(cajas_pos.activo, true)));

    if (Number(total) >= 1) {
      return res.status(403).json({
        error: "Tu plan solo permite 1 caja activa. Actualiza a Punto Plus para agregar más cajas.",
        code: "PLAN_FEATURE_NOT_INCLUDED",
        upgrade_required: true,
      });
    }
  }

  const [nueva] = await db
    .insert(cajas_pos)
    .values({ tenant_id: req.tenantId, nombre, descripcion: descripcion ?? null })
    .returning();
  res.status(201).json(nueva);
});

router.patch("/cajas/:id", async (req, res) => {
  if (!puedeAdministrarPOS(req)) return res.status(403).json({ error: "Solo administración puede modificar cajas POS." });
  const { nombre, descripcion, activo, config } = req.body as {
    nombre?: string; descripcion?: string; activo?: boolean; config?: Record<string, unknown>;
  };
  const updates: Record<string, unknown> = {};
  if (nombre !== undefined) updates.nombre = nombre;
  if (descripcion !== undefined) updates.descripcion = descripcion;
  if (activo !== undefined) updates.activo = activo;
  if (config !== undefined) updates.config = config;

  const [updated] = await db
    .update(cajas_pos)
    .set(updates)
    .where(and(eq(cajas_pos.id, req.params.id), eq(cajas_pos.tenant_id, req.tenantId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Caja no encontrada." });
  res.json(updated);
});

// ── Detectar protocolo de gramera con IA ──────────────────────────────────────

router.post("/cajas/:id/gramera-detectar", async (req, res) => {
  if (!puedeAdministrarPOS(req)) return res.status(403).json({ error: "Solo administración puede configurar una gramera." });
  const { marca, modelo } = req.body as { marca?: string; modelo?: string };
  if (!marca || !modelo) {
    return res.status(400).json({ error: "Se requieren marca y modelo de la gramera." });
  }

  const [caja] = await db
    .select()
    .from(cajas_pos)
    .where(and(eq(cajas_pos.id, req.params.id), eq(cajas_pos.tenant_id, req.tenantId)));
  if (!caja) return res.status(404).json({ error: "Caja no encontrada." });

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Eres un experto en integración de básculas/grameras de punto de venta.

Dado el siguiente equipo: ${marca} ${modelo}

Determina cómo se conecta esta báscula a un computador y devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:

{
  "tipo": "serial" o "keyboard",
  "baudRate": número (solo si tipo es serial, ej: 9600),
  "dataBits": 7 u 8 (solo si tipo es serial),
  "stopBits": 1 o 2 (solo si tipo es serial),
  "parity": "none", "even" u "odd" (solo si tipo es serial),
  "regex": "expresión regular para extraer el peso numérico del string de la báscula",
  "unidad": "kg", "g" o "lb",
  "nota": "breve explicación del protocolo"
}

Reglas:
- "keyboard": la báscula emula teclado y envía el peso + Enter (común en básculas USB económicas)
- "serial": usa puerto serial RS-232 o USB-Serial con protocolo propietario
- El regex debe capturar solo el número (ej: para "   2.450 Kg\\r\\n" el regex sería "(\\d+\\.?\\d*)")
- Si no conoces el modelo exacto, usa el tipo más común para esa marca
- Responde SOLO el JSON, sin texto adicional`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "La IA no devolvió un protocolo válido." });

    const protocolo = JSON.parse(jsonMatch[0]) as Partial<GrameraConfig> & { nota?: string };

    const grameraConfig: GrameraConfig = {
      habilitada: true,
      marca,
      modelo,
      tipo: protocolo.tipo ?? "serial",
      baudRate: protocolo.baudRate,
      dataBits: protocolo.dataBits,
      stopBits: protocolo.stopBits,
      parity: protocolo.parity,
      regex: protocolo.regex ?? "(\\d+\\.?\\d*)",
      unidad: protocolo.unidad ?? "kg",
    };

    const configActual = caja.config ?? {};
    const [updated] = await db
      .update(cajas_pos)
      .set({ config: { ...configActual, gramera: grameraConfig } })
      .where(eq(cajas_pos.id, caja.id))
      .returning();

    res.json({ config: updated.config, nota: protocolo.nota ?? "" });
  } catch (err) {
    console.error("[gramera-detectar]", err);
    res.status(500).json({ error: "Error al consultar la IA. Verifica la clave API." });
  }
});

// ── Turnos ────────────────────────────────────────────────────────────────────

router.get("/turnos/activos", async (req, res) => {
  const rows = await db
    .select()
    .from(turnos_pos)
    .where(and(eq(turnos_pos.tenant_id, req.tenantId), eq(turnos_pos.estado, "abierto")));
  res.json(rows);
});

router.get("/turnos", async (req, res) => {
  const rows = await db
    .select()
    .from(turnos_pos)
    .where(eq(turnos_pos.tenant_id, req.tenantId))
    .orderBy(desc(turnos_pos.apertura_at))
    .limit(50);
  res.json(rows);
});

router.post("/turnos", async (req, res) => {
  const { caja_id, monto_inicial, bodega_id } = req.body as {
    caja_id?: string;
    monto_inicial?: number;
    bodega_id?: string;
  };
  if (!caja_id) return res.status(400).json({ error: "Campo requerido: caja_id." });

  // Verifica que la caja sea del tenant
  const [caja] = await db
    .select()
    .from(cajas_pos)
    .where(and(eq(cajas_pos.id, caja_id), eq(cajas_pos.tenant_id, req.tenantId)));
  if (!caja) return res.status(404).json({ error: "Caja no encontrada." });

  // Solo un turno abierto por caja
  const [turnoExistente] = await db
    .select()
    .from(turnos_pos)
    .where(and(eq(turnos_pos.caja_id, caja_id), eq(turnos_pos.estado, "abierto")));
  if (turnoExistente) {
    return res.status(409).json({
      error: "Esta caja ya tiene un turno abierto. Ciérralo antes de abrir uno nuevo.",
      turno: turnoExistente,
    });
  }

  // Determinar bodega: usar la enviada si existe y pertenece al tenant; si no, la primera activa
  let bodegaFinal: string | null = null;
  if (bodega_id) {
    const [bod] = await db
      .select({ id: bodegas.id })
      .from(bodegas)
      .where(and(eq(bodegas.id, bodega_id), eq(bodegas.tenant_id, req.tenantId), eq(bodegas.activo, true)));
    if (!bod) return res.status(404).json({ error: "Bodega no encontrada o inactiva." });
    bodegaFinal = bod.id;
  } else {
    const [bodPrincipal] = await db
      .select({ id: bodegas.id })
      .from(bodegas)
      .where(and(eq(bodegas.tenant_id, req.tenantId), eq(bodegas.activo, true)))
      .limit(1);
    bodegaFinal = bodPrincipal?.id ?? null;
  }

  const [turno] = await db
    .insert(turnos_pos)
    .values({
      tenant_id: req.tenantId,
      caja_id,
      bodega_id: bodegaFinal,
      usuario_id: req.userId,
      monto_inicial: String(monto_inicial ?? 0),
    })
    .returning();
  res.status(201).json(turno);
});

router.patch("/turnos/:id/cerrar", async (req, res) => {
  const { monto_final_declarado, notas_cierre, arqueo_efectivo } = req.body as {
    monto_final_declarado?: number;
    notas_cierre?: string;
    arqueo_efectivo?: Record<string, unknown>;
  };
  const denominacionesValidas = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];
  let totalArqueo: number | null = null;
  let arqueoNormalizado: Record<string, number> | null = null;

  if (arqueo_efectivo !== undefined) {
    if (!arqueo_efectivo || typeof arqueo_efectivo !== "object" || Array.isArray(arqueo_efectivo)) {
      return res.status(400).json({ error: "El arqueo de efectivo no es válido." });
    }
    arqueoNormalizado = {};
    totalArqueo = 0;
    for (const denominacion of denominacionesValidas) {
      const cantidad = arqueo_efectivo[String(denominacion)] ?? 0;
      if (!Number.isInteger(cantidad) || (cantidad as number) < 0) {
        return res.status(400).json({ error: `La cantidad para $${denominacion} debe ser un entero igual o mayor que cero.` });
      }
      arqueoNormalizado[String(denominacion)] = cantidad as number;
      totalArqueo += denominacion * (cantidad as number);
    }
  } else if (monto_final_declarado !== undefined && (!Number.isFinite(monto_final_declarado) || monto_final_declarado < 0)) {
    return res.status(400).json({ error: "El monto final declarado no es válido." });
  }
  const [turno] = await db.select().from(turnos_pos)
    .where(and(eq(turnos_pos.id, req.params.id), eq(turnos_pos.tenant_id, req.tenantId)));
  if (!turno) return res.status(404).json({ error: "Turno no encontrado." });
  if (!puedeOperarTurno(req, turno)) return res.status(403).json({ error: "Solo puedes cerrar tu propio turno.", code: "POS_TURNO_FORBIDDEN" });
  if (turno.estado === "cerrado") return res.status(400).json({ error: "El turno ya está cerrado." });
  const [cerrado] = await db.update(turnos_pos).set({
    estado: "cerrado", cierre_at: new Date(),
    monto_final_declarado: totalArqueo !== null ? String(totalArqueo) : monto_final_declarado !== undefined ? String(monto_final_declarado) : null,
    arqueo_efectivo: arqueoNormalizado,
    notas_cierre: notas_cierre ?? null,
  }).where(eq(turnos_pos.id, turno.id)).returning();
  res.json(cerrado);
});

// ── Productos (para el POS) ───────────────────────────────────────────────────

router.get("/productos", async (req, res) => {
  const rows = await db
    .select({
      id: productos.id,
      codigo: productos.codigo,
      nombre: productos.nombre,
      categoria: productos.categoria,
      imagen_url: productos.imagen_url,
      precio_venta: productos.precio_venta,
      iva_pct: productos.iva_pct,
      tipo: productos.tipo,
      unidad: productos.unidad,
      stock_actual: productos.stock_actual,
    })
    .from(productos)
    .where(and(eq(productos.tenant_id, req.tenantId), eq(productos.activo, true)))
    .orderBy(productos.nombre);
  res.json(rows);
});

// ── Ventas ────────────────────────────────────────────────────────────────────

router.get("/ventas", async (req, res) => {
  const { turno_id } = req.query as { turno_id?: string };
  const where = turno_id
    ? and(eq(ventas_pos.tenant_id, req.tenantId), eq(ventas_pos.turno_id, turno_id))
    : eq(ventas_pos.tenant_id, req.tenantId);

  const rows = await db
    .select()
    .from(ventas_pos)
    .where(where)
    .orderBy(desc(ventas_pos.created_at))
    .limit(100);
  res.json(rows);
});

router.get("/ventas/:id", async (req, res) => {
  const [venta] = await db
    .select()
    .from(ventas_pos)
    .where(and(eq(ventas_pos.id, req.params.id), eq(ventas_pos.tenant_id, req.tenantId)));
  if (!venta) return res.status(404).json({ error: "Venta no encontrada." });

  const items = await db
    .select()
    .from(items_venta_pos)
    .where(eq(items_venta_pos.venta_id, venta.id));

  const pagos = await db.select().from(pagos_venta_pos).where(eq(pagos_venta_pos.venta_id, venta.id));
  res.json({ ...venta, items, pagos });
});

router.post("/ventas", async (req, res) => {
  const { turno_id, caja_id, cliente_id, nombre_cliente, metodo_pago, monto_recibido, observaciones, pagos, items } =
    req.body as {
      turno_id: string;
      caja_id: string;
      cliente_id?: string;
      nombre_cliente?: string;
      metodo_pago: string;
      monto_recibido?: number;
      pagos?: Array<{ metodo_pago: string; monto: number }>;
      observaciones?: string;
      items: Array<{
      producto_id?: string;
      descripcion?: string;
        cantidad: number;
      precio_unitario?: number;
      descuento_pct?: number;
      iva_pct?: number;
        impoconsumo_pct?: number;
      subtotal?: number;
      iva_valor?: number;
        impoconsumo_valor?: number;
      total?: number;
      }>;
    };

  if (!turno_id) return res.status(400).json({ error: "Campo requerido: turno_id." });
  if (!caja_id)  return res.status(400).json({ error: "Campo requerido: caja_id." });
  if (!metodo_pago) return res.status(400).json({ error: "Campo requerido: metodo_pago (efectivo|tarjeta|transferencia|nequi|daviplata)." });
  if (!items?.length) return res.status(400).json({ error: "La venta debe tener al menos un ítem." });
  if (!METODOS_PAGO.includes(metodo_pago as typeof METODOS_PAGO[number])) {
    return res.status(400).json({ error: "Método de pago no válido." });
  }
  if (pagos !== undefined) {
    if (!Array.isArray(pagos) || pagos.length === 0) return res.status(400).json({ error: "pagos debe incluir al menos un método de pago." });
    for (const pago of pagos) {
      if (!METODOS_PAGO.includes(pago.metodo_pago as typeof METODOS_PAGO[number]) || !Number.isFinite(pago.monto) || pago.monto <= 0) {
        return res.status(400).json({ error: "Cada pago debe tener un método válido y un monto mayor que cero." });
      }
    }
  }

  for (const [i, item] of items.entries()) {
    if (!item.producto_id) return res.status(400).json({ error: `items[${i}].producto_id es requerido.` });
    if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) return res.status(400).json({ error: `items[${i}].cantidad debe ser un número mayor que cero.` });
    if (item.descuento_pct !== undefined && (!Number.isFinite(item.descuento_pct) || item.descuento_pct < 0 || item.descuento_pct > 100)) {
      return res.status(400).json({ error: `items[${i}].descuento_pct debe estar entre 0 y 100.` });
    }
  }
  if (monto_recibido !== undefined && (!Number.isFinite(monto_recibido) || monto_recibido < 0)) {
    return res.status(400).json({ error: "monto_recibido debe ser un número válido." });
  }

  try {
    await verificarPeriodoAbierto(req.tenantId, new Date());
  } catch (err) {
    return res.status(422).json({ error: (err as Error).message });
  }

  const reserva = await reservarIdempotencia(req.tenantId, "pos.venta", req.header("Idempotency-Key"));
  if (reserva?.estado === "completada") return res.status(201).json(reserva.respuesta);
  if (reserva?.estado === "procesando") {
    return res.status(409).json({ error: "Esta venta ya se está procesando. Espera unos segundos antes de reintentar.", code: "IDEMPOTENCY_IN_PROGRESS" });
  }

  try {

  // Verifica turno abierto
  const [turno] = await db
    .select()
    .from(turnos_pos)
    .where(and(eq(turnos_pos.id, turno_id), eq(turnos_pos.tenant_id, req.tenantId), eq(turnos_pos.estado, "abierto")));
  if (!turno) return res.status(400).json({ error: "El turno no está abierto." });
  if (!puedeOperarTurno(req, turno)) return res.status(403).json({ error: "No puedes registrar ventas en el turno de otro usuario.", code: "POS_TURNO_FORBIDDEN" });
  if (turno.caja_id !== caja_id) return res.status(400).json({ error: "La caja no corresponde al turno abierto." });

  // Genera consecutivo con bloqueo para evitar duplicados en inserciones concurrentes
  const consecutivo = await siguienteConsecutivo("ventas_pos", "consecutivo", req.tenantId);
  const numero = `POS-${String(consecutivo).padStart(6, "0")}`;

  let impoconsumo_total = 0;
  const result = await db.transaction(async (tx) => {
    // Los precios e impuestos no se aceptan desde el navegador: se consultan de
    // nuevo en la base de datos del tenant antes de registrar la venta.
    const productosVenta = await Promise.all(items.map(async (item) => {
      const [producto] = await tx
        .select()
        .from(productos)
        .where(and(
          eq(productos.id, item.producto_id!),
          eq(productos.tenant_id, req.tenantId),
          eq(productos.activo, true),
        ))
        .limit(1);
      if (!producto || producto.precio_venta === null) {
        throw new Error("Uno de los productos ya no está disponible para la venta.");
      }

      const descuento_pct = Number(item.descuento_pct ?? 0);
      const precio_unitario = Number(producto.precio_venta);
      const subtotal = item.cantidad * precio_unitario * (1 - descuento_pct / 100);
      const iva_valor = subtotal * (Number(producto.iva_pct) / 100);
      const impoconsumo_valor = subtotal * (Number(producto.impoconsumo_pct ?? 0) / 100);

      return {
        producto,
        cantidad: item.cantidad,
        descuento_pct,
        precio_unitario,
        subtotal,
        iva_valor,
        impoconsumo_valor,
        total: subtotal + iva_valor + impoconsumo_valor,
      };
    }));

    const subtotal = productosVenta.reduce((s, i) => s + i.subtotal, 0);
    const iva_total = productosVenta.reduce((s, i) => s + i.iva_valor, 0);
    impoconsumo_total = productosVenta.reduce((s, i) => s + i.impoconsumo_valor, 0);
    const total = productosVenta.reduce((s, i) => s + i.total, 0);
    const descuento_total = productosVenta.reduce((s, i) => s + (i.cantidad * i.precio_unitario * (i.descuento_pct / 100)), 0);

    const pagosFinales = pagos?.map((p) => ({ metodo_pago: p.metodo_pago as typeof METODOS_PAGO[number], monto: p.monto }))
      ?? [{ metodo_pago: metodo_pago as typeof METODOS_PAGO[number], monto: total }];
    const totalPagos = pagosFinales.reduce((s, p) => s + p.monto, 0);
    if (Math.abs(totalPagos - total) > 0.01) throw new Error("La suma de los métodos de pago debe ser igual al total de la venta.");
    const metodoRegistrado = pagosFinales.length > 1 ? "mixto" : pagosFinales[0].metodo_pago;
    const pagoUnicoEnEfectivo = pagosFinales.length === 1 && pagosFinales[0].metodo_pago === "efectivo";

    // El monto recibido es opcional: si no se registra, la venta se cobra por
    // su total. Si se registra efectivo, el servidor determina el vuelto y no
    // acepta un valor de vuelto calculado por el navegador.
    if (monto_recibido !== undefined && !pagoUnicoEnEfectivo) {
      throw new Error("El monto recibido solo aplica para pagos únicos en efectivo.");
    }
    if (pagoUnicoEnEfectivo && monto_recibido !== undefined && monto_recibido < total) {
      throw new Error("El monto recibido no puede ser menor al total de la venta.");
    }
    const montoRecibidoFinal = pagoUnicoEnEfectivo && monto_recibido !== undefined ? monto_recibido : null;
    const vueltoFinal = montoRecibidoFinal === null ? null : montoRecibidoFinal - total;

    const [venta] = await tx
      .insert(ventas_pos)
      .values({
        tenant_id: req.tenantId,
        turno_id,
        caja_id,
        numero,
        consecutivo,
        cliente_id: cliente_id ?? null,
        nombre_cliente: nombre_cliente ?? null,
        subtotal: String(subtotal),
        descuento_total: String(descuento_total),
        iva_total: String(iva_total),
        total: String(total),
        metodo_pago: metodoRegistrado,
        monto_recibido: montoRecibidoFinal === null ? null : String(montoRecibidoFinal),
        vuelto: vueltoFinal === null ? null : String(vueltoFinal),
        observaciones: observaciones ?? null,
      })
      .returning();

    await tx.insert(pagos_venta_pos).values(pagosFinales.map((p) => ({ venta_id: venta.id, ...p, monto: String(p.monto) })));

    await tx.insert(items_venta_pos).values(
      productosVenta.map((i) => ({
        venta_id: venta.id,
        producto_id: i.producto.id,
        descripcion: i.producto.nombre,
        cantidad: String(i.cantidad),
        precio_unitario: String(i.precio_unitario),
        descuento_pct: String(i.descuento_pct),
        iva_pct: String(i.producto.iva_pct),
        impoconsumo_pct: String(i.producto.impoconsumo_pct ?? 0),
        impoconsumo_valor: String(i.impoconsumo_valor),
        subtotal: String(i.subtotal),
        iva_valor: String(i.iva_valor),
        total: String(i.total),
      }))
    );

    // Descuenta inventario usando la bodega del turno activo (multi-bodega)
    // Si el turno no tiene bodega asignada, se usa la primera bodega activa del tenant
    let bodegaIdParaInventario = turno.bodega_id;
    if (!bodegaIdParaInventario) {
      const [bodPrincipal] = await tx
        .select({ id: bodegas.id })
        .from(bodegas)
        .where(and(eq(bodegas.tenant_id, req.tenantId), eq(bodegas.activo, true)))
        .limit(1);
      bodegaIdParaInventario = bodPrincipal?.id ?? null;
    }

    if (bodegaIdParaInventario) {
      for (const item of productosVenta) {
        if (item.producto.tipo === "servicio") continue;
        const permiteInventarioNegativo = req.tenant.pos_config?.permitir_inventario_negativo === true;
        // El saldo se valida en la bodega del turno, no solo en el total de la
        // empresa. El lock evita que dos cajas gasten el mismo saldo local.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`stock_${req.tenantId}_${bodegaIdParaInventario}_${item.producto.id}`}))`);
        if (!permiteInventarioNegativo) {
          const saldoRows = await tx.execute(sql`
            SELECT COALESCE(SUM(CASE
              WHEN tipo = 'salida' THEN -cantidad
              ELSE cantidad
            END), 0) AS saldo
            FROM movimientos_inventario
            WHERE tenant_id = ${req.tenantId}
              AND bodega_id = ${bodegaIdParaInventario}
              AND producto_id = ${item.producto.id}
          `) as unknown as Array<{ saldo: number | string }>;
          if (Number(saldoRows[0]?.saldo ?? 0) < Number(item.cantidad)) {
            throw new Error(`Stock insuficiente para ${item.producto.nombre} en la bodega del turno.`);
          }
        }
        const condicionStock = permiteInventarioNegativo
          ? and(eq(productos.id, item.producto.id), eq(productos.tenant_id, req.tenantId))
          : and(
              eq(productos.id, item.producto.id),
              eq(productos.tenant_id, req.tenantId),
              sql`COALESCE(${productos.stock_actual}, 0) >= ${Number(item.cantidad)}`,
            );
        const descontado = await tx
          .update(productos)
          .set({ stock_actual: sql`COALESCE(stock_actual, 0) - ${Number(item.cantidad)}` })
          .where(condicionStock)
          .returning({ id: productos.id });

        // La condición forma parte del UPDATE (no de una lectura previa): dos
        // cajeros no pueden vender simultáneamente más unidades de las que hay.
        // Al lanzar dentro de la transacción se revierte también la venta e ítems.
        if (!permiteInventarioNegativo && descontado.length !== 1) {
          throw new Error(`Stock insuficiente para ${item.producto.nombre}.`);
        }

        await tx.insert(movimientos_inventario).values({
          tenant_id: req.tenantId,
          producto_id: item.producto.id,
          bodega_id: bodegaIdParaInventario,
          tipo: "salida",
          cantidad: String(item.cantidad),
          costo_unitario: String(item.precio_unitario),
          referencia_tipo: "factura",
          referencia_id: venta.id,
          observaciones: `Venta POS ${numero}`,
        });
      }
    }

    // Actualiza total del turno
    await tx
      .update(turnos_pos)
      .set({ total_ventas: sql`total_ventas + ${total}` })
      .where(eq(turnos_pos.id, turno_id));

    return venta;
  });

  // Asiento contable — fuera de la tx de inventario para no bloquearla si el tenant
  // no tiene cuentas configuradas (plan sin contabilidad)
  try {
    const asientoId = await crearAsientoVentaPOS(req.tenantId, result, impoconsumo_total);
    await db.update(ventas_pos).set({ asiento_id: asientoId }).where(eq(ventas_pos.id, result.id));
    result.asiento_id = asientoId;
  } catch (err) {
    console.error("Error al crear asiento de venta POS:", err);
  }

  await completarIdempotencia(req.tenantId, "pos.venta", reserva?.estado === "nueva" ? reserva.clave : undefined, result as unknown as Record<string, unknown>);
  res.status(201).json(result);

  } catch (err) {
    console.error("[POS POST /ventas]", err);
    // Las validaciones que dependen del estado transaccional (stock,
    // disponibilidad del producto y suma de pagos) deben llegar al cajero
    // como una corrección accionable, no como un error genérico del servidor.
    const message = err instanceof Error ? err.message : "";
    const esErrorOperativo = [
      "Uno de los productos ya no está disponible para la venta.",
      "La suma de los métodos de pago debe ser igual al total de la venta.",
      "El monto recibido solo aplica para pagos únicos en efectivo.",
      "El monto recibido no puede ser menor al total de la venta.",
    ].includes(message) || message.startsWith("Stock insuficiente para ");
    res.status(esErrorOperativo ? 422 : 500).json({
      error: esErrorOperativo ? message : "Error al registrar la venta. Inténtalo de nuevo.",
    });
  }
});

// ── Resumen turno ─────────────────────────────────────────────────────────────

router.get("/turnos/:id/resumen", async (req, res) => {
  try {
    const [turno] = await db
      .select()
      .from(turnos_pos)
      .where(and(eq(turnos_pos.id, req.params.id), eq(turnos_pos.tenant_id, req.tenantId)));
    if (!turno) return res.status(404).json({ error: "Turno no encontrado." });

    // Ejecutar queries en paralelo donde no hay dependencia
    const [ventasTurno, gastosCaja, devolucionesTurno] = await Promise.all([
      db.select().from(ventas_pos)
        .where(and(eq(ventas_pos.turno_id, turno.id), eq(ventas_pos.estado, "completada"))),
      db.select().from(gastos_caja_pos)
        .where(eq(gastos_caja_pos.turno_id, turno.id)),
      db.select().from(devoluciones_pos)
        .where(eq(devoluciones_pos.turno_id, turno.id)),
    ]);

    // Ítems de todas las ventas del turno (para top productos)
    const ventaIds = ventasTurno.map((v) => v.id);
    let itemsTurno: Array<{ descripcion: string; cantidad: string; total: string; iva_valor: string; descuento_pct: string; precio_unitario: string; }> = [];
    let pagosTurno: Array<{ venta_id: string; metodo_pago: string; monto: string }> = [];
    if (ventaIds.length > 0) {
      [itemsTurno, pagosTurno] = await Promise.all([
        db
          .select({
            descripcion: items_venta_pos.descripcion,
            cantidad: items_venta_pos.cantidad,
            total: items_venta_pos.total,
            iva_valor: items_venta_pos.iva_valor,
            descuento_pct: items_venta_pos.descuento_pct,
            precio_unitario: items_venta_pos.precio_unitario,
          })
          .from(items_venta_pos)
          .where(inArray(items_venta_pos.venta_id, ventaIds)),
        db
          .select({
            venta_id: pagos_venta_pos.venta_id,
            metodo_pago: pagos_venta_pos.metodo_pago,
            monto: pagos_venta_pos.monto,
          })
          .from(pagos_venta_pos)
          .where(inArray(pagos_venta_pos.venta_id, ventaIds)),
      ]);
    }

    // Agregar por producto
    const productosMap: Record<string, { descripcion: string; cantidad: number; total: number }> = {};
    for (const it of itemsTurno) {
      if (!productosMap[it.descripcion]) productosMap[it.descripcion] = { descripcion: it.descripcion, cantidad: 0, total: 0 };
      productosMap[it.descripcion].cantidad += Number(it.cantidad);
      productosMap[it.descripcion].total += Number(it.total);
    }
    const topProductos = Object.values(productosMap).sort((a, b) => b.cantidad - a.cantidad).slice(0, 8);

    // Ventas por hora
    const ventasPorHora: Record<number, { cantidad: number; total: number }> = {};
    for (const v of ventasTurno) {
      const hora = new Date(v.created_at).getHours();
      if (!ventasPorHora[hora]) ventasPorHora[hora] = { cantidad: 0, total: 0 };
      ventasPorHora[hora].cantidad += 1;
      ventasPorHora[hora].total += Number(v.total);
    }
    const porHora = Object.entries(ventasPorHora).map(([h, d]) => ({ hora: Number(h), ...d })).sort((a, b) => a.hora - b.hora);

    // Las ventas nuevas pueden tener pagos mixtos. Las anteriores a este
    // desglose conservan su único método directamente en la venta.
    const pagosPorVenta = new Map<string, Array<{ metodo_pago: string; monto: string }>>();
    for (const pago of pagosTurno) {
      const pagos = pagosPorVenta.get(pago.venta_id) ?? [];
      pagos.push(pago);
      pagosPorVenta.set(pago.venta_id, pagos);
    }

    const porMetodo: Record<string, number> = {};
    for (const v of ventasTurno) {
      const desglose = pagosPorVenta.get(v.id) ?? [{ metodo_pago: v.metodo_pago, monto: v.total }];
      for (const pago of desglose) {
        porMetodo[pago.metodo_pago] = (porMetodo[pago.metodo_pago] ?? 0) + Number(pago.monto);
      }
    }

    const totalVentas = ventasTurno.reduce((s, v) => s + Number(v.total), 0);
    const ivaRecaudado = itemsTurno.reduce((s, i) => s + Number(i.iva_valor), 0);
    const descuentoTotal = itemsTurno.reduce(
      (s, i) => s + Number(i.cantidad) * Number(i.precio_unitario) * (Number(i.descuento_pct) / 100), 0
    );

    const devolucionesPorMetodo: Record<string, number> = {};
    for (const devolucion of devolucionesTurno) {
      devolucionesPorMetodo[devolucion.metodo_devolucion] =
        (devolucionesPorMetodo[devolucion.metodo_devolucion] ?? 0) + Number(devolucion.monto_devuelto);
    }

    res.json({
      turno,
      total_ventas: totalVentas,
      cantidad_ventas: ventasTurno.length,
      ticket_promedio: ventasTurno.length > 0 ? totalVentas / ventasTurno.length : 0,
      iva_recaudado: ivaRecaudado,
      descuento_total: descuentoTotal,
      por_metodo: porMetodo,
      top_productos: topProductos,
      por_hora: porHora,
      gastos_caja: gastosCaja,
      total_gastos_caja: gastosCaja.reduce((s, g) => s + Number(g.monto), 0),
      devoluciones: devolucionesTurno,
      total_devoluciones: devolucionesTurno.reduce((s, d) => s + Number(d.monto_devuelto), 0),
      devoluciones_por_metodo: devolucionesPorMetodo,
      total_devoluciones_efectivo: devolucionesPorMetodo.efectivo ?? 0,
    });
  } catch (err) {
    console.error("[resumen-turno] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Error al cargar el resumen del turno." });
  }
});

// ── Gastos de caja chica ──────────────────────────────────────────────────────

router.get("/gastos-caja", async (req, res) => {
  const { turno_id } = req.query as { turno_id?: string };
  const conditions = [eq(gastos_caja_pos.tenant_id, req.tenantId)];
  if (turno_id) conditions.push(eq(gastos_caja_pos.turno_id, turno_id));
  const rows = await db
    .select()
    .from(gastos_caja_pos)
    .where(and(...conditions))
    .orderBy(desc(gastos_caja_pos.created_at));
  res.json(rows);
});

router.post("/gastos-caja", async (req, res) => {
  const { turno_id, caja_id, monto, concepto, descripcion } = req.body as {
    turno_id: string; caja_id: string; monto: number;
    concepto?: string; descripcion?: string;
  };
  if (!turno_id || !caja_id || !Number.isFinite(monto) || monto <= 0) {
    return res.status(400).json({ error: "turno_id, caja_id y monto son requeridos." });
  }

  try {
    const [turno] = await db.select().from(turnos_pos)
      .where(and(eq(turnos_pos.id, turno_id), eq(turnos_pos.tenant_id, req.tenantId)));
    if (!turno || turno.estado !== "abierto") {
      return res.status(400).json({ error: "El turno no está abierto." });
    }

    if (!puedeOperarTurno(req, turno)) {
      return res.status(403).json({ error: "No puedes registrar gastos en el turno de otro usuario.", code: "POS_TURNO_FORBIDDEN" });
    }
    if (turno.caja_id !== caja_id) return res.status(400).json({ error: "La caja no corresponde al turno abierto." });

    const [gasto] = await db.insert(gastos_caja_pos).values({
      tenant_id: req.tenantId,
      turno_id,
      caja_id,
      usuario_id: req.userId,
      monto: String(monto),
      concepto: (concepto ?? "otros") as "otros",
      descripcion: descripcion ?? null,
    }).returning();

    try {
      const asientoId = await crearAsientoGastoCaja(req.tenantId, gasto);
      await db.update(gastos_caja_pos).set({ asiento_id: asientoId }).where(eq(gastos_caja_pos.id, gasto.id));
      gasto.asiento_id = asientoId;
    } catch {
      // asiento falla silenciosamente — el gasto queda registrado
    }

    res.status(201).json(gasto);
  } catch (err) {
    console.error("[POST gastos-caja]", err);
    res.status(500).json({ error: "Error al registrar el gasto." });
  }
});

// ── Devoluciones POS ──────────────────────────────────────────────────────────

router.get("/devoluciones", async (req, res) => {
  const { venta_id } = req.query as { venta_id?: string };
  const conditions = [eq(devoluciones_pos.tenant_id, req.tenantId)];
  if (venta_id) conditions.push(eq(devoluciones_pos.venta_id, venta_id));
  const rows = await db
    .select()
    .from(devoluciones_pos)
    .where(and(...conditions))
    .orderBy(desc(devoluciones_pos.created_at));
  res.json(rows);
});

router.post("/devoluciones", async (req, res) => {
  const { venta_id, monto_devuelto, motivo, metodo_devolucion } = req.body as {
    venta_id: string; monto_devuelto: number; motivo?: string; metodo_devolucion?: string;
  };
  if (!venta_id || !monto_devuelto || monto_devuelto <= 0) {
    return res.status(400).json({ error: "venta_id y monto_devuelto son requeridos." });
  }
  if (metodo_devolucion !== undefined && !METODOS_PAGO.includes(metodo_devolucion as typeof METODOS_PAGO[number])) {
    return res.status(400).json({ error: "El método de devolución no es válido." });
  }

  try {
    const [venta] = await db.select().from(ventas_pos)
      .where(and(eq(ventas_pos.id, venta_id), eq(ventas_pos.tenant_id, req.tenantId)));
    if (!venta) return res.status(404).json({ error: "Venta no encontrada." });
    if (venta.estado === "anulada") return res.status(400).json({ error: "Esta venta ya fue anulada." });

    // Verificar que el turno de la venta esté abierto (devolución en el mismo turno o uno posterior)
    const [turno] = await db.select().from(turnos_pos)
      .where(and(eq(turnos_pos.id, venta.turno_id), eq(turnos_pos.tenant_id, req.tenantId)));
    if (!turno) return res.status(400).json({ error: "Turno original no encontrado." });

    // Buscar turno abierto actual para la caja
    const [turnoAbierto] = await db.select().from(turnos_pos)
      .where(and(
        eq(turnos_pos.caja_id, venta.caja_id),
        eq(turnos_pos.tenant_id, req.tenantId),
        eq(turnos_pos.estado, "abierto"),
      ));
    if (!turnoAbierto) return res.status(422).json({ error: "Abre un turno en esta caja antes de registrar una devolución." });
    if (!puedeOperarTurno(req, turnoAbierto)) {
      return res.status(403).json({ error: "No puedes registrar devoluciones en el turno de otro usuario.", code: "POS_TURNO_FORBIDDEN" });
    }

    const devolucion = await db.transaction(async (tx) => {
      // Serializa devoluciones de una venta para impedir reembolsos acumulados excesivos.
      await tx.execute(sql`SELECT id FROM ventas_pos WHERE id = ${venta.id} FOR UPDATE`);
      const [{ totalDevuelto }] = await tx
        .select({ totalDevuelto: sql<string>`coalesce(sum(${devoluciones_pos.monto_devuelto}), 0)` })
        .from(devoluciones_pos)
        .where(and(
          eq(devoluciones_pos.tenant_id, req.tenantId),
          eq(devoluciones_pos.venta_id, venta_id),
        ));
      if (monto_devuelto > Number(venta.total) - Number(totalDevuelto)) return null;
      const [creada] = await tx.insert(devoluciones_pos).values({
        tenant_id: req.tenantId,
        venta_id,
        turno_id: turnoAbierto.id,
        usuario_id: req.userId,
        monto_devuelto: String(monto_devuelto),
        metodo_devolucion: metodo_devolucion ?? "efectivo",
        motivo: motivo ?? null,
      }).returning();
      return creada;
    });
    if (!devolucion) return res.status(400).json({ error: "El monto devuelto supera el saldo disponible de esta venta." });

    try {
      const asientoId = await crearAsientoDevolucionPOS(req.tenantId, devolucion);
      await db.update(devoluciones_pos).set({ asiento_id: asientoId }).where(eq(devoluciones_pos.id, devolucion.id));
      devolucion.asiento_id = asientoId;
    } catch {
      // asiento falla silenciosamente
    }

    res.status(201).json(devolucion);
  } catch (err) {
    console.error("[POST devoluciones]", err);
    res.status(500).json({ error: "Error al registrar la devolución." });
  }
});

// ── Fiados ────────────────────────────────────────────────────────────────────

router.get("/fiados", async (req, res) => {
  const { estado } = req.query as { estado?: string };
  const conditions = [eq(fiados.tenant_id, req.tenantId)];
  if (estado) conditions.push(eq(fiados.estado, estado as "pendiente" | "pagado" | "vencido"));

  const rows = await db
    .select()
    .from(fiados)
    .where(and(...conditions))
    .orderBy(desc(fiados.created_at));
  res.json(rows);
});

router.get("/fiados/:id", async (req, res) => {
  const [fiado] = await db
    .select()
    .from(fiados)
    .where(and(eq(fiados.id, req.params.id), eq(fiados.tenant_id, req.tenantId)));
  if (!fiado) return res.status(404).json({ error: "Fiado no encontrado." });

  const [items, abonos] = await Promise.all([
    db.select().from(items_fiado).where(eq(items_fiado.fiado_id, fiado.id)),
    db.select().from(abonos_fiado).where(eq(abonos_fiado.fiado_id, fiado.id)).orderBy(abonos_fiado.created_at),
  ]);

  res.json({ ...fiado, items, abonos });
});

router.post("/fiados", async (req, res) => {
  const { nombre_cliente, telefono_cliente, cliente_id, caja_id, fecha_vencimiento, notas, items } =
    req.body as {
      nombre_cliente: string;
      telefono_cliente?: string;
      cliente_id?: string;
      caja_id?: string;
      fecha_vencimiento?: string;
      notas?: string;
      items: Array<{
        descripcion: string; cantidad: number; precio_unitario: number; total: number;
        producto_id?: string;
      }>;
    };

  if (!nombre_cliente) return res.status(400).json({ error: "Campo requerido: nombre_cliente." });
  if (!items?.length)  return res.status(400).json({ error: "El fiado debe tener al menos un ítem." });

  for (const [index, item] of items.entries()) {
    if (!item.descripcion?.trim() || !Number.isFinite(item.cantidad) || item.cantidad <= 0 || !Number.isFinite(item.precio_unitario) || item.precio_unitario < 0) {
      return res.status(400).json({ error: `El ítem ${index + 1} debe tener descripción, cantidad y precio válidos.` });
    }
  }

  // El total nunca se acepta desde el navegador: se deriva de cantidad × precio.
  const itemsNormalizados = items.map((item) => ({
    ...item,
    descripcion: item.descripcion.trim(),
    total: Number((item.cantidad * item.precio_unitario).toFixed(2)),
  }));
  const monto_total = itemsNormalizados.reduce((s, i) => s + i.total, 0);

  const fiado = await db.transaction(async (tx) => {
  const [fiado] = await tx.insert(fiados).values({
    tenant_id: req.tenantId,
    caja_id: caja_id ?? null,
    cliente_id: cliente_id ?? null,
    nombre_cliente,
    telefono_cliente: telefono_cliente ?? null,
    monto_total: String(monto_total),
    fecha_vencimiento: fecha_vencimiento ?? null,
    notas: notas ?? null,
  }).returning();

  await tx.insert(items_fiado).values(
    itemsNormalizados.map((i) => ({
      fiado_id: fiado.id,
      producto_id: i.producto_id ?? null,
      descripcion: i.descripcion,
      cantidad: String(i.cantidad),
      precio_unitario: String(i.precio_unitario),
      total: String(i.total),
    }))
  );

  // Descontar inventario para ítems con producto_id (misma lógica que ventas POS)
  const itemsConProducto = itemsNormalizados.filter((i) => i.producto_id);
  if (itemsConProducto.length > 0) {
    const [bodega] = await tx
      .select({ id: bodegas.id })
      .from(bodegas)
      .where(and(eq(bodegas.tenant_id, req.tenantId), eq(bodegas.activo, true)))
      .limit(1);

    if (bodega) {
      for (const item of itemsConProducto) {
        const permiteInventarioNegativo = req.tenant.pos_config?.permitir_inventario_negativo === true;
        const condicionStockFiado = permiteInventarioNegativo
          ? and(eq(productos.id, item.producto_id!), eq(productos.tenant_id, req.tenantId))
          : and(
              eq(productos.id, item.producto_id!),
              eq(productos.tenant_id, req.tenantId),
              sql`COALESCE(${productos.stock_actual}, 0) >= ${Number(item.cantidad)}`,
            );
        const descontado = await tx
          .update(productos)
          .set({ stock_actual: sql`COALESCE(stock_actual, 0) - ${Number(item.cantidad)}` })
          .where(condicionStockFiado)
          .returning({ id: productos.id });
        if (!permiteInventarioNegativo && descontado.length !== 1) {
          throw new Error(`Stock insuficiente para ${item.descripcion}.`);
        }
        await tx.insert(movimientos_inventario).values({
          tenant_id: req.tenantId, bodega_id: bodega.id,
          producto_id: item.producto_id!, tipo: "salida",
          cantidad: String(item.cantidad), costo_unitario: String(item.precio_unitario),
          referencia_tipo: "factura",
          observaciones: `Cartera: ${fiado.id} – ${nombre_cliente}`,
        });
      }
    }
  }

  return fiado;
  });

  try {
    const asientoId = await crearAsientoFiado(req.tenantId, fiado);
    await db.update(fiados).set({ asiento_id: asientoId }).where(eq(fiados.id, fiado.id));
  } catch { /* plan sin contabilidad */ }

  res.status(201).json(fiado);
});

router.post("/fiados/:id/abonos", async (req, res) => {
  const { monto, metodo_pago, notas } = req.body as { monto: number; metodo_pago?: string; notas?: string };
  if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "Monto inválido." });
  if (metodo_pago !== undefined && !METODOS_PAGO.includes(metodo_pago as typeof METODOS_PAGO[number])) {
    return res.status(400).json({ error: "Método de pago no válido." });
  }

  const [fiado] = await db
    .select()
    .from(fiados)
    .where(and(eq(fiados.id, req.params.id), eq(fiados.tenant_id, req.tenantId)));
  if (!fiado) return res.status(404).json({ error: "Fiado no encontrado." });
  if (fiado.estado === "pagado") return res.status(400).json({ error: "Este fiado ya está pagado." });

  const saldoActual = Number(fiado.monto_total) - Number(fiado.monto_pagado);
  const montoAbono = Math.min(monto, saldoActual);
  const nuevoPagado = Number(fiado.monto_pagado) + montoAbono;
  const nuevaSaldo = Number(fiado.monto_total) - nuevoPagado;
  const nuevoEstado = nuevaSaldo <= 0 ? "pagado" : "pendiente";

  const [abono] = await db.insert(abonos_fiado).values({
    fiado_id: fiado.id,
    usuario_id: req.userId,
    monto: String(montoAbono),
    metodo_pago: metodo_pago ?? "efectivo",
    notas: notas ?? null,
  }).returning();

  // Actualización optimista: si otro cajero abonó antes, se elimina este intento y se pide recargar.
  // Así no queda un abono creado con un saldo que ya cambió.
  const [fiadoActualizado] = await db.update(fiados).set({
    monto_pagado: String(nuevoPagado),
    estado: nuevoEstado,
    updated_at: new Date(),
  }).where(and(
    eq(fiados.id, fiado.id),
    eq(fiados.tenant_id, req.tenantId),
    eq(fiados.monto_pagado, fiado.monto_pagado),
  )).returning();

  if (!fiadoActualizado) {
    await db.delete(abonos_fiado).where(eq(abonos_fiado.id, abono.id));
    return res.status(409).json({ error: "El saldo cambiÃ³ mientras registrabas el abono. Actualiza la cuenta e intÃ©ntalo de nuevo.", code: "FIADO_SALDO_CONFLICT" });
  }

  try {
    await crearAsientoAbonoFiado(req.tenantId, abono, fiado.nombre_cliente);
  } catch { /* plan sin contabilidad */ }

  res.status(201).json({ abono, saldo: nuevaSaldo, estado: nuevoEstado });
});

router.patch("/fiados/:id", async (req, res) => {
  const { notas, fecha_vencimiento, estado } = req.body as {
    notas?: string; fecha_vencimiento?: string; estado?: "pendiente" | "vencido";
  };
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (notas !== undefined) updates.notas = notas;
  if (fecha_vencimiento !== undefined) updates.fecha_vencimiento = fecha_vencimiento;
  if (estado !== undefined) updates.estado = estado;

  const [updated] = await db.update(fiados).set(updates)
    .where(and(eq(fiados.id, req.params.id), eq(fiados.tenant_id, req.tenantId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Fiado no encontrado." });
  res.json(updated);
});

// ── Anular venta ──────────────────────────────────────────────────────────────

router.patch("/ventas/:id/anular", async (req, res) => {
  const { motivo } = req.body as { motivo?: string };

  const [venta] = await db
    .select()
    .from(ventas_pos)
    .where(and(eq(ventas_pos.id, req.params.id), eq(ventas_pos.tenant_id, req.tenantId)));

  if (!venta) return res.status(404).json({ error: "Venta no encontrada." });
  if (venta.estado_dian === "anulado") return res.status(422).json({ error: "Esta venta ya está anulada." });
  if (venta.estado_dian === "enviado") return res.status(422).json({ error: "Esta venta ya fue enviada a la DIAN y no puede anularse." });
  const [turnoVenta] = await db.select().from(turnos_pos)
    .where(and(eq(turnos_pos.id, venta.turno_id), eq(turnos_pos.tenant_id, req.tenantId)));
  if (!turnoVenta) return res.status(400).json({ error: "Turno original no encontrado." });
  if (!puedeOperarTurno(req, turnoVenta)) {
    return res.status(403).json({ error: "No puedes anular ventas de otro usuario.", code: "POS_TURNO_FORBIDDEN" });
  }

  const anuladaAhora = await db.transaction(async (tx) => {
    // La venta anulada revierte los movimientos de inventario generados por esta venta.
    const [ventaAnulada] = await tx
      .update(ventas_pos)
      .set({
        estado: "anulada",
        estado_dian: "anulado",
        anulado_por: req.userId,
        anulado_en: new Date(),
        anulado_motivo: motivo ?? null,
      })
      .where(and(eq(ventas_pos.id, venta.id), ne(ventas_pos.estado, "anulada")))
      .returning({ id: ventas_pos.id });

    if (ventaAnulada) {
      const salidas = await tx
        .select({ producto_id: movimientos_inventario.producto_id, bodega_id: movimientos_inventario.bodega_id, cantidad: movimientos_inventario.cantidad, costo_unitario: movimientos_inventario.costo_unitario })
        .from(movimientos_inventario)
        .where(and(
          eq(movimientos_inventario.tenant_id, req.tenantId),
          eq(movimientos_inventario.referencia_id, venta.id),
          eq(movimientos_inventario.tipo, "salida"),
        ));

      for (const salida of salidas) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`stock_${req.tenantId}_${salida.bodega_id}_${salida.producto_id}`}))`);
        await tx
          .update(productos)
          .set({ stock_actual: sql`COALESCE(stock_actual, 0) + ${Number(salida.cantidad)}` })
          .where(and(eq(productos.id, salida.producto_id), eq(productos.tenant_id, req.tenantId)));
        await tx.insert(movimientos_inventario).values({
          tenant_id: req.tenantId,
          producto_id: salida.producto_id,
          bodega_id: salida.bodega_id,
          tipo: "entrada",
          cantidad: salida.cantidad,
          costo_unitario: salida.costo_unitario,
          referencia_tipo: "ajuste_manual",
          referencia_id: venta.id,
          observaciones: `Reversión por anulación de venta POS ${venta.numero}`,
        });
      }
    }

    // Restar del acumulado del turno
    if (ventaAnulada) await tx
      .update(turnos_pos)
      .set({ total_ventas: sql`total_ventas - ${Number(venta.total)}` })
      .where(eq(turnos_pos.id, venta.turno_id));
    return Boolean(ventaAnulada);
  });

  if (anuladaAhora) {
    try {
      const [impuestosVenta] = await db.select({ impoconsumo: sum(items_venta_pos.impoconsumo_valor) })
        .from(items_venta_pos).where(eq(items_venta_pos.venta_id, venta.id));
      await crearAsientoAnulacionVentaPOS(req.tenantId, venta, Number(impuestosVenta?.impoconsumo ?? 0));
    } catch (err) {
      console.error("Error al crear reversa contable de venta POS anulada:", err);
    }
  }

  res.json({ ok: true });
});

// ── Reportes POS ──────────────────────────────────────────────────────────────

router.get("/reportes", async (req, res) => {
  const { turno_id, fecha } = req.query as { turno_id?: string; fecha?: string };

  const ahora = new Date();
  let inicio: Date;
  let fin: Date;

  if (fecha) {
    inicio = new Date(`${fecha}T00:00:00`);
    fin    = new Date(`${fecha}T23:59:59.999`);
  } else {
    inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    fin    = new Date(inicio.getTime() + 86_400_000 - 1);
  }

  const whereVentas = turno_id
    ? and(eq(ventas_pos.tenant_id, req.tenantId), eq(ventas_pos.turno_id, turno_id), eq(ventas_pos.estado, "completada"))
    : and(eq(ventas_pos.tenant_id, req.tenantId), eq(ventas_pos.estado, "completada"), gte(ventas_pos.created_at, inicio), lt(ventas_pos.created_at, fin));

  const ventas = await db
    .select({
      id: ventas_pos.id,
      turno_id: ventas_pos.turno_id,
      total: ventas_pos.total,
      metodo_pago: ventas_pos.metodo_pago,
      created_at: ventas_pos.created_at,
    })
    .from(ventas_pos)
    .where(whereVentas);

  const pagos = ventas.length
    ? await db.select().from(pagos_venta_pos).where(inArray(pagos_venta_pos.venta_id, ventas.map((v) => v.id)))
    : [];
  const pagosPorVenta = new Map<string, typeof pagos>();
  for (const pago of pagos) pagosPorVenta.set(pago.venta_id, [...(pagosPorVenta.get(pago.venta_id) ?? []), pago]);

  // Obtener cajeros vía turnos
  const turnoIds = [...new Set(ventas.map((v) => v.turno_id))];
  const turnosInfo = turnoIds.length
    ? await db
        .select({ id: turnos_pos.id, usuario_id: turnos_pos.usuario_id })
        .from(turnos_pos)
        .where(eq(turnos_pos.tenant_id, req.tenantId))
    : [];

  const usuarioIds = [...new Set(turnosInfo.map((t) => t.usuario_id))];
  const usersInfo = usuarioIds.length
    ? await db
        .select({ id: users.id, nombre: users.nombre })
        .from(users)
        .where(eq(users.tenant_id, req.tenantId))
    : [];

  const mapaTurno = new Map(turnosInfo.map((t) => [t.id, t.usuario_id]));
  const mapaUser  = new Map(usersInfo.map((u) => [u.id, u.nombre]));

  // Agregar
  const porMetodo: Record<string, { total: number; cantidad: number }> = {};
  const porCajero: Record<string, { nombre: string; total: number; cantidad: number }> = {};
  const porHora: number[] = new Array(24).fill(0) as number[];

  let totalGeneral = 0;

  for (const v of ventas) {
    const monto = Number(v.total);
    totalGeneral += monto;

    // Método de pago: ventas anteriores conservan su método único; las nuevas
    // se desglosan por cada componente del cobro mixto.
    const desglose = pagosPorVenta.get(v.id) ?? [{ metodo_pago: v.metodo_pago, monto: v.total }];
    for (const pago of desglose) {
      if (!porMetodo[pago.metodo_pago]) porMetodo[pago.metodo_pago] = { total: 0, cantidad: 0 };
      porMetodo[pago.metodo_pago].total += Number(pago.monto);
      porMetodo[pago.metodo_pago].cantidad += 1;
    }

    // Cajero
    const uid = mapaTurno.get(v.turno_id) ?? "desconocido";
    if (!porCajero[uid]) porCajero[uid] = { nombre: mapaUser.get(uid) ?? "Cajero", total: 0, cantidad: 0 };
    porCajero[uid].total    += monto;
    porCajero[uid].cantidad += 1;

    // Hora
    porHora[new Date(v.created_at).getHours()] += monto;
  }

  res.json({
    total: totalGeneral,
    cantidad: ventas.length,
    por_metodo: porMetodo,
    por_cajero: Object.entries(porCajero).map(([id, d]) => ({ id, ...d })),
    por_hora: porHora.map((total, hora) => ({ hora, total })),
    fecha: fecha ?? ahora.toISOString().slice(0, 10),
  });
});

// ── Ciclo de revisión DIAN ────────────────────────────────────────────────────

// GET /api/pos/cierre-dian — ventas pendientes de envío a la DIAN
router.get("/cierre-dian", async (req, res) => {
  if (!puedeOperarDian(req)) return res.status(403).json({ error: "No tienes permisos para revisar el cierre DIAN." });
  try {
    const ventas = await db
      .select({
        id: ventas_pos.id,
        numero: ventas_pos.numero,
        total: ventas_pos.total,
        tipo_documento: ventas_pos.tipo_documento,
        estado_dian: ventas_pos.estado_dian,
        cufe: ventas_pos.cufe,
        error_dian: ventas_pos.error_dian,
        fecha_limite_envio: ventas_pos.fecha_limite_envio,
        created_at: ventas_pos.created_at,
        nombre_cliente: ventas_pos.nombre_cliente,
      })
      .from(ventas_pos)
      .where(and(
        eq(ventas_pos.tenant_id, req.tenantId),
        eq(ventas_pos.estado_dian, "pendiente_envio"),
      ))
      .orderBy(ventas_pos.created_at);

    const total = ventas.reduce((s, v) => s + Number(v.total), 0);
    res.json({ ventas, total, cantidad: ventas.length });
  } catch (err) {
    console.error("Error en GET /pos/cierre-dian:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/pos/cierre-dian/enviar — marcar lote como enviado a la DIAN
router.post("/cierre-dian/enviar", async (req, res) => {
  if (!puedeOperarDian(req)) return res.status(403).json({ error: "No tienes permisos para enviar documentos a la DIAN." });
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Se requiere un array 'ids' con los IDs de ventas a enviar." });
    }

    if (ids.length > 100) return res.status(400).json({ error: "Puedes enviar máximo 100 documentos por lote." });
    const { apiKey, ambiente } = await getPlemsiCredentials(req.tenantId);
    const [resolucion] = await db.select().from(resoluciones_dian).where(and(
      eq(resoluciones_dian.tenant_id, req.tenantId),
      eq(resoluciones_dian.activa, true),
    )).limit(1);
    if (!resolucion) return res.status(422).json({ error: "No hay una resolución DIAN activa para el documento equivalente POS." });

    let actualizadas = 0;
    const errores: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      const [venta] = await db.select().from(ventas_pos).where(and(
        eq(ventas_pos.id, id),
        eq(ventas_pos.tenant_id, req.tenantId),
        eq(ventas_pos.estado_dian, "pendiente_envio"),
      )).limit(1);
      if (!venta) continue;
      if (venta.consecutivo < resolucion.consecutivo_desde || venta.consecutivo > resolucion.consecutivo_hasta) {
        errores.push({ id, error: "El consecutivo POS está fuera del rango de la resolución activa." });
        continue;
      }
      const items = await db.select().from(items_venta_pos).where(eq(items_venta_pos.venta_id, venta.id));
      const itemsPlemsi = buildItems(items.map((item) => ({
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento: item.descuento_pct,
        iva_porcentaje: item.iva_pct,
        impoconsumo_porcentaje: item.impoconsumo_pct,
      })));
      const ahoraColombia = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const resultado = await emitirDocumentoPOS({
        apiKey,
        ambiente,
        prefix: resolucion.prefijo,
        number: venta.consecutivo,
        resolution: resolucion.numero_resolucion,
        date: ahoraColombia.toISOString().slice(0, 10),
        time: ahoraColombia.toISOString().slice(11, 19),
        items: itemsPlemsi,
        payment_method_id: metodoPagoId(venta.metodo_pago),
        ...calcularTotalesPlemsi(itemsPlemsi),
      });
      if (!resultado.ok) {
        await db.update(ventas_pos).set({
          // Permanece en cola para un reintento manual; el detalle del error
          // queda auditado en error_dian y nunca se informa como enviado.
          estado_dian: "pendiente_envio",
          error_dian: resultado.error ?? "Plemsi no confirmó el documento.",
        }).where(eq(ventas_pos.id, venta.id));
        errores.push({ id, error: resultado.error ?? "Plemsi no confirmó el documento." });
        continue;
      }
      await db.update(ventas_pos).set({
        estado_dian: "enviado",
        enviado_en: new Date(),
        cufe: resultado.cufe ?? null,
        error_dian: null,
      }).where(eq(ventas_pos.id, venta.id));
      actualizadas++;
    }

    res.json({ actualizadas, errores, mensaje: `${actualizadas} documentos fueron aceptados por el proveedor electrónico.` });
  } catch (err) {
    if (err instanceof PlemsiNotConfiguredError) return res.status(422).json({ error: err.message });
    console.error("Error en POST /pos/cierre-dian/enviar:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Citas / Agenda POS ────────────────────────────────────────────────────────

// GET /api/pos/citas?fecha=YYYY-MM-DD  (default: hoy)
router.get("/citas", async (req, res) => {
  try {
    const fechaStr = (req.query as { fecha?: string }).fecha ?? new Date().toISOString().slice(0, 10);
    const inicio = new Date(`${fechaStr}T00:00:00`);
    const fin    = new Date(`${fechaStr}T23:59:59`);

    const rows = await db
      .select()
      .from(citas_pos)
      .where(
        and(
          eq(citas_pos.tenant_id, req.tenantId),
          between(citas_pos.fecha_hora, inicio, fin),
        )
      )
      .orderBy(citas_pos.fecha_hora);

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /citas:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// POST /api/pos/citas
router.post("/citas", async (req, res) => {
  try {
    const { cliente_nombre, cliente_telefono, fecha_hora, servicio, profesional, duracion_min, notas, caja_id } =
      req.body as {
        cliente_nombre: string; cliente_telefono?: string; fecha_hora: string;
        servicio: string; profesional?: string; duracion_min?: number; notas?: string; caja_id?: string;
      };

    if (!cliente_nombre?.trim()) return res.status(400).json({ error: "Campo requerido: cliente_nombre." });
    if (!fecha_hora)              return res.status(400).json({ error: "Campo requerido: fecha_hora." });
    if (!servicio?.trim())        return res.status(400).json({ error: "Campo requerido: servicio." });

    const [cita] = await db.insert(citas_pos).values({
      tenant_id: req.tenantId,
      caja_id: caja_id ?? null,
      cliente_nombre: cliente_nombre.trim(),
      cliente_telefono: cliente_telefono?.trim() ?? null,
      fecha_hora: new Date(fecha_hora),
      servicio: servicio.trim(),
      profesional: profesional?.trim() ?? null,
      duracion_min: duracion_min ?? 30,
      notas: notas?.trim() ?? null,
    }).returning();

    res.status(201).json(cita);
  } catch (err) {
    console.error("Error en POST /citas:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// PATCH /api/pos/citas/:id
router.patch("/citas/:id", async (req, res) => {
  try {
    const { cliente_nombre, cliente_telefono, fecha_hora, servicio, profesional, duracion_min, notas, estado } =
      req.body as Partial<{
        cliente_nombre: string; cliente_telefono: string; fecha_hora: string;
        servicio: string; profesional: string; duracion_min: number; notas: string;
        estado: "programada" | "en_proceso" | "completada" | "cancelada";
      }>;

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (cliente_nombre !== undefined)  updates.cliente_nombre  = cliente_nombre;
    if (cliente_telefono !== undefined) updates.cliente_telefono = cliente_telefono;
    if (fecha_hora !== undefined)       updates.fecha_hora       = new Date(fecha_hora);
    if (servicio !== undefined)         updates.servicio         = servicio;
    if (profesional !== undefined)      updates.profesional      = profesional;
    if (duracion_min !== undefined)     updates.duracion_min     = duracion_min;
    if (notas !== undefined)            updates.notas            = notas;
    if (estado !== undefined)           updates.estado           = estado;

    const [updated] = await db
      .update(citas_pos)
      .set(updates)
      .where(and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Cita no encontrada." });
    res.json(updated);
  } catch (err) {
    console.error("Error en PATCH /citas/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// DELETE /api/pos/citas/:id
router.delete("/citas/:id", async (req, res) => {
  try {
    const [deleted] = await db
      .delete(citas_pos)
      .where(and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId)))
      .returning({ id: citas_pos.id });
    if (!deleted) return res.status(404).json({ error: "Cita no encontrada." });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /citas/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

export default router;
