import cron from "node-cron";
import { db, tenants } from "@workspace/db";
import { and, isNotNull, isNull, lt, gte, lte, eq } from "drizzle-orm";
import { enqueueNotification } from "../services/notification.service.js";
import { suspenderPorTrialVencido } from "../services/subscription.service.js";

// Días del trial en que se envían recordatorios (día 10 y día 13 del trial de 15 días)
// D10 → 5 días restantes; D13 → 2 días restantes
const DIAS_RECORDATORIO: { diaDelTrial: number; template: "trial_d10" | "trial_d13" }[] = [
  { diaDelTrial: 10, template: "trial_d10" },
  { diaDelTrial: 13, template: "trial_d13" },
];

async function procesarTrials(ahora: Date = new Date()): Promise<void> {
  // ── Recordatorios D10 y D13 del trial ────────────────────────────────────────
  for (const { diaDelTrial, template } of DIAS_RECORDATORIO) {
    // trial_ends_at = plan_starts_at + 15 días.
    // El aviso sale cuando quedan (15 - diaDelTrial) días, es decir cuando
    // trial_ends_at cae entre (15 - diaDelTrial - 1) y (15 - diaDelTrial) días desde ahora.
    const diasRestantes = 15 - diaDelTrial;
    const desde = new Date(ahora);
    desde.setDate(desde.getDate() + diasRestantes);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ahora);
    hasta.setDate(hasta.getDate() + diasRestantes);
    hasta.setHours(23, 59, 59, 999);

    const porRecordar = await db
      .select({ id: tenants.id, nombre: tenants.nombre })
      .from(tenants)
      .where(
        and(
          isNotNull(tenants.trial_ends_at),
          isNull(tenants.ultimo_pago_confirmado_at),
          eq(tenants.subscription_status, "trial"),
          gte(tenants.trial_ends_at, desde),
          lte(tenants.trial_ends_at, hasta),
        ),
      );

    for (const t of porRecordar) {
      const ref = `${template}-${t.id}-${ahora.toISOString().slice(0, 10)}`;
      await enqueueNotification({ tenant_id: t.id, template, ref_id: ref }).catch((e) =>
        console.error(`[trial-expiry] Error enqueue ${template} para ${t.nombre}:`, e),
      );
      console.log(`[trial-expiry] ${template} encolado para ${t.nombre} (${t.id})`);
    }
  }

  // ── Suspender trials vencidos ────────────────────────────────────────────────
  const vencidos = await db
    .select({ id: tenants.id, nombre: tenants.nombre })
    .from(tenants)
    .where(
      and(
        isNotNull(tenants.trial_ends_at),
        isNull(tenants.ultimo_pago_confirmado_at),
        eq(tenants.subscription_status, "trial"),
        lt(tenants.trial_ends_at, ahora),
      ),
    );

  for (const t of vencidos) {
    try {
      await suspenderPorTrialVencido(t.id);
      console.log(`[trial-expiry] Trial suspendido: ${t.nombre} (${t.id})`);
    } catch (e) {
      console.error(`[trial-expiry] Error suspendiendo trial ${t.nombre}:`, e);
    }
  }
}

export function iniciarCronTrialExpiry() {
  // Diariamente 09:00 America/Bogota (UTC-5 = 14:00 UTC)
  cron.schedule("0 14 * * *", () => {
    void procesarTrials();
  }, { timezone: "UTC" });
  console.log("[trial-expiry] Cron programado — diariamente 09:00 Bogota");
}

// Exportar procesarTrials para tests con clock mockeado
export { procesarTrials as _procesarTrials };
