import { Router, type Response } from "express";
import { db, movimientos_inventario, bodegas, productos } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";

const router = Router();

// GET /api/inventario — stock actual agrupado por producto + bodega
router.get("/", async (req, res) => {
  const stock = await db
    .select({
      producto_id: movimientos_inventario.producto_id,
      bodega_id: movimientos_inventario.bodega_id,
      producto_nombre: productos.nombre,
      producto_codigo: productos.codigo,
      bodega_nombre: bodegas.nombre,
      stock: sql<string>`
        SUM(
          CASE
            WHEN ${movimientos_inventario.tipo} = 'entrada' THEN ${movimientos_inventario.cantidad}
            WHEN ${movimientos_inventario.tipo} = 'salida'  THEN -${movimientos_inventario.cantidad}
            WHEN ${movimientos_inventario.tipo} = 'ajuste'  THEN ${movimientos_inventario.cantidad}
            ELSE 0
          END
        )
      `.mapWith(Number),
    })
    .from(movimientos_inventario)
    .innerJoin(productos, eq(movimientos_inventario.producto_id, productos.id))
    .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
    .where(eq(movimientos_inventario.tenant_id, req.tenantId))
    .groupBy(
      movimientos_inventario.producto_id,
      movimientos_inventario.bodega_id,
      productos.nombre,
      productos.codigo,
      bodegas.nombre,
    )
    .orderBy(productos.nombre, bodegas.nombre);

  res.json(stock);
});

// GET /api/inventario/movimientos — historial completo
router.get("/movimientos", async (req, res) => {
  const movimientos = await db
    .select({
      id: movimientos_inventario.id,
      tipo: movimientos_inventario.tipo,
      cantidad: movimientos_inventario.cantidad,
      costo_unitario: movimientos_inventario.costo_unitario,
      referencia_tipo: movimientos_inventario.referencia_tipo,
      referencia_id: movimientos_inventario.referencia_id,
      observaciones: movimientos_inventario.observaciones,
      created_at: movimientos_inventario.created_at,
      producto: { id: productos.id, nombre: productos.nombre, codigo: productos.codigo },
      bodega: { id: bodegas.id, nombre: bodegas.nombre },
    })
    .from(movimientos_inventario)
    .innerJoin(productos, eq(movimientos_inventario.producto_id, productos.id))
    .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
    .where(eq(movimientos_inventario.tenant_id, req.tenantId))
    .orderBy(desc(movimientos_inventario.created_at))
    .limit(200);

  res.json(movimientos);
});

// POST /api/inventario/entrada
router.post("/entrada", async (req, res) => {
  const { bodega_id, producto_id, cantidad, costo_unitario, observaciones } = req.body;

  if (!bodega_id || !producto_id || !cantidad) {
    return res.status(400).json({ error: "Campos requeridos: bodega_id, producto_id, cantidad." });
  }

  if (Number(cantidad) <= 0) {
    return res.status(400).json({ error: "La cantidad debe ser mayor a cero." });
  }

  if (!(await assertPertenece(req.tenantId, bodega_id, producto_id, res))) return;

  const [nuevo] = await db
    .insert(movimientos_inventario)
    .values({
      tenant_id: req.tenantId,
      bodega_id,
      producto_id,
      tipo: "entrada",
      cantidad: String(cantidad),
      costo_unitario: costo_unitario != null ? String(costo_unitario) : null,
      referencia_tipo: "ajuste_manual",
      observaciones: observaciones ?? null,
    })
    .returning();

  res.status(201).json(nuevo);
});

// POST /api/inventario/salida
router.post("/salida", async (req, res) => {
  const { bodega_id, producto_id, cantidad, observaciones } = req.body;

  if (!bodega_id || !producto_id || !cantidad) {
    return res.status(400).json({ error: "Campos requeridos: bodega_id, producto_id, cantidad." });
  }

  if (Number(cantidad) <= 0) {
    return res.status(400).json({ error: "La cantidad debe ser mayor a cero." });
  }

  if (!(await assertPertenece(req.tenantId, bodega_id, producto_id, res))) return;

  const [nuevo] = await db
    .insert(movimientos_inventario)
    .values({
      tenant_id: req.tenantId,
      bodega_id,
      producto_id,
      tipo: "salida",
      cantidad: String(cantidad),
      referencia_tipo: "ajuste_manual",
      observaciones: observaciones ?? null,
    })
    .returning();

  res.status(201).json(nuevo);
});

// POST /api/inventario/ajuste — cantidad puede ser negativa para reducir
router.post("/ajuste", async (req, res) => {
  const { bodega_id, producto_id, cantidad, observaciones } = req.body;

  if (!bodega_id || !producto_id || cantidad == null) {
    return res.status(400).json({ error: "Campos requeridos: bodega_id, producto_id, cantidad." });
  }

  if (!(await assertPertenece(req.tenantId, bodega_id, producto_id, res))) return;

  const [nuevo] = await db
    .insert(movimientos_inventario)
    .values({
      tenant_id: req.tenantId,
      bodega_id,
      producto_id,
      tipo: "ajuste",
      cantidad: String(cantidad),
      referencia_tipo: "ajuste_manual",
      observaciones: observaciones ?? null,
    })
    .returning();

  res.status(201).json(nuevo);
});

// Verifica que la bodega y el producto pertenezcan al tenant
async function assertPertenece(
  tenantId: string,
  bodegaId: string,
  productoId: string,
  res: Response,
): Promise<boolean> {
  const [bodega] = await db
    .select({ id: bodegas.id })
    .from(bodegas)
    .where(and(eq(bodegas.id, bodegaId), eq(bodegas.tenant_id, tenantId)))
    .limit(1);

  if (!bodega) {
    res.status(404).json({ error: "Bodega no encontrada." });
    return false;
  }

  const [producto] = await db
    .select({ id: productos.id })
    .from(productos)
    .where(and(eq(productos.id, productoId), eq(productos.tenant_id, tenantId)))
    .limit(1);

  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado." });
    return false;
  }

  return true;
}

export default router;
