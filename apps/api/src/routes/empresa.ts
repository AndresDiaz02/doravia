import { Router } from "express";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import multer from "multer";
import { requireNotContador } from "../middleware/require-plan-feature.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /api/empresa
router.get("/", async (req, res) => {
  try {
    const [tenant] = await db
      .select({
        id: tenants.id,
        nombre: tenants.nombre,
        nit: tenants.nit,
        direccion: tenants.direccion,
        ciudad: tenants.ciudad,
        telefono: tenants.telefono,
        correo: tenants.correo,
        sitio_web: tenants.sitio_web,
        regimen: tenants.regimen,
        representante_legal: tenants.representante_legal,
        actividad_economica: tenants.actividad_economica,
        logo_base64: tenants.logo_base64,
        pie_factura: tenants.pie_factura,
      })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);

    if (!tenant) return res.status(404).json({ error: "Empresa no encontrada." });
    res.json(tenant);
  } catch (err) {
    console.error("Error en GET /empresa:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/empresa — actualiza datos de texto
router.patch("/", requireNotContador, async (req, res) => {
  try {
    const {
      nombre, direccion, ciudad, telefono, correo,
      sitio_web, regimen, representante_legal, actividad_economica, pie_factura,
    } = req.body;

    const [actualizado] = await db
      .update(tenants)
      .set({
        ...(nombre !== undefined && { nombre }),
        ...(direccion !== undefined && { direccion }),
        ...(ciudad !== undefined && { ciudad }),
        ...(telefono !== undefined && { telefono }),
        ...(correo !== undefined && { correo }),
        ...(sitio_web !== undefined && { sitio_web }),
        ...(regimen !== undefined && { regimen }),
        ...(representante_legal !== undefined && { representante_legal }),
        ...(actividad_economica !== undefined && { actividad_economica }),
        ...(pie_factura !== undefined && { pie_factura }),
      })
      .where(eq(tenants.id, req.tenantId))
      .returning();

    res.json(actualizado);
  } catch (err) {
    console.error("Error en PATCH /empresa:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/empresa/logo — sube logo como base64
router.post(
  "/logo",
  requireNotContador,
  upload.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });

      const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
      if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Solo se permiten imágenes PNG, JPG, WEBP o SVG." });
      }

      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

      const [actualizado] = await db
        .update(tenants)
        .set({ logo_base64: base64 })
        .where(eq(tenants.id, req.tenantId))
        .returning({ logo_base64: tenants.logo_base64 });

      res.json({ logo_base64: actualizado.logo_base64 });
    } catch (err) {
      console.error("Error en POST /empresa/logo:", err);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  },
);

// DELETE /api/empresa/logo
router.delete("/logo", requireNotContador, async (req, res) => {
  try {
    await db.update(tenants).set({ logo_base64: null }).where(eq(tenants.id, req.tenantId));
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /empresa/logo:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/empresa/addons — devuelve addons actuales
router.get("/addons", async (req, res) => {
  try {
    const [row] = await db
      .select({ addons: tenants.addons, plan: tenants.plan_id })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId));
    res.json({ addons: row?.addons ?? {} });
  } catch (err) {
    console.error("Error en GET /empresa/addons:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/empresa/addons — activa/desactiva un add-on (solo admin)
router.patch("/addons", async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede gestionar módulos adicionales." });
    }

    const { feature, enabled } = req.body as { feature: string; enabled: boolean };
    const ADDONS_DISPONIBLES = ["cotizaciones", "gastos", "inventario", "cartera_avanzada"];
    const ADDONS_POS = ["pos", "pos_multi_caja"];

    if (ADDONS_POS.includes(feature)) {
      return res.status(400).json({
        error: "El módulo POS requiere contratación con pago. Ve a Módulos adicionales para contratar.",
        code: "POS_REQUIRES_PAYMENT",
      });
    }

    if (!ADDONS_DISPONIBLES.includes(feature)) {
      return res.status(400).json({ error: "Módulo no disponible como add-on." });
    }

    const [current] = await db.select({ addons: tenants.addons }).from(tenants).where(eq(tenants.id, req.tenantId));
    const addonsActuales = (current?.addons ?? {}) as Record<string, boolean>;

    if (enabled) {
      addonsActuales[feature] = true;
    } else {
      delete addonsActuales[feature];
    }

    const [updated] = await db
      .update(tenants)
      .set({ addons: addonsActuales })
      .where(eq(tenants.id, req.tenantId))
      .returning({ addons: tenants.addons });

    res.json({ addons: updated.addons });
  } catch (err) {
    console.error("Error en PATCH /empresa/addons:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/empresa/onboarding — marca el wizard de bienvenida como completado
router.patch("/onboarding", async (req, res) => {
  try {
    await db
      .update(tenants)
      .set({ onboarding_completado: true })
      .where(eq(tenants.id, req.tenantId));
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en PATCH /empresa/onboarding:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
