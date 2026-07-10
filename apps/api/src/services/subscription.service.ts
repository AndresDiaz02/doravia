import { db, tenants, plans, tenant_state_transitions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { enqueueNotification } from "./notification.service.js";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = "trial" | "active" | "grace" | "suspended" | "archived";
export type Modalidad = "anual" | "mensual" | "3cuotas";

export const GRACE_DAYS = Number(process.env.GRACE_DAYS ?? 7);
export const TRIAL_DAYS = 15;

// ── Funciones puras de modalidades (sin DB) ───────────────────────────────────

/**
 * Días que cubre cada pago según la modalidad.
 * 3 cuotas: 122 + 122 + 121 = 365 días totales.
 */
export function calcularDuracion(modalidad: Modalidad, cuotaNumero: number = 1): number {
  if (modalidad === "mensual") return 30;
  if (modalidad === "3cuotas") return cuotaNumero <= 2 ? 122 : 121;
  return 365; // anual
}

/**
 * Monto (COP) a cobrar para la cuota indicada según la modalidad.
 *
 * Fórmulas (spec §precios):
 *   mensual     = round(anual / 10)
 *   3cuotas     = total × 1.10; cuota 1 y 2 = ceil(total/3, 100 superior); cuota 3 = residuo
 *   anual       = precio_anual_cop
 *
 * `precio3CuotasTotal` ya viene de la DB (anual × 1.10, redondeado).
 */
export function calcularMontoCuota(
  precioAnual: number,
  precio3CuotasTotal: number,
  modalidad: Modalidad,
  cuotaNumero: number = 1,
): number {
  if (modalidad === "mensual") return Math.round(precioAnual / 10);
  if (modalidad === "3cuotas") {
    const cuotaBase = Math.ceil(precio3CuotasTotal / 3 / 100) * 100;
    if (cuotaNumero <= 2) return cuotaBase;
    return precio3CuotasTotal - cuotaBase * 2;
  }
  return precioAnual;
}

// ── Funciones puras (sin DB) — testeables con clock mockeado ─────────────────

/**
 * Determina si un tenant en trial debe suspenderse dada la hora actual.
 * Trial NO se reinicia al cambiar de plan: usa plan_starts_at original.
 */
export function calcularEstadoTrial(
  trialEndsAt: Date,
  now: Date,
): "trial" | "suspended" {
  return now < trialEndsAt ? "trial" : "suspended";
}

/**
 * Determina el estado de un tenant con plan pago según la hora actual.
 */
export function calcularEstadoRenovacion(
  planEndsAt: Date,
  graceDays: number,
  now: Date,
): "active" | "grace" | "suspended" {
  if (now < planEndsAt) return "active";
  const graceEndsAt = new Date(planEndsAt);
  graceEndsAt.setDate(graceEndsAt.getDate() + graceDays);
  return now < graceEndsAt ? "grace" : "suspended";
}

/**
 * Decide si el middleware debe bloquear la request según estado y rol.
 * Retorna true = bloquear, false = dejar pasar.
 *
 * Reglas:
 *   archived  → bloquear siempre (incluso contador)
 *   suspended → bloquear escritura para admin/vendedor/operario; contador y cajero pasan
 *   grace     → nunca bloquear (solo se emite header warning)
 *   trial/active → nunca bloquear
 */
export function debeBloquearRequest(
  status: SubscriptionStatus,
  role: string,
  method: string,
): boolean {
  if (status === "archived") return true;
  if (status === "suspended") {
    if (role === "contador" || role === "cajero") return false;
    return method !== "GET";
  }
  return false;
}

// ── Transición atómica ────────────────────────────────────────────────────────

/**
 * Cambia el subscription_status de un tenant y registra en el log inmutable.
 * Idempotente: si ya está en `toState`, no hace nada ni escribe log.
 * Mantiene `activo` en sync: suspended/archived → false, demás → true.
 */
export async function transicionarEstado(
  tenantId: string,
  toState: SubscriptionStatus,
  reason: string,
  actorId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ subscription_status: tenants.subscription_status })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
      .for("update");

    if (!row) throw new Error(`Tenant no encontrado: ${tenantId}`);

    const fromState = row.subscription_status as SubscriptionStatus;
    if (fromState === toState) return; // idempotente

    const activo = toState !== "suspended" && toState !== "archived";

    await tx
      .update(tenants)
      .set({ subscription_status: toState, activo })
      .where(eq(tenants.id, tenantId));

    await tx.insert(tenant_state_transitions).values({
      tenant_id: tenantId,
      from_state: fromState,
      to_state: toState,
      reason,
      actor_id: actorId ?? null,
      metadata: metadata ?? null,
    });
  });
}

// ── Acciones de alto nivel ────────────────────────────────────────────────────

/** Trial vencido sin pago → suspended. Encola notificación mora_readonly. */
export async function suspenderPorTrialVencido(tenantId: string): Promise<void> {
  await transicionarEstado(tenantId, "suspended", "trial_expired");
  const hoy = new Date().toISOString().slice(0, 10);
  await enqueueNotification({
    tenant_id: tenantId,
    template: "mora_readonly",
    ref_id: `trial-vencido-${tenantId}-${hoy}`,
  }).catch((e) => console.error("[subscription] Error enqueue mora_readonly:", e));
}

/** Plan pago vencido → inicia período de gracia. Encola notificación mora_aviso. */
export async function iniciarGracia(tenantId: string): Promise<void> {
  await transicionarEstado(tenantId, "grace", "plan_ended_grace_started");
  const hoy = new Date().toISOString().slice(0, 10);
  await enqueueNotification({
    tenant_id: tenantId,
    template: "mora_aviso",
    ref_id: `gracia-inicio-${tenantId}-${hoy}`,
  }).catch((e) => console.error("[subscription] Error enqueue mora_aviso:", e));
}

/** Gracia vencida sin pago → suspended. Encola notificación mora_readonly. */
export async function suspenderPorGraciaVencida(tenantId: string): Promise<void> {
  await transicionarEstado(tenantId, "suspended", "grace_expired");
  const hoy = new Date().toISOString().slice(0, 10);
  await enqueueNotification({
    tenant_id: tenantId,
    template: "mora_readonly",
    ref_id: `gracia-vencida-${tenantId}-${hoy}`,
  }).catch((e) => console.error("[subscription] Error enqueue mora_readonly:", e));
}

/**
 * Reactivación por pago confirmado — idempotente.
 * Si el tenant ya está active con plan vigente, retorna sin hacer nada.
 * Extiende plan_ends_at según la modalidad y cuota pagada.
 * Para 'anual' = +365 días; 'mensual' = +30 días; '3cuotas' = +122/121 días.
 */
export async function reactivarPorPago(
  tenantId: string,
  planSlug: string,
  boldReference: string,
  modalidad: Modalidad = "anual",
  cuotaNumero: number = 1,
): Promise<void> {
  const [plan] = await db
    .select({ id: plans.id, precio_anual_cop: plans.precio_anual_cop })
    .from(plans)
    .where(eq(plans.slug, planSlug))
    .limit(1);

  if (!plan) throw new Error(`Plan no encontrado: ${planSlug}`);

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .select({
        subscription_status: tenants.subscription_status,
        plan_ends_at: tenants.plan_ends_at,
        modalidad_suscripcion: tenants.modalidad_suscripcion,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
      .for("update");

    if (!tenant) throw new Error(`Tenant no encontrado: ${tenantId}`);

    const fromState = tenant.subscription_status as SubscriptionStatus;
    const hoy = new Date();

    // Idempotencia: ya activo con plan vigente y misma modalidad → no hacer nada
    if (fromState === "active" && new Date(tenant.plan_ends_at) > hoy) return;

    // El período arranca donde terminó el anterior (si aún no venció) o desde hoy
    const inicioActual = new Date(tenant.plan_ends_at);
    const inicio = inicioActual > hoy ? inicioActual : hoy;
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + calcularDuracion(modalidad, cuotaNumero));

    await tx.update(tenants).set({
      plan_id: plan.id,
      plan_starts_at: inicio,
      plan_ends_at: fin,
      activo: true,
      ultimo_pago_confirmado_at: hoy,
      trial_ends_at: null,
      subscription_status: "active",
      modalidad_suscripcion: modalidad,
    }).where(eq(tenants.id, tenantId));

    await tx.insert(tenant_state_transitions).values({
      tenant_id: tenantId,
      from_state: fromState,
      to_state: "active",
      reason: "payment_confirmed",
      actor_id: null,
      metadata: { bold_reference: boldReference, plan_slug: planSlug, modalidad, cuota_numero: cuotaNumero },
    });
  });
}

/** Archivado explícito por fundador (irreversible desde UI). */
export async function archivarTenant(
  tenantId: string,
  actorId: string,
  motivo?: string,
): Promise<void> {
  await transicionarEstado(tenantId, "archived", "fundador_archivado", actorId, { motivo });
}
