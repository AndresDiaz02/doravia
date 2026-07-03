import { Router } from "express";
import { db, plans, tenants, bold_payments, user_accesos, comisiones_contador, users } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { bold, type BoldPaymentAttempt as BoldPaymentAttemptType } from "../services/bold.service.js";

const router = Router();

const APP_URL = process.env.APP_URL ?? process.env.FRONTEND_URL ?? "http://localhost:5173";
const POS_PLANS = ["punto", "punto_plus"];

// ── Lógica de activar plan (idéntica a Wompi) ─────────────────────────────────
async function activarPlan(tenantId: string, planSlug: string): Promise<void> {
  if (POS_PLANS.includes(planSlug)) {
    const [t] = await db.select({ addons: tenants.addons }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const addons: Record<string, boolean> = {
      ...((t?.addons ?? {}) as Record<string, boolean>),
      pos: true,
      ...(planSlug === "punto_plus" ? { pos_multi_caja: true } : {}),
    };
    await db.update(tenants).set({ addons }).where(eq(tenants.id, tenantId));
    console.log(`[Bold] POS addon activado (${planSlug}) para tenant ${tenantId}`);
    return;
  }

  const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
  if (!plan) {
    console.error(`[Bold] Plan "${planSlug}" no encontrado para activar en tenant ${tenantId}`);
    return;
  }

  const [tenant] = await db
    .select({ id: tenants.id, plan_ends_at: tenants.plan_ends_at })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return;

  const hoy = new Date();
  const inicioActual = new Date(tenant.plan_ends_at ?? hoy);
  const inicio = inicioActual > hoy ? inicioActual : hoy;
  const fin = new Date(inicio);
  fin.setFullYear(fin.getFullYear() + 1);

  await db.update(tenants).set({
    plan_id: plan.id,
    plan_starts_at: inicio,
    plan_ends_at: fin,
    activo: true,
    ultimo_pago_confirmado_at: hoy,
  }).where(eq(tenants.id, tenantId));

  console.log(`[Bold] Plan ${planSlug} activado para tenant ${tenantId} → ${fin.toISOString()}`);

  void generarComisionContador(tenantId, plan.precio_anual_cop, "renovacion").catch((e) =>
    console.error("[Bold] Error generando comisión contador:", e),
  );
}

async function generarComisionContador(
  tenantId: string,
  planPrecio: number,
  tipo: "venta_inicial" | "renovacion",
): Promise<void> {
  if (!planPrecio) return;
  const [acceso] = await db
    .select({ user_id: user_accesos.user_id })
    .from(user_accesos)
    .where(and(eq(user_accesos.tenant_id, tenantId), eq(user_accesos.role, "contador")))
    .limit(1);
  if (!acceso) return;
  const PORCENTAJE = 15;
  const valor_cop = Math.round((planPrecio * PORCENTAJE) / 100);
  await db.insert(comisiones_contador).values({
    contador_user_id: acceso.user_id,
    tenant_id: tenantId,
    tipo,
    porcentaje: String(PORCENTAJE),
    base_cop: planPrecio,
    valor_cop,
    pagada: false,
  });
  console.log(`[Bold] Comisión ${tipo} generada: $${valor_cop} COP para contador ${acceso.user_id}`);
}

// ── GET /api/pagos/bold/bancos-pse ────────────────────────────────────────────
router.get("/bancos-pse", async (_req, res) => {
  try {
    const result = await bold.bancosPSE();
    if (!result.ok) return res.status(502).json({ error: result.error ?? "Error consultando bancos PSE." });
    return res.json(result.data);
  } catch (err) {
    console.error("[Bold] Error en GET /bancos-pse:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST /api/pagos/bold/intent ───────────────────────────────────────────────
router.post("/intent", authenticate, async (req, res) => {
  try {
    const { plan_id, monto, descripcion } = req.body as {
      plan_id?: string;
      monto?: number;
      descripcion?: string;
    };

    if (!plan_id || !monto) {
      return res.status(400).json({ error: "plan_id y monto son requeridos." });
    }

    const tenantId = req.tenantId;
    const reference_id = `DORAVIA-${tenantId.slice(0, 8)}-${Date.now()}`;
    const callback_url = `${APP_URL}/resultado-pago?ref=${reference_id}`;
    const desc = descripcion ?? `Suscripción Doravia — ${plan_id}`;

    // Datos del usuario para Bold
    const [userData] = await db
      .select({ nombre: users.nombre, email: users.email })
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1);
    const userName = userData?.nombre ?? "Usuario Doravia";
    const userEmail = userData?.email ?? "";

    const intentBody = {
      reference_id,
      amount: { currency: "COP" as const, total_amount: monto },
      description: desc,
      callback_url,
      customer: { name: userName, email: userEmail },
    };

    const result = await bold.crearIntencion(intentBody);
    if (!result.ok) {
      return res.status(502).json({ error: result.error ?? "No se pudo crear la intención de pago." });
    }

    // Guardar en bold_payments con estado PENDING
    await db.insert(bold_payments).values({
      tenant_id: tenantId,
      reference_id,
      plan_id,
      monto: String(monto),
      moneda: "COP",
      estado: "PENDING",
      descripcion: desc,
      callback_url,
      bold_response: result.data,
    });

    return res.json({ reference_id, ...result.data });
  } catch (err) {
    console.error("[Bold] Error en POST /intent:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST /api/pagos/bold/pay ──────────────────────────────────────────────────
router.post("/pay", authenticate, async (req, res) => {
  try {
    const { reference_id, payment_method, payer, device_fingerprint } = req.body as {
      reference_id?: string;
      payment_method?: Record<string, unknown>;
      payer?: Record<string, unknown>;
      device_fingerprint?: Record<string, unknown>;
    };

    if (!reference_id || !payment_method || !payer) {
      return res.status(400).json({ error: "reference_id, payment_method y payer son requeridos." });
    }

    const tenantId = req.tenantId;

    // Verificar que el pago pertenece a este tenant
    const [registro] = await db
      .select()
      .from(bold_payments)
      .where(and(eq(bold_payments.reference_id, reference_id), eq(bold_payments.tenant_id, tenantId)))
      .limit(1);

    if (!registro) {
      return res.status(404).json({ error: "Referencia de pago no encontrada." });
    }

    const payBody = {
      reference_id,
      payer: payer as BoldPaymentAttemptType["payer"],
      payment_method,
      device_fingerprint: device_fingerprint ?? {},
    };

    const result = await bold.ejecutarPago(payBody as BoldPaymentAttemptType);

    const boldData = result.data ?? {};
    const transaction_id = boldData.transaction_id as string | undefined;
    const boldStatus = (boldData.status as string | undefined) ?? "";
    const next_actions = boldData.next_actions as Array<{ type: string; redirect_url?: string }> | undefined;
    const metodoPago = (payment_method.name as string | undefined) ?? "";

    // Actualizar registro
    await db.update(bold_payments).set({
      transaction_id: transaction_id ?? registro.transaction_id,
      metodo_pago: metodoPago,
      estado: boldStatus || "RUNNING",
      bold_response: boldData,
      updated_at: new Date(),
    }).where(eq(bold_payments.reference_id, reference_id));

    if (!result.ok) {
      // Marcar como rechazado
      await db.update(bold_payments).set({ estado: "REJECTED", updated_at: new Date() })
        .where(eq(bold_payments.reference_id, reference_id));
      return res.status(402).json({ error: result.error ?? "Pago rechazado.", data: boldData });
    }

    // Verificar si requiere acción adicional (3DS / redirect)
    if (next_actions && next_actions.length > 0) {
      const redirect = next_actions.find((a) => a.redirect_url);
      return res.json({
        requires_action: true,
        redirect_url: redirect?.redirect_url,
        next_actions,
        transaction_id,
        status: boldStatus,
      });
    }

    // Pago aprobado directamente
    if (boldStatus === "APPROVED") {
      await db.update(bold_payments).set({ estado: "APPROVED", updated_at: new Date() })
        .where(eq(bold_payments.reference_id, reference_id));
      if (registro.plan_id) {
        await activarPlan(tenantId, registro.plan_id);
      }
    }

    return res.json({ requires_action: false, status: boldStatus, transaction_id, data: boldData });
  } catch (err) {
    console.error("[Bold] Error en POST /pay:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /api/pagos/bold/status/:reference_id ─────────────────────────────────
// Este endpoint verifica el token pero NO bloquea por suscripción vencida,
// porque el usuario puede necesitar verificar el resultado tras renovar el plan.
router.get("/status/:reference_id", async (req, res) => {
  try {
    const { reference_id } = req.params;

    // Verificar JWT sin chequeo de suscripción
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Se requiere autenticación." });
    }
    let tenantId: string;
    try {
      const payload = verifyAccessToken(header.slice(7));
      tenantId = payload.tenantId;
    } catch {
      return res.status(401).json({ error: "Token inválido o expirado." });
    }

    const [registro] = await db
      .select()
      .from(bold_payments)
      .where(and(eq(bold_payments.reference_id, reference_id), eq(bold_payments.tenant_id, tenantId)))
      .limit(1);

    if (!registro) {
      return res.status(404).json({ error: "Referencia de pago no encontrada." });
    }

    // Consultar estado actual en Bold
    const result = await bold.estadoPago(reference_id);
    if (!result.ok) {
      // Retornar el estado local si Bold no responde
      return res.json({ reference_id, estado: registro.estado, transaction_id: registro.transaction_id });
    }

    const boldData = result.data ?? {};
    const boldStatus = (boldData.status as string | undefined) ?? registro.estado;

    // Si Bold dice APPROVED y en BD no está aún aprobado → actualizar plan
    if (boldStatus === "APPROVED" && registro.estado !== "APPROVED") {
      await db.update(bold_payments).set({ estado: "APPROVED", bold_response: boldData, updated_at: new Date() })
        .where(eq(bold_payments.reference_id, reference_id));
      if (registro.plan_id) {
        await activarPlan(tenantId, registro.plan_id);
      }
    } else if (boldStatus !== registro.estado) {
      await db.update(bold_payments).set({ estado: boldStatus, bold_response: boldData, updated_at: new Date() })
        .where(eq(bold_payments.reference_id, reference_id));
    }

    return res.json({
      reference_id,
      estado: boldStatus,
      transaction_id: registro.transaction_id ?? (boldData.transaction_id as string | undefined),
      data: boldData,
    });
  } catch (err) {
    console.error("[Bold] Error en GET /status/:reference_id:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST /api/pagos/bold/webhook (sin autenticación — viene de Bold) ──────────
router.post("/webhook", async (req, res) => {
  try {
    const event = req.body as {
      event?: string;
      data?: {
        reference_id?: string;
        transaction_id?: string;
        status?: string;
      };
    };

    const reference_id = event?.data?.reference_id;
    const transaction_id = event?.data?.transaction_id;
    const status = event?.data?.status;

    if (!reference_id || !status) return res.sendStatus(200);

    const [registro] = await db
      .select()
      .from(bold_payments)
      .where(eq(bold_payments.reference_id, reference_id))
      .limit(1);

    if (!registro) return res.sendStatus(200);

    // Actualizar estado
    await db.update(bold_payments).set({
      estado: status,
      transaction_id: transaction_id ?? registro.transaction_id,
      bold_response: event as unknown as Record<string, unknown>,
      updated_at: new Date(),
    }).where(eq(bold_payments.reference_id, reference_id));

    // Activar plan si fue aprobado y no estaba aprobado antes
    if (status === "APPROVED" && registro.estado !== "APPROVED" && registro.plan_id) {
      await activarPlan(registro.tenant_id, registro.plan_id);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("[Bold] Error en POST /webhook:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

export { router as boldRouter };
export default router;
