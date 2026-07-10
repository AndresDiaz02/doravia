import { Router } from "express";
import { db, plans, tenants, bold_payments, user_accesos, comisiones_contador } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { bold, generarFirma, BOLD_IDENTITY_KEY } from "../services/bold.service.js";
import {
  reactivarPorPago,
  calcularMontoCuota,
  type Modalidad,
} from "../services/subscription.service.js";

const router = Router();

const APP_URL = process.env.APP_URL ?? process.env.FRONTEND_URL ?? "http://localhost:5173";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Siguiente número de cuota para un tenant + plan en modalidad '3cuotas'. */
async function siguienteCuota3(tenantId: string, planSlug: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bold_payments)
    .where(
      and(
        eq(bold_payments.tenant_id, tenantId),
        eq(bold_payments.plan_id, planSlug),
        eq(bold_payments.modalidad, "3cuotas"),
        eq(bold_payments.estado, "APPROVED"),
      ),
    );
  const pagadas = Number(row?.n ?? 0);
  return Math.min(pagadas + 1, 3);
}

/**
 * Activa o extiende el plan tras un pago APPROVED.
 * Para planes POS activa el addon; para ERP llama reactivarPorPago con modalidad.
 * También genera la comisión del contador sobre el monto real pagado.
 */
async function activarPlan(
  tenantId: string,
  planSlug: string,
  boldReference: string,
  modalidad: Modalidad,
  cuotaNumero: number,
  montoPagado: number,
): Promise<void> {
  const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
  if (!plan) {
    console.error(`[Bold] Plan "${planSlug}" no encontrado para activar en tenant ${tenantId}`);
    return;
  }

  if (plan.product === "pos") {
    const [t] = await db.select({ addons: tenants.addons }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const planFeatures = plan.features as Record<string, boolean>;
    const addons: Record<string, boolean> = {
      ...((t?.addons ?? {}) as Record<string, boolean>),
      pos: true,
      ...(planFeatures.pos_multi_caja ? { pos_multi_caja: true } : {}),
    };
    await db.update(tenants).set({ addons }).where(eq(tenants.id, tenantId));
    console.log(`[Bold] POS addon activado (${planSlug}) para tenant ${tenantId}`);
    return;
  }

  await reactivarPorPago(tenantId, planSlug, boldReference, modalidad, cuotaNumero);
  console.log(`[Bold] Plan ${planSlug} reactivado — modalidad=${modalidad} cuota=${cuotaNumero} para tenant ${tenantId}`);

  // Comisión sobre el monto real pagado (no precio_anual_cop)
  void generarComisionContador(tenantId, montoPagado, "renovacion").catch((e) =>
    console.error("[Bold] Error generando comisión contador:", e),
  );
}

async function generarComisionContador(
  tenantId: string,
  montoBase: number,
  tipo: "venta_inicial" | "renovacion",
): Promise<void> {
  if (!montoBase) return;
  const [acceso] = await db
    .select({ user_id: user_accesos.user_id })
    .from(user_accesos)
    .where(and(eq(user_accesos.tenant_id, tenantId), eq(user_accesos.role, "contador")))
    .limit(1);
  if (!acceso) return;
  const PORCENTAJE = 15;
  const valor_cop = Math.round((montoBase * PORCENTAJE) / 100);
  await db.insert(comisiones_contador).values({
    contador_user_id: acceso.user_id,
    tenant_id: tenantId,
    tipo,
    porcentaje: String(PORCENTAJE),
    base_cop: montoBase,
    valor_cop,
    pagada: false,
  });
  console.log(`[Bold] Comisión ${tipo} generada: $${valor_cop} COP para contador ${acceso.user_id}`);
}

// ── POST /api/pagos/bold/intent (clientes existentes, autenticados) ───────────
router.post("/intent", authenticate, async (req, res) => {
  try {
    const { plan_id, modalidad: modalidadRaw, descripcion } = req.body as {
      plan_id?: string;
      modalidad?: string;
      descripcion?: string;
    };

    if (!plan_id) {
      return res.status(400).json({ error: "plan_id es requerido." });
    }

    const modalidad: Modalidad = (["anual", "mensual", "3cuotas"].includes(modalidadRaw ?? ""))
      ? (modalidadRaw as Modalidad)
      : "anual";

    const [plan] = await db
      .select({
        id: plans.id,
        nombre: plans.nombre,
        precio_anual_cop: plans.precio_anual_cop,
        precio_mensual_cop: plans.precio_mensual_cop,
        precio_3cuotas_total_cop: plans.precio_3cuotas_total_cop,
      })
      .from(plans)
      .where(eq(plans.slug, plan_id))
      .limit(1);

    if (!plan) return res.status(404).json({ error: "Plan no encontrado." });

    const tenantId = req.tenantId;
    const cuotaNumero = modalidad === "3cuotas" ? await siguienteCuota3(tenantId, plan_id) : 1;
    const monto = calcularMontoCuota(
      plan.precio_anual_cop,
      plan.precio_3cuotas_total_cop ?? Math.round(plan.precio_anual_cop * 1.1),
      modalidad,
      cuotaNumero,
    );

    const reference_id = `DORAVIA-${tenantId.slice(0, 8)}-${Date.now()}`;
    const desc = descripcion ?? `Plan ${plan.nombre} Doravia — ${modalidad === "3cuotas" ? `cuota ${cuotaNumero}/3` : modalidad}`;
    const totalCuotas = modalidad === "3cuotas" ? 3 : 1;

    await db.insert(bold_payments).values({
      tenant_id: tenantId,
      reference_id,
      plan_id,
      monto: String(monto),
      moneda: "COP",
      estado: "PENDING",
      modalidad,
      cuota_numero: cuotaNumero,
      total_cuotas: totalCuotas,
      descripcion: desc,
      callback_url: `${APP_URL}/pago/resultado?ref=${reference_id}`,
    });

    const firma = generarFirma(reference_id, monto);

    return res.json({ reference_id, firma, api_key: BOLD_IDENTITY_KEY, monto, modalidad, cuota_numero: cuotaNumero });
  } catch (err) {
    console.error("[Bold] Error en POST /intent:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /api/pagos/bold/status/:reference_id (clientes autenticados) ──────────
router.get("/status/:reference_id", async (req, res) => {
  try {
    const { reference_id } = req.params;

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

    const result = await bold.estadoPago(reference_id);
    if (!result.ok) {
      return res.json({ reference_id, estado: registro.estado, transaction_id: registro.transaction_id });
    }

    const boldData = result.data ?? {};
    const boldRaw =
      (boldData.payment_status as string | undefined) ??
      (boldData.status as string | undefined) ??
      registro.estado;
    const boldStatus = boldRaw === "NO_TRANSACTION_FOUND" ? registro.estado : boldRaw;

    if (boldStatus === "APPROVED" && registro.estado !== "APPROVED") {
      await db.update(bold_payments)
        .set({ estado: "APPROVED", bold_response: boldData, updated_at: new Date() })
        .where(eq(bold_payments.reference_id, reference_id));
      if (registro.plan_id) {
        const modalidad = (registro.modalidad ?? "anual") as Modalidad;
        const cuotaNumero = registro.cuota_numero ?? 1;
        const montoPagado = Number(registro.monto);
        await activarPlan(tenantId, registro.plan_id, reference_id, modalidad, cuotaNumero, montoPagado);
      }
    } else if (boldStatus !== registro.estado && boldStatus !== "NO_TRANSACTION_FOUND") {
      await db.update(bold_payments)
        .set({ estado: boldStatus, bold_response: boldData, updated_at: new Date() })
        .where(eq(bold_payments.reference_id, reference_id));
    }

    return res.json({
      reference_id,
      estado: boldStatus,
      plan_id: registro.plan_id,
      modalidad: registro.modalidad,
      cuota_numero: registro.cuota_numero,
      transaction_id: registro.transaction_id ?? (boldData.transaction_id as string | undefined),
    });
  } catch (err) {
    console.error("[Bold] Error en GET /status/:reference_id:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST /api/pagos/bold/public/intent (clientes nuevos, sin cuenta) ──────────
router.post("/public/intent", async (req, res) => {
  try {
    const { plan_id, modalidad: modalidadRaw, descripcion } = req.body as {
      plan_id?: string;
      modalidad?: string;
      descripcion?: string;
    };

    if (!plan_id) {
      return res.status(400).json({ error: "plan_id es requerido." });
    }

    const modalidad: Modalidad = (["anual", "mensual", "3cuotas"].includes(modalidadRaw ?? ""))
      ? (modalidadRaw as Modalidad)
      : "anual";

    const [plan] = await db
      .select({
        nombre: plans.nombre,
        precio_anual_cop: plans.precio_anual_cop,
        precio_mensual_cop: plans.precio_mensual_cop,
        precio_3cuotas_total_cop: plans.precio_3cuotas_total_cop,
      })
      .from(plans)
      .where(eq(plans.slug, plan_id))
      .limit(1);

    if (!plan) return res.status(404).json({ error: "Plan no encontrado." });

    // Clientes nuevos siempre arrancan en cuota 1
    const cuotaNumero = 1;
    const totalCuotas = modalidad === "3cuotas" ? 3 : 1;
    const monto = calcularMontoCuota(
      plan.precio_anual_cop,
      plan.precio_3cuotas_total_cop ?? Math.round(plan.precio_anual_cop * 1.1),
      modalidad,
      cuotaNumero,
    );

    const reference_id = `DORAVIA-NEW-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const desc = descripcion ?? `Plan ${plan.nombre} Doravia — ${modalidad === "3cuotas" ? "cuota 1/3" : modalidad}`;

    // tenant_id queda NULL hasta que el cliente crea su cuenta
    await db.insert(bold_payments).values({
      reference_id,
      plan_id,
      monto: String(monto),
      moneda: "COP",
      estado: "PENDING",
      modalidad,
      cuota_numero: cuotaNumero,
      total_cuotas: totalCuotas,
      descripcion: desc,
      callback_url: `${APP_URL}/registro-post-pago?ref=${reference_id}&plan=${plan_id}&modalidad=${modalidad}&monto=${monto}`,
    });

    const firma = generarFirma(reference_id, monto);

    return res.json({ reference_id, firma, api_key: BOLD_IDENTITY_KEY, monto, modalidad, cuota_numero: cuotaNumero });
  } catch (err) {
    console.error("[Bold] Error en POST /public/intent:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /api/pagos/bold/public/status/:reference_id (sin autenticación) ───────
router.get("/public/status/:reference_id", async (req, res) => {
  try {
    const { reference_id } = req.params;
    const [registro] = await db
      .select()
      .from(bold_payments)
      .where(eq(bold_payments.reference_id, reference_id))
      .limit(1);

    if (!registro) return res.status(404).json({ error: "Referencia no encontrada." });

    const result = await bold.estadoPago(reference_id);
    if (!result.ok) {
      return res.json({ reference_id, estado: registro.estado });
    }

    const boldData = result.data ?? {};
    const boldRaw =
      (boldData.payment_status as string | undefined) ??
      (boldData.status as string | undefined) ??
      registro.estado;
    const boldStatus = boldRaw === "NO_TRANSACTION_FOUND" ? registro.estado : boldRaw;

    if (boldStatus !== registro.estado) {
      await db.update(bold_payments)
        .set({ estado: boldStatus, updated_at: new Date() })
        .where(eq(bold_payments.reference_id, reference_id));
    }

    return res.json({ reference_id, estado: boldStatus, plan_id: registro.plan_id, modalidad: registro.modalidad });
  } catch (err) {
    console.error("[Bold] Error en GET /public/status:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST /api/pagos/bold/webhook (viene de Bold, sin autenticación) ───────────
router.post("/webhook", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const data = (body.data as Record<string, unknown> | undefined) ?? body;

    const reference_id = (data.reference_id ?? body.reference_id) as string | undefined;
    const status = ((data.payment_status ?? data.status ?? body.payment_status) as string | undefined);
    const transaction_id = (data.transaction_id ?? body.transaction_id) as string | undefined;

    console.log(`[Bold Webhook] reference_id=${reference_id} status=${status}`);

    if (!reference_id || !status) return res.sendStatus(200);

    const [registro] = await db
      .select()
      .from(bold_payments)
      .where(eq(bold_payments.reference_id, reference_id))
      .limit(1);

    if (!registro) return res.sendStatus(200);

    await db.update(bold_payments).set({
      estado: status,
      transaction_id: transaction_id ?? registro.transaction_id,
      bold_response: body,
      updated_at: new Date(),
    }).where(eq(bold_payments.reference_id, reference_id));

    if (status === "APPROVED" && registro.estado !== "APPROVED" && registro.plan_id && registro.tenant_id) {
      const modalidad = (registro.modalidad ?? "anual") as Modalidad;
      const cuotaNumero = registro.cuota_numero ?? 1;
      const montoPagado = Number(registro.monto);
      await activarPlan(registro.tenant_id, registro.plan_id, reference_id ?? "webhook", modalidad, cuotaNumero, montoPagado);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("[Bold] Error en POST /webhook:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

export { router as boldRouter };
export default router;
