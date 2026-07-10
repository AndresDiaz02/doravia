import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

/**
 * Cola de notificaciones salientes (WhatsApp, Email, In-App).
 * El motor encola; un worker separado despacha (no implementado en FASE 6).
 * Ventana activa: 08:00-17:00 Bogotá para WhatsApp/Email. In-App: siempre inmediato.
 * Deduplicación por (tenant_id, template, ref_id, fecha_local).
 */
export const notification_queue = pgTable("notification_queue", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenant_id:   uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  template:    varchar("template", { length: 50 }).notNull(),
  ref_id:      varchar("ref_id", { length: 100 }).notNull(),
  fecha_local: varchar("fecha_local", { length: 10 }).notNull(), // YYYY-MM-DD Bogotá
  channel:     varchar("channel", { length: 20 }).notNull(),     // 'whatsapp' | 'email' | 'in_app'
  status:      varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'sent' | 'failed'
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sent_at:     timestamp("sent_at", { withTimezone: true }),
  error:       text("error"),
  retry_count: integer("retry_count").notNull().default(0),
  payload:     jsonb("payload"),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq_dedup: unique("uq_notif_dedup").on(t.tenant_id, t.template, t.ref_id, t.fecha_local, t.channel),
}));

export type NotificationQueue = typeof notification_queue.$inferSelect;
export type NewNotificationQueue = typeof notification_queue.$inferInsert;
