import { Router } from "express";
import { db, resoluciones_dian } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { audit } from "../services/audit.service.js";
import { registrarResolucion as plemsiRegistrarResolucion, obtenerFoliosRestantes } from "../services/plemsi.service.js";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden gestionar las resoluciones DIAN." });
  }
  next();
}

// GET /api/resoluciones-dian — lista todas las resoluciones del tenant
router.get("/", async (req, res) => {
  // Solo disponible si la empresa tiene habilitada la facturación electrónica
  if (!req.tenant.facturacion_electronica) {
    return res.status(403).json({ error: "La facturación electrónica no está habilitada para esta empresa." });
  }
  try {
    const rows = await db
      .select()
      .from(resoluciones_dian)
      .where(eq(resoluciones_dian.tenant_id, req.tenantId))
      .orderBy(desc(resoluciones_dian.created_at));

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /resoluciones-dian:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/resoluciones-dian — registra una nueva resolución y la activa
router.post("/", requireAdmin, async (req, res) => {
  // Solo disponible si la empresa tiene habilitada la facturación electrónica
  if (!req.tenant.facturacion_electronica) {
    return res.status(403).json({ error: "La facturación electrónica no está habilitada para esta empresa." });
  }
  try {
    const {
      numero_resolucion,
      fecha_resolucion,
      prefijo,
      consecutivo_desde,
      consecutivo_hasta,
      fecha_desde,
      fecha_hasta,
      clave_tecnica,
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
          clave_tecnica: clave_tecnica ?? null,
          activa: true,
        })
        .returning();

      return row;
    });

    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "resolucion_dian.registrada", entidadTipo: "resolucion_dian", entidadId: nueva.id, detalle: { numero: nueva.numero_resolucion, prefijo: nueva.prefijo, desde: nueva.consecutivo_desde, hasta: nueva.consecutivo_hasta }, ip: req.ip });

    // Registrar en Plemsi automáticamente si el tenant tiene API key
    if (req.tenant.facturacion_electronica) {
      const posConfig = req.tenant.pos_config as Record<string, unknown> | null;
      const apiKey = (posConfig?.plemsi_api_key as string | undefined) ??
        process.env.PLEMSI_API_KEY_DEFAULT ?? "";

      if (apiKey) {
        void (async () => {
          try {
            const resultado = await plemsiRegistrarResolucion({
              apiKey,
              prefix: nueva.prefijo,
              resolution: nueva.numero_resolucion,
              resolution_date: nueva.fecha_resolucion,
              date_from: nueva.fecha_desde,
              date_to: nueva.fecha_hasta,
              from: nueva.consecutivo_desde,
              to: nueva.consecutivo_hasta,
            });
            if (resultado.ok && resultado.plemsi_id) {
              await db
                .update(resoluciones_dian)
                .set({ plemsi_id: resultado.plemsi_id })
                .where(eq(resoluciones_dian.id, nueva.id));
              console.log(`[PLEMSI] Resolución ${nueva.numero_resolucion} registrada. ID: ${resultado.plemsi_id}`);
            } else {
              console.error(`[PLEMSI] Error registrando resolución ${nueva.numero_resolucion}: ${resultado.error}`);
            }
          } catch (e) {
            console.error("[PLEMSI] Error inesperado registrando resolución:", e);
          }
        })();
      }
    }

    res.status(201).json(nueva);
  } catch (err) {
    console.error("Error en POST /resoluciones-dian:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/resoluciones-dian/folios-restantes — consulta folios disponibles en Plemsi
router.get("/folios-restantes", async (req, res) => {
  if (!req.tenant.facturacion_electronica) {
    return res.status(403).json({ error: "La facturación electrónica no está habilitada para esta empresa." });
  }
  const posConfig = req.tenant.pos_config as Record<string, unknown> | null;
  const apiKey = (posConfig?.plemsi_api_key as string | undefined) ??
    process.env.PLEMSI_API_KEY_DEFAULT ?? "";

  if (!apiKey) return res.status(400).json({ error: "No hay API key de Plemsi configurada." });

  const folios = await obtenerFoliosRestantes(apiKey);
  if (folios === null) {
    return res.status(502).json({ error: "No se pudo consultar los folios en Plemsi." });
  }
  return res.json({ folios_restantes: folios });
});

// PATCH /api/resoluciones-dian/:id/activar — activa una resolución existente
router.patch("/:id/activar", requireAdmin, async (req, res) => {
  // Solo disponible si la empresa tiene habilitada la facturación electrónica
  if (!req.tenant.facturacion_electronica) {
    return res.status(403).json({ error: "La facturación electrónica no está habilitada para esta empresa." });
  }
  try {
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
  } catch (err) {
    console.error("Error en PATCH /resoluciones-dian/:id/activar:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
