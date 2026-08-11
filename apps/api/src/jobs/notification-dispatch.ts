import cron from "node-cron";
import { and, eq, lte } from "drizzle-orm";
import { db, notification_queue, users } from "@workspace/db";
import { enviarNotificacionSistema } from "../services/email.service.js";
import { NOTIFICATION_TEMPLATES } from "../services/notification-templates.js";

const MAX_REINTENTOS = 3;

export async function procesarNotificacionesEmail(ahora = new Date()) {
  // Evita despachos accidentales de filas históricas al habilitar el código.
  if (process.env.NOTIFICATION_EMAIL_DISPATCH_ENABLED !== "true" || !process.env.RESEND_API_KEY) return;

  const pendientes = await db
    .select()
    .from(notification_queue)
    .where(and(
      eq(notification_queue.channel, "email"),
      eq(notification_queue.status, "pending"),
      lte(notification_queue.scheduled_at, ahora),
    ))
    .limit(25);

  for (const item of pendientes) {
    const tomado = await db.update(notification_queue)
      .set({ status: "processing" })
      .where(and(eq(notification_queue.id, item.id), eq(notification_queue.status, "pending")))
      .returning({ id: notification_queue.id });
    if (tomado.length === 0) continue;

    try {
      const template = NOTIFICATION_TEMPLATES[item.template];
      if (!template) throw new Error("Template de notificación no reconocido.");
      const [admin] = await db.select({ email: users.email })
        .from(users)
        .where(and(eq(users.tenant_id, item.tenant_id), eq(users.role, "admin")))
        .limit(1);
      if (!admin?.email) throw new Error("No hay administrador con correo para el tenant.");

      await enviarNotificacionSistema({
        destinatario: admin.email,
        titulo: template.title,
        mensaje: template.body((item.payload ?? {}) as Record<string, string>),
        enlace: template.link,
      });
      await db.update(notification_queue).set({ status: "sent", sent_at: ahora, error: null })
        .where(eq(notification_queue.id, item.id));
    } catch (err) {
      const reintentos = item.retry_count + 1;
      const error = err instanceof Error ? err.message.slice(0, 500) : "Error desconocido al despachar correo.";
      await db.update(notification_queue).set({
        status: reintentos >= MAX_REINTENTOS ? "failed" : "pending",
        retry_count: reintentos,
        error,
        scheduled_at: new Date(ahora.getTime() + 15 * 60 * 1000 * reintentos),
      }).where(eq(notification_queue.id, item.id));
    }
  }
}

export function iniciarCronNotificaciones() {
  cron.schedule("*/5 * * * *", () => { void procesarNotificacionesEmail(); });
  console.log("[notifications] Despacho de email cada 5 min (requiere NOTIFICATION_EMAIL_DISPATCH_ENABLED=true).");
}
