import { Router } from "express";
import { db, facturas, clientes } from "@workspace/db";
import { eq, and, lt, isNull } from "drizzle-orm";

const router = Router();

// GET /api/alertas/cobro
// Facturas aceptadas con fecha de vencimiento pasada y sin registrar pago.
router.get("/cobro", async (req, res) => {
  const ahora = new Date();

  const vencidas = await db
    .select({
      id: facturas.id,
      numero: facturas.numero,
      fecha_emision: facturas.fecha_emision,
      fecha_vencimiento: facturas.fecha_vencimiento,
      total: facturas.total,
      cliente: {
        id: clientes.id,
        nombre: clientes.nombre,
        correo: clientes.correo,
        telefono: clientes.telefono,
      },
    })
    .from(facturas)
    .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
    .where(
      and(
        eq(facturas.tenant_id, req.tenantId),
        eq(facturas.estado, "aceptada"),
        isNull(facturas.pagada_at),
        lt(facturas.fecha_vencimiento, ahora),
      ),
    )
    .orderBy(facturas.fecha_vencimiento);

  res.json(vencidas);
});

export default router;
