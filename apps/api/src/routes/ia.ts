import { Router } from "express";
import { assertCanUseIA } from "../guards/plan-limits.js";
import { analizarDocumentoGasto } from "../services/ia.service.js";
import { PlanLimitError } from "@workspace/shared";
import { db, uso_ia } from "@workspace/db";
import { eq, and, count, gte, lt } from "drizzle-orm";

const router = Router();

const MEDIA_TYPES_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES_PERMITIDOS)[number];

// POST /api/ia/analizar-documento
// Body: { imagen_base64: string, media_type: "image/jpeg"|"image/png"|"image/webp" }
router.post("/analizar-documento", async (req, res) => {
  try {
    await assertCanUseIA(req.tenant);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  const { imagen_base64, media_type } = req.body as {
    imagen_base64?: string;
    media_type?: string;
  };

  if (!imagen_base64 || typeof imagen_base64 !== "string") {
    return res.status(400).json({ error: "imagen_base64 es requerido." });
  }

  if (!media_type || !(MEDIA_TYPES_PERMITIDOS as readonly string[]).includes(media_type)) {
    return res.status(400).json({
      error: `media_type debe ser: ${MEDIA_TYPES_PERMITIDOS.join(", ")}.`,
    });
  }

  // Validar tamaño (base64 de 5MB ≈ 6.8M chars)
  if (imagen_base64.length > 7_000_000) {
    return res.status(400).json({ error: "La imagen no debe superar los 5 MB." });
  }

  try {
    const resultado = await analizarDocumentoGasto(
      req.tenantId,
      imagen_base64,
      media_type as MediaType,
    );
    return res.json(resultado);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No se pudo extraer")) {
      return res.status(422).json({ error: err.message });
    }
    console.error("Error IA:", err);
    return res.status(502).json({ error: "Error al procesar el documento con IA. Intenta de nuevo." });
  }
});

// GET /api/ia/uso-mes — cuántos docs procesados este mes
router.get("/uso-mes", async (req, res) => {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const inicioSiguiente = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

  const [{ value }] = await db
    .select({ value: count() })
    .from(uso_ia)
    .where(
      and(
        eq(uso_ia.tenant_id, req.tenantId),
        gte(uso_ia.created_at, inicioMes),
        lt(uso_ia.created_at, inicioSiguiente),
      )
    );

  const limite = req.tenant.plan.max_ia_docs_mes;
  return res.json({
    usados: value,
    limite,
    disponibles: limite === null ? null : Math.max(0, limite - value),
  });
});

export default router;
