import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import * as Sentry from "@sentry/node";

// Configurable via env para poder pasarlo a cron Railway sin tocar lógica.
// En Railway: NOTIFICATION_DRAIN_INTERVAL_MS=0 y cron externo invoca el endpoint;
// en dev/staging: setInterval cada 30s.
const BATCH_SIZE = 10;
const MAX_RETRIES = 5;
const DRAIN_INTERVAL_MS = Number(process.env.NOTIFICATION_DRAIN_INTERVAL_MS ?? 30_000);

interface QueueRow {
  id: string;
  tenant_id: string;
  template: string;
  ref_id: string;
  channel: string;
  payload: Record<string, unknown> | null;
  retry_count: number;
}

async function drainBatch(): Promise<void> {
  await db.transaction(async (tx) => {
    // SELECT ... FOR UPDATE SKIP LOCKED garantiza que dos instancias nunca
    // procesen la misma fila, aunque escalen en paralelo.
    const rows = Array.from(
      await tx.execute(sql`
        SELECT id, tenant_id, template, ref_id, channel, payload, retry_count
        FROM notification_queue
        WHERE status = 'pending' AND scheduled_at <= NOW()
        ORDER BY scheduled_at
        LIMIT ${sql.raw(String(BATCH_SIZE))}
        FOR UPDATE SKIP LOCKED
      `),
    ) as unknown as QueueRow[];

    for (const row of rows) {
      try {
        // ── STUB ────────────────────────────────────────────────────────────
        // Proveedor real NO integrado. Cuando se integre (Twilio / Resend):
        //   1. Reemplazar el console.log por la llamada al proveedor.
        //   2. Cambiar 'sent_stub' → 'sent' solo si el proveedor confirma envío.
        //   3. Añadir manejo de error con backoff (bloque catch abajo).
        console.log(
          `[notif-drain] STUB channel=${row.channel} template=${row.template}` +
            ` tenant=${row.tenant_id} ref=${row.ref_id}`,
          JSON.stringify(row.payload),
        );

        const mergedPayload: Record<string, unknown> = {
          ...(row.payload ?? {}),
          channel_stubbed: true,
        };

        await tx.execute(sql`
          UPDATE notification_queue
          SET status  = 'sent_stub',
              sent_at = NOW(),
              payload = ${JSON.stringify(mergedPayload)}::jsonb
          WHERE id = ${row.id}
        `);
      } catch (err) {
        // Error durante el envío real (proveedor externo). En stub esto no
        // debería ocurrir — si llega aquí es un bug de DB o de integración.
        const errMsg = err instanceof Error ? err.message : String(err);
        const nextRetry = (row.retry_count ?? 0) + 1;

        Sentry.captureException(err, {
          tags: { job: "notification-drain", channel: row.channel, template: row.template },
          extra: { row_id: row.id, tenant_id: row.tenant_id, retry: nextRetry },
        });

        if (nextRetry > MAX_RETRIES) {
          await tx.execute(sql`
            UPDATE notification_queue
            SET status      = 'failed',
                error       = ${errMsg},
                retry_count = ${nextRetry}
            WHERE id = ${row.id}
          `);
        } else {
          // Backoff exponencial: 5 min, 10 min, 15 min … hasta 2 h
          const backoffMs = Math.min(nextRetry * 5 * 60_000, 2 * 60 * 60_000);
          await tx.execute(sql`
            UPDATE notification_queue
            SET status       = 'pending',
                error        = ${errMsg},
                retry_count  = ${nextRetry},
                scheduled_at = NOW() + (${String(backoffMs)} || ' milliseconds')::interval
            WHERE id = ${row.id}
          `);
        }
      }
    }

    if (rows.length > 0) {
      console.log(`[notif-drain] Lote: ${rows.length} filas procesadas`);
    }
  });
}

export function iniciarDrainNotificaciones(): NodeJS.Timeout | null {
  if (DRAIN_INTERVAL_MS <= 0) {
    console.log("[notif-drain] Intervalo = 0 — worker desactivado (modo cron externo)");
    return null;
  }

  console.log(`[notif-drain] Worker iniciado — intervalo ${DRAIN_INTERVAL_MS}ms, lote ${BATCH_SIZE}`);

  void drainBatch().catch((err) => {
    console.error("[notif-drain] Error en primera ejecución:", err);
    Sentry.captureException(err, { tags: { job: "notification-drain", phase: "startup" } });
  });

  return setInterval(() => {
    void drainBatch().catch((err) => {
      console.error("[notif-drain] Error en ciclo:", err);
      Sentry.captureException(err, { tags: { job: "notification-drain" } });
    });
  }, DRAIN_INTERVAL_MS);
}
