import { Router } from "express";
import { db, configuracion_pagos_tenant, pagos_cotizacion, cotizaciones } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/require-plan-feature.js";
import { encrypt, decrypt } from "../services/encryption.js";
import { getTenantPagosConfig, PagosNotConfiguredError } from "../services/pagos/index.js";
import { verificarFirmaBold } from "../services/pagos/providers/bold.js";
import type { BoldCredenciales, EstadoPago } from "../services/pagos/types.js";
import { notificarAdminPago } from "../services/email.service.js";

const router = Router();
const IS_PROD = process.env.NODE_ENV === "production";

// ── GET /api/pagos/cotizaciones/configuracion ─────────────────────────────────
router.get("/configuracion", authenticate, requireRole(["admin"]), async (req, res) => {
  const [config] = await db
    .select()
    .from(configuracion_pagos_tenant)
    .where(eq(configuracion_pagos_tenant.tenant_id, req.tenantId))
    .limit(1);

  if (!config) return res.json({ configurado: false, proveedor: null });

  // Devolver solo los últimos 4 caracteres de la clave — nunca el texto completo
  let cred_preview: string | null = null;
  try {
    const raw = decrypt(config.credenciales_encriptadas);
    cred_preview = `****${raw.slice(-4)}`;
  } catch {
    // credencial inválida — igual devolvemos el estado
  }

  res.json({
    configurado: true,
    proveedor: config.proveedor,
    habilitado: config.habilitado,
    cred_preview,
    actualizado_en: config.actualizado_en,
  });
});

// ── PUT /api/pagos/cotizaciones/configuracion ─────────────────────────────────
router.put("/configuracion", authenticate, requireRole(["admin"]), async (req, res) => {
  const { proveedor, credenciales } = req.body as { proveedor?: string; credenciales?: unknown };

  if (!proveedor || !["bold", "stub"].includes(proveedor)) {
    return res.status(400).json({ error: "proveedor debe ser 'bold' o 'stub'." });
  }
  if (!credenciales || typeof credenciales !== "object") {
    return res.status(400).json({ error: "credenciales es requerido (objeto)." });
  }

  // Validar estructura según proveedor
  if (proveedor === "bold") {
    const c = credenciales as Partial<BoldCredenciales>;
    if (!c.api_key || !c.secret_key) {
      return res.status(400).json({ error: "Bold requiere api_key y secret_key." });
    }
  }
  if (proveedor === "stub") {
    if (typeof (credenciales as Record<string, unknown>).token !== "string") {
      return res.status(400).json({ error: "Stub requiere un campo 'token' (string)." });
    }
  }

  const credencialesJson = JSON.stringify(credenciales);
  const credencialesEncriptadas = encrypt(credencialesJson);

  await db
    .insert(configuracion_pagos_tenant)
    .values({
      tenant_id: req.tenantId,
      proveedor: proveedor as "bold" | "stub",
      credenciales_encriptadas: credencialesEncriptadas,
      habilitado: true,
      actualizado_por: req.userId,
      actualizado_en: new Date(),
    })
    .onConflictDoUpdate({
      target: configuracion_pagos_tenant.tenant_id,
      set: {
        proveedor: proveedor as "bold" | "stub",
        credenciales_encriptadas: credencialesEncriptadas,
        habilitado: true,
        actualizado_por: req.userId,
        actualizado_en: new Date(),
      },
    });

  res.json({ ok: true, proveedor });
});

// ── POST /api/pagos/cotizaciones/configuracion/probar ─────────────────────────
// Prueba que las credenciales son desencriptables y válidas para el proveedor
router.post("/configuracion/probar", authenticate, requireRole(["admin"]), async (req, res) => {
  try {
    const config = await getTenantPagosConfig(req.tenantId);
    void config; // solo verificamos que se puede cargar y parsear
    res.json({ ok: true, proveedor: config.proveedor });
  } catch (err) {
    if (err instanceof PagosNotConfiguredError) {
      return res.status(400).json({ ok: false, error: "No hay proveedor configurado." });
    }
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Error al probar conexión." });
  }
});

// ── POST /api/pagos/cotizaciones/bold/webhook ─────────────────────────────────
// Sin autenticación — verificado por firma HMAC de Bold con credencial del tenant
router.post("/bold/webhook", async (req, res) => {
  try {
    // El payload raw necesario para verificar firma HMAC
    const payloadRaw: Buffer = (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const body = req.body as Record<string, unknown>;
    const headers = req.headers as Record<string, string>;

    // Extraer referencia para identificar al tenant
    const data = (body.data as Record<string, unknown> | undefined) ?? body;
    const referencia = (data.reference_id ?? data.reference ?? body.reference_id) as string | undefined;
    if (!referencia) return res.sendStatus(200);

    // Buscar el pago por referencia para obtener tenant_id
    const [pago] = await db
      .select()
      .from(pagos_cotizacion)
      .where(eq(pagos_cotizacion.referencia_externa, referencia))
      .limit(1);

    if (!pago) return res.sendStatus(200); // no es nuestro — ignorar

    // Cargar credencial del tenant para verificar firma
    let eventSecret: string | undefined;
    try {
      const config = await getTenantPagosConfig(pago.tenant_id);
      const raw = decrypt(config.credenciales.raw);
      const creds = JSON.parse(raw) as BoldCredenciales;
      eventSecret = creds.event_secret;
    } catch {
      // Sin event_secret configurado, aceptamos el webhook (mismo comportamiento
      // que la integración Bold existente de suscripciones Doravia)
    }

    if (eventSecret && !verificarFirmaBold(payloadRaw, headers, eventSecret)) {
      console.warn(`[PagosCot] Firma Bold inválida para referencia ${referencia}`);
      return res.status(401).json({ error: "Firma inválida." });
    }

    // Procesar el cambio de estado
    const status = (data.payment_status ?? data.status ?? body.payment_status) as string | undefined;
    const map: Record<string, EstadoPago> = {
      APPROVED: "pagado", REJECTED: "fallido", FAILED: "fallido",
      EXPIRED: "expirado", REFUNDED: "reembolsado",
    };
    const nuevo_estado: EstadoPago = map[status?.toUpperCase() ?? ""] ?? "pendiente";

    if (nuevo_estado === "pagado" && pago.estado !== "pagado") {
      await db.transaction(async (tx) => {
        await tx.update(pagos_cotizacion)
          .set({ estado: "pagado", pagado_en: new Date(), metadata: body, updated_at: new Date() })
          .where(eq(pagos_cotizacion.id, pago.id));
        await tx.update(cotizaciones)
          .set({ estado: "pagada" })
          .where(and(eq(cotizaciones.id, pago.cotizacion_id), eq(cotizaciones.tenant_id, pago.tenant_id)));
      });
      // Notificación asíncrona al admin del tenant — no bloquea la respuesta al webhook
      void notificarAdminPago(pago.tenant_id, pago.cotizacion_id, Number(pago.monto)).catch((e) =>
        console.error("[PagosCot] Error enviando notificación:", e),
      );
    } else if (nuevo_estado !== "pendiente" && nuevo_estado !== pago.estado) {
      await db.update(pagos_cotizacion)
        .set({ estado: nuevo_estado, metadata: body, updated_at: new Date() })
        .where(eq(pagos_cotizacion.id, pago.id));
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("[PagosCot] Error en webhook Bold:", err);
    res.sendStatus(200); // nunca retornar 5xx a Bold para evitar reenvíos
  }
});

// ── POST /api/pagos/cotizaciones/stub/marcar-pagado ───────────────────────────
// Solo disponible fuera de producción — simula confirmación de pago para testing
router.post("/stub/marcar-pagado", async (req, res) => {
  if (IS_PROD) return res.status(404).json({ error: "Endpoint no disponible en producción." });

  const { referencia_externa, tenant_id } = req.body as { referencia_externa?: string; tenant_id?: string };
  if (!referencia_externa || !tenant_id) {
    return res.status(400).json({ error: "referencia_externa y tenant_id requeridos." });
  }

  const [pago] = await db
    .select()
    .from(pagos_cotizacion)
    .where(and(
      eq(pagos_cotizacion.referencia_externa, referencia_externa),
      eq(pagos_cotizacion.tenant_id, tenant_id),
    ))
    .limit(1);

  if (!pago) return res.status(404).json({ error: "Pago no encontrado." });
  if (pago.proveedor !== "stub") return res.status(400).json({ error: "Solo para pagos con proveedor stub." });
  if (pago.estado === "pagado") return res.json({ ok: true, mensaje: "Ya estaba pagado." });

  await db.transaction(async (tx) => {
    await tx.update(pagos_cotizacion)
      .set({ estado: "pagado", pagado_en: new Date(), updated_at: new Date() })
      .where(eq(pagos_cotizacion.id, pago.id));
    await tx.update(cotizaciones)
      .set({ estado: "pagada" })
      .where(and(eq(cotizaciones.id, pago.cotizacion_id), eq(cotizaciones.tenant_id, tenant_id)));
  });

  res.json({ ok: true, referencia_externa, cotizacion_id: pago.cotizacion_id, nuevo_estado: "pagado" });
});

export { router as pagosCotizacionRouter };
export default router;
