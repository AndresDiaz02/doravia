import { Router } from "express";
import { db, bodegas } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { assertCanAddBodega } from "../guards/plan-limits.js";
import { PlanLimitError } from "@workspace/shared";

const router = Router();

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(bodegas)
    .where(eq(bodegas.tenant_id, req.tenantId))
    .orderBy(bodegas.nombre);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { nombre, descripcion } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "Campo requerido: nombre." });
  }

  try {
    await assertCanAddBodega(req.tenant);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  const [nueva] = await db
    .insert(bodegas)
    .values({ tenant_id: req.tenantId, nombre, descripcion: descripcion ?? null })
    .returning();

  res.status(201).json(nueva);
});

router.patch("/:id", async (req, res) => {
  const [bodega] = await db
    .select()
    .from(bodegas)
    .where(and(eq(bodegas.id, req.params.id), eq(bodegas.tenant_id, req.tenantId)))
    .limit(1);

  if (!bodega) return res.status(404).json({ error: "Bodega no encontrada." });

  const { nombre, descripcion, activo } = req.body;

  const [actualizada] = await db
    .update(bodegas)
    .set({
      ...(nombre !== undefined && { nombre }),
      ...(descripcion !== undefined && { descripcion }),
      ...(activo !== undefined && { activo }),
    })
    .where(eq(bodegas.id, bodega.id))
    .returning();

  res.json(actualizada);
});

export default router;
