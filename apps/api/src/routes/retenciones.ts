import { Router } from "express";
import { db, retenciones_config, TIPOS_RETENCION } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

// GET /api/retenciones
router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(retenciones_config)
      .where(eq(retenciones_config.tenant_id, req.tenantId))
      .orderBy(retenciones_config.tipo, retenciones_config.nombre);
    res.json(rows);
  } catch (err) {
    console.error("Error en GET /retenciones:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/retenciones
router.post("/", async (req, res) => {
  try {
    const { nombre, tipo, porcentaje } = req.body as { nombre: string; tipo: string; porcentaje: number };

    if (!nombre || !tipo || porcentaje == null) {
      return res.status(400).json({ error: "Campos requeridos: nombre, tipo, porcentaje." });
    }
    if (!(TIPOS_RETENCION as readonly string[]).includes(tipo)) {
      return res.status(400).json({ error: `tipo debe ser: ${TIPOS_RETENCION.join(", ")}.` });
    }
    if (isNaN(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
      return res.status(400).json({ error: "porcentaje debe ser un número entre 0 y 100." });
    }

    const [nueva] = await db
      .insert(retenciones_config)
      .values({ tenant_id: req.tenantId, nombre, tipo: tipo as typeof TIPOS_RETENCION[number], porcentaje: String(porcentaje) })
      .returning();

    res.status(201).json(nueva);
  } catch (err) {
    console.error("Error en POST /retenciones:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/retenciones/:id
router.patch("/:id", async (req, res) => {
  try {
    const [ret] = await db
      .select()
      .from(retenciones_config)
      .where(and(eq(retenciones_config.id, req.params.id), eq(retenciones_config.tenant_id, req.tenantId)))
      .limit(1);

    if (!ret) return res.status(404).json({ error: "Retención no encontrada." });

    const { nombre, porcentaje, activo } = req.body as { nombre?: string; porcentaje?: number; activo?: boolean };

    const [actualizada] = await db
      .update(retenciones_config)
      .set({
        ...(nombre !== undefined && { nombre }),
        ...(porcentaje !== undefined && { porcentaje: String(porcentaje) }),
        ...(activo !== undefined && { activo }),
      })
      .where(eq(retenciones_config.id, ret.id))
      .returning();

    res.json(actualizada);
  } catch (err) {
    console.error("Error en PATCH /retenciones/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// DELETE /api/retenciones/:id
router.delete("/:id", async (req, res) => {
  try {
    const [ret] = await db
      .select({ id: retenciones_config.id })
      .from(retenciones_config)
      .where(and(eq(retenciones_config.id, req.params.id), eq(retenciones_config.tenant_id, req.tenantId)))
      .limit(1);

    if (!ret) return res.status(404).json({ error: "Retención no encontrada." });

    await db.delete(retenciones_config).where(eq(retenciones_config.id, ret.id));
    res.status(204).end();
  } catch (err) {
    console.error("Error en DELETE /retenciones/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
