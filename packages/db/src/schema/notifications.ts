import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { users } from "./users.ts";

/**
 * Notificaciones in-app persistentes.
 * user_id = null → visible para todos los usuarios del tenant (ej: alerta de cupo).
 * user_id = uuid → solo para ese usuario (ej: alerta fundador R7).
 */
export const notifications = pgTable("notifications", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  user_id:   uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  type:      varchar("type", { length: 50 }).notNull(),   // clave de template o tipo libre
  title:     varchar("title", { length: 200 }).notNull(),
  body:      text("body").notNull(),
  link:      varchar("link", { length: 500 }),
  is_read:   boolean("is_read").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
