import cron from "node-cron";
import { db, tenants, users } from "@workspace/db";
import { and, eq, isNull, isNotNull, lt, gte, lte } from "drizzle-orm";
import {
  enviarAvisoTrialPorVencer,
  enviarTrialSuspendido,
} from "../services/email.service.js";

const DIAS_AVISO = [3, 1];

async function procesarTrials() {
  const ahora = new Date();

  // ── Avisos previos al vencimiento ────────────────────────────────────────
  for (const dias of DIAS_AVISO) {
    const desde = new Date(ahora);
    desde.setDate(desde.getDate() + dias - 1);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ahora);
    hasta.setDate(hasta.getDate() + dias);
    hasta.setHours(23, 59, 59, 999);

    const porVencer = await db
      .select({
        id: tenants.id,
        nombre: tenants.nombre,
        correo: tenants.correo,
        trial_ends_at: tenants.trial_ends_at,
      })
      .from(tenants)
      .where(
        and(
          isNotNull(tenants.trial_ends_at),
          isNull(tenants.ultimo_pago_confirmado_at),
          eq(tenants.activo, true),
          gte(tenants.trial_ends_at, desde),
          lte(tenants.trial_ends_at, hasta),
        )
      );

    for (const tenant of porVencer) {
      // Buscar admin del tenant para el email
      const [admin] = await db
        .select({ email: users.email, nombre: users.nombre })
        .from(users)
        .where(and(eq(users.tenant_id, tenant.id), eq(users.role, "admin")))
        .limit(1);

      if (!admin) continue;

      try {
        await enviarAvisoTrialPorVencer({
          destinatario: admin.email,
          nombre: admin.nombre,
          empresa: tenant.nombre,
          diasRestantes: dias,
        });
        console.log(`[trial-expiry] Aviso ${dias}d enviado a ${admin.email} (${tenant.nombre})`);
      } catch (err) {
        console.error(`[trial-expiry] Error enviando aviso a ${admin.email}:`, err);
      }
    }
  }

  // ── Suspender trials vencidos ────────────────────────────────────────────
  const vencidos = await db
    .select({
      id: tenants.id,
      nombre: tenants.nombre,
    })
    .from(tenants)
    .where(
      and(
        isNotNull(tenants.trial_ends_at),
        isNull(tenants.ultimo_pago_confirmado_at),
        eq(tenants.activo, true),
        lt(tenants.trial_ends_at, ahora),
      )
    );

  for (const tenant of vencidos) {
    const [admin] = await db
      .select({ email: users.email, nombre: users.nombre })
      .from(users)
      .where(and(eq(users.tenant_id, tenant.id), eq(users.role, "admin")))
      .limit(1);

    await db.update(tenants).set({ activo: false }).where(eq(tenants.id, tenant.id));
    console.log(`[trial-expiry] Trial suspendido: ${tenant.nombre} (${tenant.id})`);

    if (admin) {
      try {
        await enviarTrialSuspendido({
          destinatario: admin.email,
          nombre: admin.nombre,
          empresa: tenant.nombre,
        });
      } catch (err) {
        console.error(`[trial-expiry] Error enviando email suspensión a ${admin.email}:`, err);
      }
    }
  }
}

export function iniciarCronTrialExpiry() {
  cron.schedule("0 9 * * *", () => {
    void procesarTrials();
  });
  console.log("[trial-expiry] Cron job programado — diariamente 09:00");
}
