import { Router, type Response } from "express";
import { db, movimientos_inventario, bodegas, productos, gastos } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";

const router = Router();

// GET /api/inventario — stock actual agrupado por producto + bodega
router.get("/", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Error en GET /inventario:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/inventario/kardex/:producto_id — movimientos cronológicos con saldo acumulado
router.get("/kardex/:producto_id", async (req, res) => {
  try {
    const { producto_id } = req.params;
    const { bodega_id } = req.query as { bodega_id?: string };

    const [producto] = await db
      .select({ id: productos.id, nombre: productos.nombre, codigo: productos.codigo })
      .from(productos)
      .where(and(eq(productos.id, producto_id), eq(productos.tenant_id, req.tenantId)))
      .limit(1);

    if (!producto) return res.status(404).json({ error: "Producto no encontrado." });

    const condicion = bodega_id
      ? and(
          eq(movimientos_inventario.tenant_id, req.tenantId),
          eq(movimientos_inventario.producto_id, producto_id),
          eq(movimientos_inventario.bodega_id, bodega_id),
        )
      : and(
          eq(movimientos_inventario.tenant_id, req.tenantId),
          eq(movimientos_inventario.producto_id, producto_id),
        );

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
        bodega: { id: bodegas.id, nombre: bodegas.nombre },
      })
      .from(movimientos_inventario)
      .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
      .where(condicion)
      .orderBy(movimientos_inventario.created_at);

    // Calcular saldo acumulado
    let saldo = 0;
    const kardex = movimientos.map((m) => {
      const cant = Number(m.cantidad);
      const delta = m.tipo === "salida" ? -cant : cant;
      saldo += delta;
      return { ...m, delta, saldo_acumulado: saldo };
    });

    res.json({ producto, kardex });
  } catch (err) {
    console.error("Error en GET /inventario/kardex:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/inventario/movimientos — historial completo
router.get("/movimientos", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Error en GET /inventario/movimientos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/entrada
router.post("/entrada", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Error en POST /inventario/entrada:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/salida
router.post("/salida", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Error en POST /inventario/salida:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/ajuste — cantidad puede ser negativa para reducir
router.post("/ajuste", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Error en POST /inventario/ajuste:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/recibir-lote
// Body: { bodega_id, items: [{producto_id, cantidad, precio_costo, nuevo_precio_venta?}],
//         proveedor_nombre?, fecha?, observaciones?, crear_gasto? }
router.post("/recibir-lote", async (req, res) => {
  try {
    const {
      bodega_id,
      items,
      proveedor_nombre,
      fecha,
      observaciones,
      crear_gasto = true,
    } = req.body as {
      bodega_id: string;
      items: { producto_id: string; cantidad: number; precio_costo: number; nuevo_precio_venta?: number }[];
      proveedor_nombre?: string;
      fecha?: string;
      observaciones?: string;
      crear_gasto?: boolean;
    };

    if (!bodega_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "bodega_id e items son requeridos." });
    }

    const [bodega] = await db
      .select({ id: bodegas.id })
      .from(bodegas)
      .where(and(eq(bodegas.id, bodega_id), eq(bodegas.tenant_id, req.tenantId)))
      .limit(1);
    if (!bodega) return res.status(404).json({ error: "Bodega no encontrada." });

    const fechaUso = fecha ?? new Date().toISOString().slice(0, 10);
    let totalCosto = 0;

    for (const item of items) {
      const { producto_id, cantidad, precio_costo, nuevo_precio_venta } = item;

      const [prod] = await db
        .select({ id: productos.id })
        .from(productos)
        .where(and(eq(productos.id, producto_id), eq(productos.tenant_id, req.tenantId)))
        .limit(1);
      if (!prod) return res.status(404).json({ error: `Producto ${producto_id} no encontrado.` });

      await db.insert(movimientos_inventario).values({
        tenant_id: req.tenantId,
        bodega_id,
        producto_id,
        tipo: "entrada",
        cantidad: String(cantidad),
        costo_unitario: String(precio_costo),
        referencia_tipo: "compra_proveedor",
        observaciones: proveedor_nombre ? `Compra a ${proveedor_nombre}` : (observaciones ?? null),
      });

      totalCosto += cantidad * precio_costo;

      if (nuevo_precio_venta != null && nuevo_precio_venta > 0) {
        await db
          .update(productos)
          .set({ precio_venta: String(nuevo_precio_venta), precio_base: String(nuevo_precio_venta) })
          .where(and(eq(productos.id, producto_id), eq(productos.tenant_id, req.tenantId)));
      }
    }

    let gastoId: string | null = null;
    if (crear_gasto && totalCosto > 0) {
      const desc = proveedor_nombre
        ? `Compra de mercancía — ${proveedor_nombre}`
        : "Compra de mercancía (recepción con IA)";
      const [nuevoGasto] = await db
        .insert(gastos)
        .values({
          tenant_id: req.tenantId,
          categoria: "compra_mercancia",
          descripcion: desc,
          monto: String(totalCosto),
          iva: "0",
          total: String(totalCosto),
          fecha: fechaUso,
          estado: "aprobado",
          observaciones: observaciones ?? null,
        })
        .returning({ id: gastos.id });
      gastoId = nuevoGasto.id;
    }

    return res.status(201).json({ ok: true, items_creados: items.length, total_costo: totalCosto, gasto_id: gastoId });
  } catch (err) {
    console.error("Error en POST /inventario/recibir-lote:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
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
