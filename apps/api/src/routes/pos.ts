import { Router } from "express";
import { db, cajas_pos, turnos_pos, ventas_pos, items_venta_pos, productos, movimientos_inventario, bodegas, fiados, items_fiado, abonos_fiado, citas_pos, gastos_caja_pos, devoluciones_pos } from "@workspace/db";
import type { GrameraConfig } from "@workspace/db";
import { eq, and, desc, sql, count, ne, gte, lt, sum, between } from "drizzle-orm";
import { users } from "@workspace/db";
import { crearAsientoVentaPOS, crearAsientoFiado, crearAsientoAbonoFiado, crearAsientoGastoCaja, crearAsientoDevolucionPOS, verificarPeriodoAbierto } from "../services/contabilidad.service.js";
import { siguienteConsecutivo } from "../services/consecutivo.service.js";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

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
  const { monto_final_declarado, notas_cierre } = req.body as {
    monto_final_declarado?: number; notas_cierre?: string;
  };

  const [turno] = await db
    .select()
    .from(turnos_pos)
    .where(and(eq(turnos_pos.id, req.params.id), eq(turnos_pos.tenant_id, req.tenantId)));
  if (!turno) return res.status(404).json({ error: "Turno no encontrado." });
  if (turno.estado === "cerrado") return res.status(400).json({ error: "El turno ya está cerrado." });

  const [cerrado] = await db
    .update(turnos_pos)
    .set({
      estado: "cerrado",
      cierre_at: new Date(),
      monto_final_declarado: monto_final_declarado ? String(monto_final_declarado) : null,
      notas_cierre: notas_cierre ?? null,
    })
    .where(eq(turnos_pos.id, req.params.id))
    .returning();
  res.json(cerrado);
});

// ── Productos (para el POS) ───────────────────────────────────────────────────

router.get("/productos", async (req, res) => {
  const rows = await db
    .select({
      id: productos.id,
      codigo: productos.codigo,
      nombre: productos.nombre,
      precio_venta: productos.precio_venta,
      iva_pct: productos.iva_pct,
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

  res.json({ ...venta, items });
});

router.post("/ventas", async (req, res) => {
  const { turno_id, caja_id, cliente_id, nombre_cliente, metodo_pago, monto_recibido, vuelto, observaciones, items } =
    req.body as {
      turno_id: string;
      caja_id: string;
      cliente_id?: string;
      nombre_cliente?: string;
      metodo_pago: string;
      monto_recibido?: number;
      vuelto?: number;
      observaciones?: string;
      items: Array<{
        producto_id?: string;
        descripcion: string;
        cantidad: number;
        precio_unitario: number;
        descuento_pct: number;
        iva_pct: number;
        subtotal: number;
        iva_valor: number;
        total: number;
      }>;
    };

  if (!turno_id || !caja_id || !items?.length) {
    return res.status(400).json({ error: "Faltan campos requeridos." });
  }

  try {
    await verificarPeriodoAbierto(req.tenantId, new Date());
  } catch (err) {
    return res.status(422).json({ error: (err as Error).message });
  }

  try {

  // Verifica turno abierto
  const [turno] = await db
    .select()
    .from(turnos_pos)
    .where(and(eq(turnos_pos.id, turno_id), eq(turnos_pos.tenant_id, req.tenantId), eq(turnos_pos.estado, "abierto")));
  if (!turno) return res.status(400).json({ error: "El turno no está abierto." });

  // Genera consecutivo con bloqueo para evitar duplicados en inserciones concurrentes
  const consecutivo = await siguienteConsecutivo("ventas_pos", "consecutivo", req.tenantId);
  const numero = `POS-${String(consecutivo).padStart(6, "0")}`;

  // Calcula totales
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const iva_total = items.reduce((s, i) => s + i.iva_valor, 0);
  const total = items.reduce((s, i) => s + i.total, 0);
  const descuento_total = items.reduce((s, i) => s + (i.cantidad * i.precio_unitario * (i.descuento_pct / 100)), 0);

  const result = await db.transaction(async (tx) => {
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
        metodo_pago: (metodo_pago ?? "efectivo") as "efectivo",
        monto_recibido: monto_recibido ? String(monto_recibido) : null,
        vuelto: vuelto ? String(vuelto) : null,
        observaciones: observaciones ?? null,
      })
      .returning();

    await tx.insert(items_venta_pos).values(
      items.map((i) => ({
        venta_id: venta.id,
        producto_id: i.producto_id ?? null,
        descripcion: i.descripcion,
        cantidad: String(i.cantidad),
        precio_unitario: String(i.precio_unitario),
        descuento_pct: String(i.descuento_pct),
        iva_pct: String(i.iva_pct),
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
      for (const item of items) {
        if (!item.producto_id) continue;
        await tx
          .update(productos)
          .set({ stock_actual: sql`COALESCE(stock_actual, 0) - ${Number(item.cantidad)}` })
          .where(eq(productos.id, item.producto_id));

        await tx.insert(movimientos_inventario).values({
          tenant_id: req.tenantId,
          producto_id: item.producto_id,
          bodega_id: bodegaIdParaInventario,
          tipo: "salida",
          cantidad: String(item.cantidad),
          costo_unitario: String(item.precio_unitario),
          referencia_tipo: "factura",
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
    await crearAsientoVentaPOS(req.tenantId, result);
  } catch (err) {
    console.error("Error al crear asiento de venta POS:", err);
  }

  res.status(201).json(result);

  } catch (err) {
    console.error("[POS POST /ventas]", err);
    res.status(500).json({ error: "Error al registrar la venta. Inténtalo de nuevo." });
  }
});

// ── Resumen turno ─────────────────────────────────────────────────────────────

router.get("/turnos/:id/resumen", async (req, res) => {
  const [turno] = await db
    .select()
    .from(turnos_pos)
    .where(and(eq(turnos_pos.id, req.params.id), eq(turnos_pos.tenant_id, req.tenantId)));
  if (!turno) return res.status(404).json({ error: "Turno no encontrado." });

  const ventasTurno = await db
    .select()
    .from(ventas_pos)
    .where(and(eq(ventas_pos.turno_id, turno.id), eq(ventas_pos.estado, "completada")));

  // Ítems de todas las ventas del turno (para top productos)
  const ventaIds = ventasTurno.map((v) => v.id);
  let itemsTurno: Array<{ descripcion: string; cantidad: string; total: string; iva_valor: string; descuento_pct: string; precio_unitario: string; cantidad_num: number; }> = [];
  if (ventaIds.length > 0) {
    const rawItems = await db
      .select({
        descripcion: items_venta_pos.descripcion,
        cantidad: items_venta_pos.cantidad,
        total: items_venta_pos.total,
        iva_valor: items_venta_pos.iva_valor,
        descuento_pct: items_venta_pos.descuento_pct,
        precio_unitario: items_venta_pos.precio_unitario,
      })
      .from(items_venta_pos)
      .where(sql`${items_venta_pos.venta_id} = ANY(ARRAY[${sql.join(ventaIds.map((id) => sql`${id}::uuid`), sql`, `)}])`);
    itemsTurno = rawItems.map((i) => ({ ...i, cantidad_num: Number(i.cantidad) }));
  }

  // Agregar por producto (descripción como key)
  const productosMap: Record<string, { descripcion: string; cantidad: number; total: number }> = {};
  for (const it of itemsTurno) {
    const key = it.descripcion;
    if (!productosMap[key]) productosMap[key] = { descripcion: key, cantidad: 0, total: 0 };
    productosMap[key].cantidad += Number(it.cantidad);
    productosMap[key].total += Number(it.total);
  }
  const topProductos = Object.values(productosMap)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 8);

  // Ventas por hora
  const ventasPorHora: Record<number, { cantidad: number; total: number }> = {};
  for (const v of ventasTurno) {
    const hora = new Date(v.created_at).getHours();
    if (!ventasPorHora[hora]) ventasPorHora[hora] = { cantidad: 0, total: 0 };
    ventasPorHora[hora].cantidad += 1;
    ventasPorHora[hora].total += Number(v.total);
  }
  const porHora = Object.entries(ventasPorHora)
    .map(([h, d]) => ({ hora: Number(h), ...d }))
    .sort((a, b) => a.hora - b.hora);

  const porMetodo: Record<string, number> = {};
  for (const v of ventasTurno) {
    const m = v.metodo_pago;
    porMetodo[m] = (porMetodo[m] ?? 0) + Number(v.total);
  }

  const totalVentas = ventasTurno.reduce((s, v) => s + Number(v.total), 0);
  const ivaRecaudado = itemsTurno.reduce((s, i) => s + Number(i.iva_valor), 0);
  const descuentoTotal = itemsTurno.reduce(
    (s, i) => s + Number(i.cantidad) * Number(i.precio_unitario) * (Number(i.descuento_pct) / 100), 0
  );

  // Gastos de caja chica del turno
  const gastosCaja = await db
    .select()
    .from(gastos_caja_pos)
    .where(eq(gastos_caja_pos.turno_id, turno.id));
  const totalGastosCaja = gastosCaja.reduce((s, g) => s + Number(g.monto), 0);

  // Devoluciones del turno
  const devolucionesTurno = await db
    .select()
    .from(devoluciones_pos)
    .where(eq(devoluciones_pos.turno_id, turno.id));
  const totalDevoluciones = devolucionesTurno.reduce((s, d) => s + Number(d.monto_devuelto), 0);

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
    total_gastos_caja: totalGastosCaja,
    devoluciones: devolucionesTurno,
    total_devoluciones: totalDevoluciones,
  });
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
  if (!turno_id || !caja_id || !monto || monto <= 0) {
    return res.status(400).json({ error: "turno_id, caja_id y monto son requeridos." });
  }

  try {
    const [turno] = await db.select().from(turnos_pos)
      .where(and(eq(turnos_pos.id, turno_id), eq(turnos_pos.tenant_id, req.tenantId)));
    if (!turno || turno.estado !== "abierto") {
      return res.status(400).json({ error: "El turno no está abierto." });
    }

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

  try {
    const [venta] = await db.select().from(ventas_pos)
      .where(and(eq(ventas_pos.id, venta_id), eq(ventas_pos.tenant_id, req.tenantId)));
    if (!venta) return res.status(404).json({ error: "Venta no encontrada." });
    if (venta.estado === "anulada") return res.status(400).json({ error: "Esta venta ya fue anulada." });

    if (monto_devuelto > Number(venta.total)) {
      return res.status(400).json({ error: "El monto devuelto no puede superar el total de la venta." });
    }

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
    const turnoDevolucion = turnoAbierto ?? turno;

    const [devolucion] = await db.insert(devoluciones_pos).values({
      tenant_id: req.tenantId,
      venta_id,
      turno_id: turnoDevolucion.id,
      usuario_id: req.userId,
      monto_devuelto: String(monto_devuelto),
      metodo_devolucion: metodo_devolucion ?? "efectivo",
      motivo: motivo ?? null,
    }).returning();

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

  const monto_total = items.reduce((s, i) => s + i.total, 0);

  const [fiado] = await db.insert(fiados).values({
    tenant_id: req.tenantId,
    caja_id: caja_id ?? null,
    cliente_id: cliente_id ?? null,
    nombre_cliente,
    telefono_cliente: telefono_cliente ?? null,
    monto_total: String(monto_total),
    fecha_vencimiento: fecha_vencimiento ?? null,
    notas: notas ?? null,
  }).returning();

  await db.insert(items_fiado).values(
    items.map((i) => ({
      fiado_id: fiado.id,
      producto_id: i.producto_id ?? null,
      descripcion: i.descripcion,
      cantidad: String(i.cantidad),
      precio_unitario: String(i.precio_unitario),
      total: String(i.total),
    }))
  );

  // Descontar inventario para ítems con producto_id (misma lógica que ventas POS)
  const itemsConProducto = items.filter((i) => i.producto_id);
  if (itemsConProducto.length > 0) {
    const [bodega] = await db
      .select({ id: bodegas.id })
      .from(bodegas)
      .where(and(eq(bodegas.tenant_id, req.tenantId), eq(bodegas.activo, true)))
      .limit(1);

    if (bodega) {
      for (const item of itemsConProducto) {
        await db
          .update(productos)
          .set({ stock_actual: sql`COALESCE(stock_actual, 0) - ${Number(item.cantidad)}` })
          .where(and(eq(productos.id, item.producto_id!), eq(productos.tenant_id, req.tenantId)));
        await db.insert(movimientos_inventario).values({
          tenant_id: req.tenantId, bodega_id: bodega.id,
          producto_id: item.producto_id!, tipo: "salida",
          cantidad: String(item.cantidad), costo_unitario: String(item.precio_unitario),
          referencia_tipo: "factura",
          observaciones: `Cartera: ${fiado.id} – ${nombre_cliente}`,
        });
      }
    }
  }

  try {
    const asientoId = await crearAsientoFiado(req.tenantId, fiado);
    await db.update(fiados).set({ asiento_id: asientoId }).where(eq(fiados.id, fiado.id));
  } catch { /* plan sin contabilidad */ }

  res.status(201).json(fiado);
});

router.post("/fiados/:id/abonos", async (req, res) => {
  const { monto, metodo_pago, notas } = req.body as { monto: number; metodo_pago?: string; notas?: string };
  if (!monto || monto <= 0) return res.status(400).json({ error: "Monto inválido." });

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

  await db.update(fiados).set({
    monto_pagado: String(nuevoPagado),
    estado: nuevoEstado,
    updated_at: new Date(),
  }).where(eq(fiados.id, fiado.id));

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

  await db.transaction(async (tx) => {
    // Anulación fiscal — NO revierte inventario (regla de negocio: inventario y documento DIAN son independientes)
    await tx
      .update(ventas_pos)
      .set({
        estado: "anulada",
        estado_dian: "anulado",
        anulado_por: req.userId,
        anulado_en: new Date(),
        anulado_motivo: motivo ?? null,
      })
      .where(eq(ventas_pos.id, venta.id));

    // Restar del acumulado del turno
    await tx
      .update(turnos_pos)
      .set({ total_ventas: sql`total_ventas - ${Number(venta.total)}` })
      .where(eq(turnos_pos.id, venta.turno_id));
  });

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

    // Método de pago
    if (!porMetodo[v.metodo_pago]) porMetodo[v.metodo_pago] = { total: 0, cantidad: 0 };
    porMetodo[v.metodo_pago].total    += monto;
    porMetodo[v.metodo_pago].cantidad += 1;

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
  try {
    const ventas = await db
      .select({
        id: ventas_pos.id,
        numero: ventas_pos.numero,
        total: ventas_pos.total,
        tipo_documento: ventas_pos.tipo_documento,
        estado_dian: ventas_pos.estado_dian,
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
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Se requiere un array 'ids' con los IDs de ventas a enviar." });
    }

    const ahora = new Date();

    // Solo actualizar ventas que pertenezcan al tenant y estén pendientes
    let actualizadas = 0;
    for (const id of ids) {
      const [result] = await db
        .update(ventas_pos)
        .set({ estado_dian: "enviado", enviado_en: ahora })
        .where(and(
          eq(ventas_pos.id, id),
          eq(ventas_pos.tenant_id, req.tenantId),
          eq(ventas_pos.estado_dian, "pendiente_envio"),
        ))
        .returning({ id: ventas_pos.id });
      if (result) actualizadas++;
    }

    res.json({ actualizadas, mensaje: `${actualizadas} ventas marcadas como enviadas a la DIAN.` });
  } catch (err) {
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
