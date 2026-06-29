import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const pending_registrations = pgTable("pending_registrations", {
  id:              uuid("id").primaryKey().defaultRandom(),
  plan_slug:       varchar("plan_slug", { length: 20 }).notNull(),
  tenant_nombre:   varchar("tenant_nombre", { length: 200 }).notNull(),
  nit:             varchar("nit", { length: 20 }).notNull(),
  usuario_nombre:  varchar("usuario_nombre", { length: 100 }).notNull(),
  email:           varchar("email", { length: 200 }).notNull().unique(),
  password_hash:   text("password_hash").notNull(),
  wompi_reference: varchar("wompi_reference", { length: 120 }).notNull().unique(),
  completed_at:    timestamp("completed_at", { withTimezone: true }),
  expires_at:      timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PendingRegistration = typeof pending_registrations.$inferSelect;
