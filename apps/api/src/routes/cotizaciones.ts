import { Router } from "express";
import { db, cotizaciones, items_cotizacion, clientes, facturas } from "@workspace/db";
import { eq, and, desc, max, sql } from "drizzle-orm";
import { crearFactura } from "../services/factura.service.js";
import { requirePlanFeature } from "../middleware/require-plan-feature.js";
import { PlanLimitError } from "@workspace/shared";

const router = Router();

// ── Helpers de cálculo (igual que facturas) ──────────────────────────────────
function calcularItem(item: {
  cantidad: number;
  precio_unitario: number;
  descuento_pct?: number;
  iva_pct?: number;
}) {
  const precioConDesc = item.precio_unitario * (1 - (item.descuento_pct ?? 0) / 100);
  const subtotal = Number((item.cantidad * precioConDesc).toFixed(2));
  const iva_valor = Number((subtotal * ((item.iva_pct ?? 19) / 100)).toFixed(2));
  return { subtotal, iva_valor, total: subtotal + iva_valor };
}

// GET /api/cotizaciones?page=1&limit=50
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: cotizaciones.id,
      numero: cotizaciones.numero,
      estado: cotizaciones.estado,
      fecha_emision: cotizaciones.fecha_emision,
      fecha_vencimiento: cotizaciones.fecha_vencimiento,
      total: cotizaciones.total,
      cliente: { id: clientes.id, nombre: clientes.nombre },
    })
    .from(cotizaciones)
    .innerJoin(clientes, eq(cotizaciones.cliente_id, clientes.id))
    .where(eq(cotizaciones.tenant_id, req.tenantId))
    .orderBy(desc(cotizaciones.fecha_emision))
    .limit(limit)
    .offset(offset);

  res.json({ data: rows, page, limit });
});

// GET /api/cotizaciones/:id
router.get("/:id", async (req, res) => {
  const [row] = await db
    .select({ cotizacion: cotizaciones, cliente: clientes })
    .from(cotizaciones)
    .innerJoin(clientes, eq(cotizaciones.cliente_id, clientes.id))
    .where(and(eq(cotizaciones.id, req.params.id), eq(cotizaciones.tenant_id, req.tenantId)))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Cotización no encontrada." });

  const items = await db
    .select()
    .from(items_cotizacion)
    .where(eq(items_cotizacion.cotizacion_id, row.cotizacion.id));

  res.json({ ...row.cotizacion, cliente: row.cliente, items });
});

// POST /api/cotizaciones
router.post("/", async (req, res) => {
  const { cliente_id, items, fecha_vencimiento, observaciones } = req.body;

  if (!cliente_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Campos requeridos: cliente_id, items." });
  }

  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, cliente_id), eq(clientes.tenant_id, req.tenantId)))
    .limit(1);

  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

  // Autonumeración
  const [{ val }] = await db
    .select({ val: sql<number>`COALESCE(MAX(${cotizaciones.consecutivo}), 0)` })
    .from(cotizaciones)
    .where(eq(cotizaciones.tenant_id, req.tenantId));

  const consecutivo = (val ?? 0) + 1;
  const numero = `COT-${String(consecutivo).padStart(4, "0")}`;

  const itemsCalc = items.map((i: {
    producto_id?: string; descripcion: string; cantidad: number;
    precio_unitario: number; descuento_pct?: number; iva_pct?: number;
  }) => ({ ...i, ...calcularItem(i) }));

  const subtotal = Number(itemsCalc.reduce((s: number, i: { subtotal: number }) => s + i.subtotal, 0).toFixed(2));
  const iva_total = Number(itemsCalc.reduce((s: number, i: { iva_valor: number }) => s + i.iva_valor, 0).toFixed(2));
  const total = Number((subtotal + iva_total).toFixed(2));

  const [cot] = await db
    .insert(cotizaciones)
    .values({
      tenant_id: req.tenantId,
      cliente_id,
      numero,
      consecutivo,
      estado: "borrador",
      fecha_emision: new Date(),
      fecha_vencimiento: fecha_vencimiento ?? null,
      subtotal: String(subtotal),
      descuento_total: "0",
      iva_total: String(iva_total),
      total: String(total),
      observaciones: observaciones ?? null,
    })
    .returning();

  await db.insert(items_cotizacion).values(
    itemsCalc.map((i: {
      producto_id?: string; descripcion: string; cantidad: number; precio_unitario: number;
      descuento_pct?: number; iva_pct?: number; subtotal: number; iva_valor: number; total: number;
    }) => ({
      cotizacion_id: cot.id,
      producto_id: i.producto_id ?? null,
      descripcion: i.descripcion,
      cantidad: String(i.cantidad),
      precio_unitario: String(i.precio_unitario),
      descuento_pct: String(i.descuento_pct ?? 0),
      iva_pct: String(i.iva_pct ?? 19),
      subtotal: String(i.subtotal),
      iva_valor: String(i.iva_valor),
      total: String(i.total),
    })),
  );

  res.status(201).json(cot);
});

// PATCH /api/cotizaciones/:id — solo cambia estado o datos si aún está en borrador
router.patch("/:id", async (req, res) => {
  const [cot] = await db
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.id, req.params.id), eq(cotizaciones.tenant_id, req.tenantId)))
    .limit(1);

  if (!cot) return res.status(404).json({ error: "Cotización no encontrada." });
  if (cot.estado === "convertida") {
    return res.status(422).json({ error: "No se puede modificar una cotización ya convertida." });
  }

  const { estado, observaciones, fecha_vencimiento } = req.body;

  const [actualizada] = await db
    .update(cotizaciones)
    .set({
      ...(estado !== undefined && { estado }),
      ...(observaciones !== undefined && { observaciones }),
      ...(fecha_vencimiento !== undefined && { fecha_vencimiento }),
    })
    .where(eq(cotizaciones.id, cot.id))
    .returning();

  res.json(actualizada);
});

// POST /api/cotizaciones/:id/convertir — convierte a factura (requiere cotizacion_a_factura)
router.post("/:id/convertir", requirePlanFeature("cotizacion_a_factura"), async (req, res) => {
  const [cot] = await db
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.id, req.params.id), eq(cotizaciones.tenant_id, req.tenantId)))
    .limit(1);

  if (!cot) return res.status(404).json({ error: "Cotización no encontrada." });
  if (cot.estado === "convertida") {
    return res.status(422).json({ error: "Esta cotización ya fue convertida a factura." });
  }
  if (!["aceptada", "enviada", "borrador"].includes(cot.estado)) {
    return res.status(422).json({ error: "Solo se pueden convertir cotizaciones en estado borrador, enviada o aceptada." });
  }

  const items = await db
    .select()
    .from(items_cotizacion)
    .where(eq(items_cotizacion.cotizacion_id, cot.id));

  try {
    const { factura, advertencias } = await crearFactura(req.tenant, {
      cliente_id: cot.cliente_id,
      items: items.map((i) => ({
        producto_id: i.producto_id ?? undefined,
        descripcion: i.descripcion,
        cantidad: Number(i.cantidad),
        precio_unitario: Number(i.precio_unitario),
        descuento_pct: Number(i.descuento_pct),
        iva_pct: Number(i.iva_pct),
      })),
      fecha_vencimiento: req.body.fecha_vencimiento ?? undefined,
      observaciones: cot.observaciones ?? undefined,
    });

    await db
      .update(cotizaciones)
      .set({ estado: "convertida", factura_id: factura.id })
      .where(eq(cotizaciones.id, cot.id));

    res.status(201).json({ cotizacion_id: cot.id, factura, advertencias });
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    return res.status(422).json({ error: err instanceof Error ? err.message : "Error al convertir." });
  }
});

export default router;
