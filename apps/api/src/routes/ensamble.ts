import { Router } from "express";
import { db, componentes_producto, productos, movimientos_inventario, bodegas } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router = Router();

// GET /api/ensamble/:productoId/componentes
router.get("/:productoId/componentes", async (req, res) => {
  const { productoId } = req.params;

  const [producto] = await db
    .select()
    .from(productos)
    .where(and(eq(productos.id, productoId), eq(productos.tenant_id, req.tenantId)))
    .limit(1);
  if (!producto) return res.status(404).json({ error: "Producto no encontrado." });

  const comps = await db
    .select({
      id: componentes_producto.id,
      cantidad: componentes_producto.cantidad,
      componente: {
        id: productos.id,
        codigo: productos.codigo,
        nombre: productos.nombre,
        precio_base: productos.precio_base,
      },
    })
    .from(componentes_producto)
    .innerJoin(productos, eq(componentes_producto.componente_id, productos.id))
    .where(and(
      eq(componentes_producto.producto_id, productoId),
      eq(componentes_producto.tenant_id, req.tenantId),
    ));

  res.json(comps);
});

// POST /api/ensamble/:productoId/componentes
// { componente_id, cantidad }
router.post("/:productoId/componentes", async (req, res) => {
  const { productoId } = req.params;
  const { componente_id, cantidad } = req.body as { componente_id?: string; cantidad?: number };

  if (!componente_id || !cantidad || cantidad <= 0) {
    return res.status(400).json({ error: "componente_id y cantidad > 0 son requeridos." });
  }
  if (componente_id === productoId) {
    return res.status(400).json({ error: "Un producto no puede ser su propio componente." });
  }

  // Verificar que ambos productos pertenezcan al tenant
  const prods = await db
    .select({ id: productos.id })
    .from(productos)
    .where(and(inArray(productos.id, [productoId, componente_id]), eq(productos.tenant_id, req.tenantId)));

  if (prods.length < 2) {
    return res.status(404).json({ error: "Producto o componente no encontrado." });
  }

  // Evitar duplicados
  const [existente] = await db
    .select({ id: componentes_producto.id })
    .from(componentes_producto)
    .where(and(
      eq(componentes_producto.producto_id, productoId),
      eq(componentes_producto.componente_id, componente_id),
      eq(componentes_producto.tenant_id, req.tenantId),
    ))
    .limit(1);
  if (existente) {
    return res.status(422).json({ error: "Ya existe ese componente en la receta. Elimínalo y vuélvelo a agregar." });
  }

  const [nuevo] = await db
    .insert(componentes_producto)
    .values({ tenant_id: req.tenantId, producto_id: productoId, componente_id, cantidad: String(cantidad) })
    .returning();
  res.status(201).json(nuevo);
});

// DELETE /api/ensamble/:productoId/componentes/:componenteId
router.delete("/:productoId/componentes/:componenteId", async (req, res) => {
  const { productoId, componenteId } = req.params;

  const deleted = await db
    .delete(componentes_producto)
    .where(and(
      eq(componentes_producto.id, componenteId),
      eq(componentes_producto.producto_id, productoId),
      eq(componentes_producto.tenant_id, req.tenantId),
    ))
    .returning({ id: componentes_producto.id });

  if (!deleted.length) return res.status(404).json({ error: "Componente no encontrado." });
  res.sendStatus(204);
});

// PATCH /api/ensamble/:productoId/componentes/:componenteId
// Solo actualiza cantidad
router.patch("/:productoId/componentes/:componenteId", async (req, res) => {
  const { componenteId } = req.params;
  const { cantidad } = req.body as { cantidad?: number };
  if (!cantidad || cantidad <= 0) {
    return res.status(400).json({ error: "cantidad > 0 es requerida." });
  }

  const [actualizado] = await db
    .update(componentes_producto)
    .set({ cantidad: String(cantidad) })
    .where(and(
      eq(componentes_producto.id, componenteId),
      eq(componentes_producto.tenant_id, req.tenantId),
    ))
    .returning();

  if (!actualizado) return res.status(404).json({ error: "Componente no encontrado." });
  res.json(actualizado);
});

// POST /api/ensamble/:productoId/producir
// Registra salidas de todos los componentes en la bodega indicada
// Body: { bodega_id, cantidad } — cuántas unidades del producto ensamblado se producen
router.post("/:productoId/producir", async (req, res) => {
  const { productoId } = req.params;
  const { bodega_id, cantidad = 1 } = req.body as { bodega_id?: string; cantidad?: number };

  if (!bodega_id) return res.status(400).json({ error: "bodega_id es requerido." });
  if (!cantidad || cantidad <= 0) return res.status(400).json({ error: "cantidad > 0 es requerida." });

  const [bodega] = await db
    .select({ id: bodegas.id })
    .from(bodegas)
    .where(and(eq(bodegas.id, bodega_id), eq(bodegas.tenant_id, req.tenantId)))
    .limit(1);
  if (!bodega) return res.status(404).json({ error: "Bodega no encontrada." });

  const comps = await db
    .select()
    .from(componentes_producto)
    .where(and(eq(componentes_producto.producto_id, productoId), eq(componentes_producto.tenant_id, req.tenantId)));

  if (!comps.length) {
    return res.status(422).json({ error: "Este producto no tiene componentes definidos." });
  }

  // Registrar una salida por cada componente × cantidad producida
  const movimientos = comps.map((c) => ({
    tenant_id: req.tenantId,
    bodega_id,
    producto_id: c.componente_id,
    tipo: "salida" as const,
    cantidad: String(Number(c.cantidad) * cantidad),
    referencia_tipo: "ensamble",
    referencia_id: productoId,
    observaciones: `Producción de ${cantidad} unidad(es) de producto ensamblado`,
  }));

  await db.insert(movimientos_inventario).values(movimientos);

  res.json({ producidos: cantidad, movimientos_registrados: movimientos.length });
});

export default router;
