import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { users } from "./users.ts";

/**
 * Log inmutable de transiciones de estado del ciclo de vida de cada tenant.
 * Nunca se borran filas — es registro de auditoría.
 */
export const tenant_state_transitions = pgTable("tenant_state_transitions", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenant_id:  uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  from_state: varchar("from_state", { length: 20 }),
  to_state:   varchar("to_state", { length: 20 }).notNull(),
  // 'trial_expired' | 'payment_confirmed' | 'grace_started' | 'grace_expired'
  // | 'fundador_archivado' | 'fundador_reactivado'
  reason:     varchar("reason", { length: 100 }).notNull(),
  // null = cron automático; uuid = usuario o fundador que disparó la transición
  actor_id:   uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  // referencia Bold u otros metadatos de contexto
  metadata:   jsonb("metadata"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantStateTransition = typeof tenant_state_transitions.$inferSelect;
