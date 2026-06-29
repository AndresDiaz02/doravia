import { Router } from "express";
import { db, tutorial_progress } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const SLUGS_VALIDOS = ["facturas", "inventario", "pos"] as const;
type TutorialSlug = (typeof SLUGS_VALIDOS)[number];

// GET /api/tutoriales/estado
// Retorna qué tutoriales completó/saltó el usuario actual
router.get("/estado", async (req, res) => {
  const rows = await db
    .select()
    .from(tutorial_progress)
    .where(and(
      eq(tutorial_progress.user_id, req.userId),
      eq(tutorial_progress.tenant_id, req.tenantId),
    ));

  const estado: Record<string, { completado: boolean; saltado: boolean }> = {};
  for (const slug of SLUGS_VALIDOS) {
    const row = rows.find((r) => r.slug === slug);
    estado[slug] = {
      completado: !!row?.completado_at,
      saltado:    !!row?.saltado_at,
    };
  }

  return res.json(estado);
});

// POST /api/tutoriales/:slug/completar
router.post("/:slug/completar", async (req, res) => {
  const { slug } = req.params;
  if (!(SLUGS_VALIDOS as readonly string[]).includes(slug)) {
    return res.status(400).json({ error: "Tutorial inválido." });
  }

  const [existing] = await db
    .select()
    .from(tutorial_progress)
    .where(and(
      eq(tutorial_progress.user_id, req.userId),
      eq(tutorial_progress.tenant_id, req.tenantId),
      eq(tutorial_progress.slug, slug),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(tutorial_progress)
      .set({ completado_at: new Date(), saltado_at: null })
      .where(eq(tutorial_progress.id, existing.id))
      .returning();
    return res.json(updated);
  }

  const [created] = await db
    .insert(tutorial_progress)
    .values({
      user_id:       req.userId,
      tenant_id:     req.tenantId,
      slug:          slug as TutorialSlug,
      completado_at: new Date(),
    })
    .returning();

  return res.status(201).json(created);
});

// POST /api/tutoriales/:slug/saltar
router.post("/:slug/saltar", async (req, res) => {
  const { slug } = req.params;
  if (!(SLUGS_VALIDOS as readonly string[]).includes(slug)) {
    return res.status(400).json({ error: "Tutorial inválido." });
  }

  const [existing] = await db
    .select()
    .from(tutorial_progress)
    .where(and(
      eq(tutorial_progress.user_id, req.userId),
      eq(tutorial_progress.tenant_id, req.tenantId),
      eq(tutorial_progress.slug, slug),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(tutorial_progress)
      .set({ saltado_at: new Date() })
      .where(eq(tutorial_progress.id, existing.id))
      .returning();
    return res.json(updated);
  }

  const [created] = await db
    .insert(tutorial_progress)
    .values({
      user_id:     req.userId,
      tenant_id:   req.tenantId,
      slug:        slug as TutorialSlug,
      saltado_at:  new Date(),
    })
    .returning();

  return res.status(201).json(created);
});

// DELETE /api/tutoriales/:slug/reset — solo para testing/dev
router.delete("/:slug/reset", async (req, res) => {
  const { slug } = req.params;
  if (!(SLUGS_VALIDOS as readonly string[]).includes(slug)) {
    return res.status(400).json({ error: "Tutorial inválido." });
  }

  await db
    .delete(tutorial_progress)
    .where(and(
      eq(tutorial_progress.user_id, req.userId),
      eq(tutorial_progress.tenant_id, req.tenantId),
      eq(tutorial_progress.slug, slug),
    ));

  return res.json({ ok: true });
});

export default router;
