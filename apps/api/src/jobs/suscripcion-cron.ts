/**
 * FASE 2 — Cron de ciclo de vida de suscripciones pagas.
 *
 * Responsabilidades:
 *   1. Detectar planes vencidos (active → grace)
 *   2. Detectar período de gracia vencido (grace → suspended)
 *   3. Enviar recordatorios de renovación próxima (D-30, D-15, D-5, día)
 *   4. Enviar aviso de mora cuando el plan vence sin pago
 */

import cron from "node-cron";
import { db, tenants } from "@workspace/db";
import { and, eq, gt, lt, gte, lte, isNotNull, ne } from "drizzle-orm";
import { enqueueNotification } from "../services/notification.service.js";
import {
  iniciarGracia,
  suspenderPorGraciaVencida,
  GRACE_DAYS,
} from "../services/subscription.service.js";

// Recordatorios de renovación: días antes del vencimiento
const AVISOS_RENOVACION: { diasAntes: number; template: "renovacion_aviso_mes" | "renovacion_d15" | "renovacion_d5" | "renovacion_dia" }[] = [
  { diasAntes: 30, template: "renovacion_aviso_mes" },
  { diasAntes: 15, template: "renovacion_d15" },
  { diasAntes: 5,  template: "renovacion_d5" },
  { diasAntes: 0,  template: "renovacion_dia" },
];

export async function procesarCicloSuscripciones(ahora: Date = new Date()): Promise<void> {
  const hub_nit = "0000000001";

  // ── 1. Recordatorios de renovación para tenants activos ──────────────────────
  for (const { diasAntes, template } of AVISOS_RENOVACION) {
    const desde = new Date(ahora);
    desde.setDate(desde.getDate() + diasAntes);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ahora);
    hasta.setDate(hasta.getDate() + diasAntes);
    hasta.setHours(23, 59, 59, 999);

    const proximosAVencer = await db
      .select({ id: tenants.id, nombre: tenants.nombre })
      .from(tenants)
      .where(
        and(
          eq(tenants.subscription_status, "active"),
          isNotNull(tenants.ultimo_pago_confirmado_at),
          gte(tenants.plan_ends_at, desde),
          lte(tenants.plan_ends_at, hasta),
          ne(tenants.nit, hub_nit),
        ),
      );

    for (const t of proximosAVencer) {
      const ref = `${template}-${t.id}-${ahora.toISOString().slice(0, 10)}`;
      await enqueueNotification({ tenant_id: t.id, template, ref_id: ref }).catch((e) =>
        console.error(`[suscripcion-cron] Error enqueue ${template} para ${t.nombre}:`, e),
      );
      console.log(`[suscripcion-cron] ${template} encolado para ${t.nombre}`);
    }
  }

  // ── 2. active → grace: plan vencido sin pago ──────────────────────────────────
  const planVencido = await db
    .select({ id: tenants.id, nombre: tenants.nombre })
    .from(tenants)
    .where(
      and(
        eq(tenants.subscription_status, "active"),
        lt(tenants.plan_ends_at, ahora),
        isNotNull(tenants.ultimo_pago_confirmado_at),
        ne(tenants.nit, hub_nit),
      ),
    );

  for (const t of planVencido) {
    try {
      await iniciarGracia(t.id);
      console.log(`[suscripcion-cron] grace iniciado: ${t.nombre} (${t.id})`);
    } catch (e) {
      console.error(`[suscripcion-cron] Error iniciando grace ${t.nombre}:`, e);
    }
  }

  // ── 3. grace → suspended: período de gracia vencido ──────────────────────────
  // grace_ends_at = plan_ends_at + GRACE_DAYS
  const graceVencida = await db
    .select({ id: tenants.id, nombre: tenants.nombre, plan_ends_at: tenants.plan_ends_at })
    .from(tenants)
    .where(
      and(
        eq(tenants.subscription_status, "grace"),
        ne(tenants.nit, hub_nit),
      ),
    );

  for (const t of graceVencida) {
    const graceEndsAt = new Date(t.plan_ends_at);
    graceEndsAt.setDate(graceEndsAt.getDate() + GRACE_DAYS);
    if (ahora >= graceEndsAt) {
      try {
        await suspenderPorGraciaVencida(t.id);
        console.log(`[suscripcion-cron] suspended por grace vencido: ${t.nombre} (${t.id})`);
      } catch (e) {
        console.error(`[suscripcion-cron] Error suspendiendo por grace ${t.nombre}:`, e);
      }
    }
  }
}

export function iniciarCronSuscripciones() {
  // Diariamente 09:30 America/Bogota (UTC-5 = 14:30 UTC)
  // 30 minutos después del cron de trial para evitar colisiones en la misma fila
  cron.schedule("30 14 * * *", () => {
    void procesarCicloSuscripciones();
  }, { timezone: "UTC" });
  console.log("[suscripcion-cron] Cron programado — diariamente 09:30 Bogota");
}
