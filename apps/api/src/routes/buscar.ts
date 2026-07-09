import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// GET /api/buscar?q=:query
// Búsqueda global: clientes, facturas, productos, proveedores
router.get("/", async (req, res) => {
  const { tenantId } = req as unknown as { tenantId: string };
  const q = String(req.query.q ?? "").trim();

  if (q.length < 2) {
    return res.json({ clientes: [], facturas: [], productos: [], proveedores: [] });
  }

  const like = `%${q}%`;

  const [clientes, facturas, productos, proveedores] = await Promise.all([
    db.execute(sql`
      SELECT id, nombre, numero_documento AS nit
      FROM clientes
      WHERE tenant_id = ${tenantId}
        AND (nombre ILIKE ${like} OR numero_documento ILIKE ${like})
      ORDER BY nombre
      LIMIT 5
    `),
    db.execute(sql`
      SELECT f.id, f.numero_factura, c.nombre AS cliente_nombre, f.total::text AS total
      FROM facturas f
      JOIN clientes c ON c.id = f.cliente_id
      WHERE f.tenant_id = ${tenantId}
        AND (f.numero_factura ILIKE ${like} OR c.nombre ILIKE ${like})
      ORDER BY f.created_at DESC
      LIMIT 5
    `),
    db.execute(sql`
      SELECT id, nombre, codigo, precio_venta::text AS precio_venta
      FROM productos
      WHERE tenant_id = ${tenantId}
        AND (nombre ILIKE ${like} OR codigo ILIKE ${like})
      ORDER BY nombre
      LIMIT 5
    `),
    db.execute(sql`
      SELECT id, nombre
      FROM proveedores
      WHERE tenant_id = ${tenantId}
        AND nombre ILIKE ${like}
      ORDER BY nombre
      LIMIT 5
    `),
  ]);

  return res.json({
    clientes: Array.from(clientes),
    facturas: Array.from(facturas),
    productos: Array.from(productos),
    proveedores: Array.from(proveedores),
  });
});

export default router;
