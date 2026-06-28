import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { users } from "./users.ts";

export const audit_log = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").references(() => tenants.id),
  user_id: uuid("user_id").references(() => users.id),
  accion: varchar("accion", { length: 100 }).notNull(),
  entidad_tipo: varchar("entidad_tipo", { length: 50 }),
  entidad_id: uuid("entidad_id"),
  detalle: jsonb("detalle"),
  ip: varchar("ip", { length: 45 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof audit_log.$inferSelect;
