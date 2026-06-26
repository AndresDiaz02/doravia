import { Router } from "express";
import { db, resoluciones_dian } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden gestionar las resoluciones DIAN." });
  }
  next();
}

// GET /api/resoluciones-dian — lista todas las resoluciones del tenant
router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(resoluciones_dian)
    .where(eq(resoluciones_dian.tenant_id, req.tenantId))
    .orderBy(desc(resoluciones_dian.created_at));

  res.json(rows);
});

// POST /api/resoluciones-dian — registra una nueva resolución y la activa
router.post("/", requireAdmin, async (req, res) => {
  const {
    numero_resolucion,
    fecha_resolucion,
    prefijo,
    consecutivo_desde,
    consecutivo_hasta,
    fecha_desde,
    fecha_hasta,
  } = req.body;

  if (
    !numero_resolucion ||
    !fecha_resolucion ||
    !prefijo ||
    consecutivo_desde == null ||
    consecutivo_hasta == null ||
    !fecha_desde ||
    !fecha_hasta
  ) {
    return res.status(400).json({
      error:
        "Campos requeridos: numero_resolucion, fecha_resolucion, prefijo, consecutivo_desde, consecutivo_hasta, fecha_desde, fecha_hasta.",
    });
  }

  if (Number(consecutivo_desde) > Number(consecutivo_hasta)) {
    return res.status(400).json({ error: "consecutivo_desde no puede ser mayor que consecutivo_hasta." });
  }

  const nueva = await db.transaction(async (tx) => {
    await tx
      .update(resoluciones_dian)
      .set({ activa: false })
      .where(eq(resoluciones_dian.tenant_id, req.tenantId));

    const [row] = await tx
      .insert(resoluciones_dian)
      .values({
        tenant_id: req.tenantId,
        numero_resolucion,
        fecha_resolucion,
        prefijo,
        consecutivo_desde: Number(consecutivo_desde),
        consecutivo_hasta: Number(consecutivo_hasta),
        consecutivo_actual: Number(consecutivo_desde),
        fecha_desde,
        fecha_hasta,
        activa: true,
      })
      .returning();

    return row;
  });

  res.status(201).json(nueva);
});

// PATCH /api/resoluciones-dian/:id/activar — activa una resolución existente
router.patch("/:id/activar", requireAdmin, async (req, res) => {
  const [resolucion] = await db
    .select()
    .from(resoluciones_dian)
    .where(and(eq(resoluciones_dian.id, req.params.id), eq(resoluciones_dian.tenant_id, req.tenantId)))
    .limit(1);

  if (!resolucion) return res.status(404).json({ error: "Resolución no encontrada." });

  const actualizada = await db.transaction(async (tx) => {
    await tx
      .update(resoluciones_dian)
      .set({ activa: false })
      .where(eq(resoluciones_dian.tenant_id, req.tenantId));

    const [row] = await tx
      .update(resoluciones_dian)
      .set({ activa: true })
      .where(eq(resoluciones_dian.id, resolucion.id))
      .returning();

    return row;
  });

  res.json(actualizada);
});

export default router;
