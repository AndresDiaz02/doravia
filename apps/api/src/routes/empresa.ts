import { Router } from "express";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import multer from "multer";
import { requireNotContador } from "../middleware/require-plan-feature.js";
import { isDianEnProduccion } from "../services/dian.service.js";
import { obtenerFoliosRestantes } from "../services/plemsi.service.js";
import { encrypt } from "../services/encryption.js";
import { getPlemsiCredentials, PlemsiNotConfiguredError } from "../services/get-plemsi-credentials.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /api/empresa/dian-modo — indica si la facturación electrónica está activa o en stub
router.get("/dian-modo", (_req, res) => {
  res.json({
    modo:      isDianEnProduccion() ? "produccion" : "stub",
    proveedor: process.env.DIAN_PROVEEDOR ?? "stub",
  });
});

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
        facturacion_electronica: tenants.facturacion_electronica,
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

// GET /api/empresa/pos-config-get
router.get("/pos-config-get", async (req, res) => {
  res.json({ pos_config: req.tenant.pos_config ?? {} });
});

// PATCH /api/empresa — actualiza datos de texto
router.patch("/", requireNotContador, async (req, res) => {
  try {
    const {
      nombre, direccion, ciudad, telefono, correo,
      sitio_web, regimen, representante_legal, actividad_economica, pie_factura,
      facturacion_electronica,
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
        ...(facturacion_electronica !== undefined && { facturacion_electronica }),
      })
      .where(eq(tenants.id, req.tenantId))
      .returning();

    res.json(actualizado);
  } catch (err) {
    console.error("Error en PATCH /empresa:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/empresa/plemsi-test — prueba la conexión con Plemsi
router.post("/plemsi-test", requireNotContador, async (req, res) => {
  try {
    let plemsiCreds: { apiKey: string; ambiente: string };
    try {
      plemsiCreds = await getPlemsiCredentials(req.tenantId);
    } catch (err) {
      if (err instanceof PlemsiNotConfiguredError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    const folios = await obtenerFoliosRestantes(plemsiCreds.apiKey, undefined, plemsiCreds.ambiente);
    return res.json({ ok: folios !== null, folios_restantes: folios });
  } catch (err) {
    console.error("Error en POST /empresa/plemsi-test:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/empresa/facturacion-electronica — habilita/deshabilita FE con registro de fecha
router.patch("/facturacion-electronica", requireNotContador, async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede modificar la configuración de facturación electrónica." });
    }

    const { habilitado, acepta_responsabilidad } = req.body as { habilitado: boolean; acepta_responsabilidad?: boolean };

    if (typeof habilitado !== "boolean") {
      return res.status(400).json({ error: "Campo requerido: habilitado (boolean)." });
    }

    // Si se deshabilita, registrar la fecha en pos_config para auditoría
    if (!habilitado) {
      const actual = (req.tenant.pos_config ?? {}) as Record<string, unknown>;
      const nuevo = { ...actual, fe_deshabilitada_en: new Date().toISOString() };
      await db.update(tenants)
        .set({ facturacion_electronica: false, pos_config: nuevo })
        .where(eq(tenants.id, req.tenantId));
    } else {
      await db.update(tenants)
        .set({ facturacion_electronica: true })
        .where(eq(tenants.id, req.tenantId));
    }

    res.json({ ok: true, habilitado, acepta_responsabilidad: acepta_responsabilidad ?? null });
  } catch (err) {
    console.error("Error en PATCH /empresa/facturacion-electronica:", err);
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

      const allowed = ["image/png", "image/jpeg", "image/webp"];
      if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Solo se permiten imágenes PNG, JPG o WEBP." });
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

// PATCH /api/empresa/pos-config — activa/desactiva módulos del POS (solo admin)
router.patch("/pos-config", requireNotContador, async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede configurar módulos POS." });
    }
    const { cartera_visible, citas_visible } = req.body as {
      cartera_visible?: boolean; citas_visible?: boolean;
    };
    const actual = (req.tenant.pos_config ?? {}) as Record<string, boolean>;
    const nuevo = {
      ...actual,
      ...(cartera_visible !== undefined && { cartera_visible }),
      ...(citas_visible   !== undefined && { citas_visible }),
    };
    const [updated] = await db
      .update(tenants)
      .set({ pos_config: nuevo })
      .where(eq(tenants.id, req.tenantId))
      .returning({ pos_config: tenants.pos_config });
    res.json({ pos_config: updated.pos_config });
  } catch (err) {
    console.error("Error en PATCH /empresa/pos-config:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/empresa/plemsi-config — devuelve configuración Plemsi sin exponer la key completa
router.get("/plemsi-config", requireNotContador, async (req, res) => {
  try {
    const [row] = await db
      .select({
        plemsi_empresa_id: tenants.plemsi_empresa_id,
        plemsi_ambiente: tenants.plemsi_ambiente,
        plemsi_habilitado: tenants.plemsi_habilitado,
        plemsi_api_key_encrypted: tenants.plemsi_api_key_encrypted,
        dian_proveedor_anterior: tenants.dian_proveedor_anterior,
      })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Empresa no encontrada." });

    const enc = row.plemsi_api_key_encrypted;
    return res.json({
      empresa_id: row.plemsi_empresa_id,
      ambiente: row.plemsi_ambiente,
      habilitado: row.plemsi_habilitado,
      api_key_configurada: !!enc,
      api_key_ultimos_4: enc ? enc.slice(-4) : null,
      proveedor_anterior: row.dian_proveedor_anterior,
    });
  } catch (err) {
    console.error("Error en GET /empresa/plemsi-config:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/empresa/plemsi — guarda configuración Plemsi cifrada (solo admin)
router.patch("/plemsi", requireNotContador, async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede modificar la configuración DIAN." });
    }
    const { api_key, empresa_id, ambiente, proveedor_anterior } = req.body as {
      api_key?: string; empresa_id?: string; ambiente?: string; proveedor_anterior?: string;
    };

    const updateSet: Record<string, unknown> = {};
    if (api_key !== undefined && api_key !== "") {
      updateSet.plemsi_api_key_encrypted = encrypt(api_key);
    }
    if (empresa_id !== undefined) updateSet.plemsi_empresa_id = empresa_id || null;
    if (ambiente !== undefined) updateSet.plemsi_ambiente = ambiente;
    if (proveedor_anterior !== undefined) updateSet.dian_proveedor_anterior = proveedor_anterior || null;

    // Marca como habilitado si tiene key (ya existente o recién guardada)
    const [current] = await db
      .select({ plemsi_api_key_encrypted: tenants.plemsi_api_key_encrypted })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);
    const tieneKey = updateSet.plemsi_api_key_encrypted !== undefined || !!current?.plemsi_api_key_encrypted;
    if (tieneKey) updateSet.plemsi_habilitado = true;

    const [actualizado] = await db
      .update(tenants)
      .set(updateSet)
      .where(eq(tenants.id, req.tenantId))
      .returning();

    // Devuelve sin la key completa — nunca se expone la key descifrada en respuestas HTTP
    const enc = actualizado.plemsi_api_key_encrypted;
    return res.json({
      empresa_id: actualizado.plemsi_empresa_id,
      ambiente: actualizado.plemsi_ambiente,
      habilitado: actualizado.plemsi_habilitado,
      api_key_configurada: !!enc,
      api_key_ultimos_4: enc ? enc.slice(-4) : null,
      proveedor_anterior: actualizado.dian_proveedor_anterior,
    });
  } catch (err) {
    console.error("Error en PATCH /empresa/plemsi:", err);
    res.status(500).json({ error: "Error interno." });
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
