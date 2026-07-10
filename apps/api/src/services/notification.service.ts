import * as Sentry from "@sentry/node";
import { db, notification_queue, notifications } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { NOTIFICATION_TEMPLATES, type TemplateKey } from "./notification-templates.js";

// Zona horaria Bogotá para ventana activa
const BOGOTA_TZ = "America/Bogota";
const WINDOW_START_H = 8;   // 08:00 Bogotá
const WINDOW_END_H   = 17;  // 17:00 Bogotá

/**
 * Devuelve la fecha+hora en Bogotá para un Date UTC.
 * Usa la API Intl nativa disponible en Node 12+.
 */
function toBogota(utcDate: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(utcDate)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, parseInt(p.value, 10)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/**
 * Dada una fecha UTC de evento, calcula cuándo debe enviarse según la ventana Bogotá.
 * - in_app: siempre ahora (nunca diferido)
 * - whatsapp/email:
 *   - Si estamos dentro de la ventana [08:00, 17:00) → now
 *   - Si antes de las 08:00 → hoy 08:00 Bogotá
 *   - Si >= 17:00 → mañana 08:00 Bogotá
 */
export function calcularScheduledAt(now: Date, channel: "whatsapp" | "email" | "in_app"): Date {
  if (channel === "in_app") return now;

  const bogota = toBogota(now);

  if (bogota.hour >= WINDOW_START_H && bogota.hour < WINDOW_END_H) {
    return now; // dentro de la ventana → inmediato
  }

  // Construir fecha objetivo en Bogotá
  let targetYear = bogota.year;
  let targetMonth = bogota.month;
  let targetDay = bogota.day;

  if (bogota.hour >= WINDOW_END_H) {
    // después de las 17:00 → mañana
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tB = toBogota(tomorrow);
    targetYear  = tB.year;
    targetMonth = tB.month;
    targetDay   = tB.day;
  }
  // Si hora < 08:00 → mismo día, hora = 08:00

  // Construir ISO de "targetDay 08:00:00 Bogotá" → UTC
  // Método: Intl.DateTimeFormat nos da el offset real (incluye DST, aunque Colombia no lo usa)
  const bogotaStr = `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}T${String(WINDOW_START_H).padStart(2, "0")}:00:00`;
  // Colombia es UTC-5 fija (no tiene DST)
  const utcMs = new Date(bogotaStr + "-05:00").getTime();
  return new Date(utcMs);
}

/**
 * Fecha local Bogotá en formato YYYY-MM-DD para una fecha UTC.
 */
export function fechaLocalBogota(utcDate: Date): string {
  const b = toBogota(utcDate);
  return `${String(b.year).padStart(4, "0")}-${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}`;
}

/**
 * Encola una notificación para un tenant.
 * Si el template no existe, lanza error para evitar typos silenciosos.
 * Si la deduplicación ya existe, la fila no se inserta (ON CONFLICT DO NOTHING).
 */
export async function enqueueNotification(opts: {
  tenant_id: string;
  template: TemplateKey;
  ref_id: string;
  payload?: Record<string, string>;
  now?: Date;
}): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[opts.template];
  if (!template) {
    throw new Error(`Template desconocido: "${opts.template}"`);
  }

  const now = opts.now ?? new Date();
  const fecha_local = fechaLocalBogota(now);

  for (const channel of template.channels) {
    const scheduled_at = calcularScheduledAt(now, channel);
    try {
      await db
        .insert(notification_queue)
        .values({
          tenant_id: opts.tenant_id,
          template: opts.template,
          ref_id: opts.ref_id,
          fecha_local,
          channel,
          scheduled_at,
          payload: opts.payload ?? {},
        })
        .onConflictDoNothing();

      // in_app: también registrar en tabla de notificaciones del tenant
      if (channel === "in_app") {
        const body = template.body(opts.payload ?? {});
        await db.insert(notifications).values({
          tenant_id: opts.tenant_id,
          type: opts.template,
          title: template.title,
          body,
          link: template.link,
        });
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { template: opts.template, channel, tenant_id: opts.tenant_id } });
      throw err;
    }
  }
}

/**
 * Encola una alerta R7 (vigencia tributaria) SOLO para fundadores.
 * Crea una notificación in-app dirigida al user_id del fundador
 * + encola email/WhatsApp en notification_queue.
 */
export async function enqueueR7Alert(opts: {
  fundador_user_id: string;
  fundador_tenant_id: string;
  template: TemplateKey;
  ref_id: string;
  payload?: Record<string, string>;
  now?: Date;
}): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[opts.template];
  if (!template) throw new Error(`Template R7 desconocido: "${opts.template}"`);

  const now = opts.now ?? new Date();
  const fecha_local = fechaLocalBogota(now);

  for (const channel of template.channels) {
    const scheduled_at = calcularScheduledAt(now, channel);
    try {
      await db
        .insert(notification_queue)
        .values({
          tenant_id: opts.fundador_tenant_id,
          template: opts.template,
          ref_id: opts.ref_id,
          fecha_local,
          channel,
          scheduled_at,
          payload: opts.payload ?? {},
        })
        .onConflictDoNothing();

      if (channel === "in_app") {
        const body = template.body(opts.payload ?? {});
        await db.insert(notifications).values({
          tenant_id: opts.fundador_tenant_id,
          user_id: opts.fundador_user_id,
          type: opts.template,
          title: template.title,
          body,
          link: template.link,
        });
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { template: opts.template, channel, user_id: opts.fundador_user_id },
      });
      throw err;
    }
  }
}

/** Devuelve notificaciones in-app sin leer para un tenant (más recientes primero). */
export async function getInAppNotifications(
  tenantId: string,
  userId?: string,
  limit = 30,
): Promise<typeof notifications.$inferSelect[]> {
  const filters = userId
    ? and(eq(notifications.tenant_id, tenantId), eq(notifications.user_id, userId))
    : eq(notifications.tenant_id, tenantId);

  return db
    .select()
    .from(notifications)
    .where(filters)
    .orderBy(desc(notifications.created_at))
    .limit(limit);
}

/** Marca una notificación como leída. Devuelve false si no pertenece al tenant. */
export async function markNotificationRead(id: string, tenantId: string): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ is_read: true })
    .where(and(eq(notifications.id, id), eq(notifications.tenant_id, tenantId)))
    .returning({ id: notifications.id });
  return result.length > 0;
}
