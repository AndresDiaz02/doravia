import { Router } from "express";
import { assertCanUseIA } from "../guards/plan-limits.js";
import { analizarDocumentoGasto, analizarCompraProveedor, parsearDescripcionFactura, analizarImagenFactura } from "../services/ia.service.js";
import { PlanLimitError } from "@workspace/shared";
import { db, uso_ia } from "@workspace/db";
import { eq, and, count, gte, lt } from "drizzle-orm";

const router = Router();

function manejarErrorIA(err: unknown, res: import("express").Response) {
  if (err instanceof Error) {
    // Rate limit de Anthropic
    if (err.message.includes("429") || err.message.toLowerCase().includes("rate limit")) {
      return res.status(429).json({ error: "Límite de solicitudes a la IA alcanzado. Espera unos segundos e intenta de nuevo." });
    }
    // Clave inválida / sin créditos
    if (err.message.includes("401") || err.message.includes("403") || err.message.toLowerCase().includes("unauthorized")) {
      return res.status(502).json({ error: "Error de autenticación con la IA. Contacta a soporte." });
    }
    // Timeout
    if (err.message.toLowerCase().includes("timeout") || err.message.toLowerCase().includes("timed out")) {
      return res.status(504).json({ error: "La IA tardó demasiado. Intenta de nuevo." });
    }
  }
  console.error("Error IA:", err);
  return res.status(502).json({ error: "Error al procesar con IA. Intenta de nuevo." });
}

const MEDIA_TYPES_IMAGEN = ["image/jpeg", "image/png", "image/webp"] as const;
const MEDIA_TYPES_FACTURA = [...MEDIA_TYPES_IMAGEN, "application/pdf"] as const;
type MediaType = (typeof MEDIA_TYPES_IMAGEN)[number];
type MediaTypeFactura = (typeof MEDIA_TYPES_FACTURA)[number];

// POST /api/ia/analizar-imagen-factura
// Analiza una imagen o PDF y extrae ítems para pre-llenar líneas de factura de venta
router.post("/analizar-imagen-factura", async (req, res) => {
  try {
    await assertCanUseIA(req.tenant);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  const { imagen_base64, media_type } = req.body as { imagen_base64?: string; media_type?: string };

  if (!imagen_base64 || typeof imagen_base64 !== "string") {
    return res.status(400).json({ error: "imagen_base64 es requerido." });
  }
  if (!media_type || !(MEDIA_TYPES_FACTURA as readonly string[]).includes(media_type)) {
    return res.status(400).json({
      error: `media_type debe ser: ${MEDIA_TYPES_FACTURA.join(", ")}.`,
    });
  }
  if (imagen_base64.length > 14_000_000) {
    return res.status(400).json({ error: "El archivo no debe superar los 10 MB." });
  }

  try {
    const resultado = await analizarImagenFactura(req.tenantId, imagen_base64, media_type as MediaTypeFactura);
    return res.json(resultado);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No se pudo extraer")) {
      return res.status(422).json({ error: err.message });
    }
    return manejarErrorIA(err, res);
  }
});

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

  if (!media_type || !(MEDIA_TYPES_IMAGEN as readonly string[]).includes(media_type)) {
    return res.status(400).json({
      error: `media_type debe ser: ${MEDIA_TYPES_IMAGEN.join(", ")}.`,
    });
  }

  // Validar tamaño (base64 de 5MB ≈ 6.8M chars)
  if (imagen_base64.length > 7_000_000) {
    return res.status(400).json({ error: "La imagen no debe superar los 5 MB." });
  }

  try {
    const resultado = await analizarDocumentoGasto(req.tenantId, imagen_base64, media_type as MediaType);
    return res.json(resultado);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No se pudo extraer")) {
      return res.status(422).json({ error: err.message });
    }
    return manejarErrorIA(err, res);
  }
});

// POST /api/ia/analizar-compra
// Body: { imagen_base64, media_type }  — extrae ítems de factura de proveedor
router.post("/analizar-compra", async (req, res) => {
  try {
    await assertCanUseIA(req.tenant);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  const { imagen_base64, media_type } = req.body as { imagen_base64?: string; media_type?: string };

  if (!imagen_base64 || typeof imagen_base64 !== "string") {
    return res.status(400).json({ error: "imagen_base64 es requerido." });
  }
  if (!media_type || !(MEDIA_TYPES_IMAGEN as readonly string[]).includes(media_type)) {
    return res.status(400).json({ error: `media_type debe ser: ${MEDIA_TYPES_IMAGEN.join(", ")}.` });
  }
  if (imagen_base64.length > 7_000_000) {
    return res.status(400).json({ error: "La imagen no debe superar los 5 MB." });
  }

  try {
    const resultado = await analizarCompraProveedor(req.tenantId, imagen_base64, media_type as MediaType);
    return res.json(resultado);
  } catch (err) {
    if (err instanceof Error && err.message.includes("No se pudo extraer")) {
      return res.status(422).json({ error: err.message });
    }
    return manejarErrorIA(err, res);
  }
});

// POST /api/ia/parsear-descripcion
// Body: { texto: string }  — extrae campos de factura desde texto o dictado libre
router.post("/parsear-descripcion", async (req, res) => {
  try {
    await assertCanUseIA(req.tenant);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  const { texto } = req.body as { texto?: string };
  if (!texto || typeof texto !== "string" || !texto.trim()) {
    return res.status(400).json({ error: "texto es requerido." });
  }
  if (texto.length > 2000) {
    return res.status(400).json({ error: "El texto no puede superar los 2000 caracteres." });
  }

  try {
    const resultado = await parsearDescripcionFactura(req.tenantId, texto.trim());
    return res.json(resultado);
  } catch (err) {
    return manejarErrorIA(err, res);
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
