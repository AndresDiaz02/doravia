import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

/**
 * Reserva una operación de escritura enviada por un cliente. Evita que un
 * reintento de red cree dos facturas o dos ventas para la misma solicitud.
 */
export const idempotency_keys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  operacion: varchar("operacion", { length: 80 }).notNull(),
  clave: varchar("clave", { length: 200 }).notNull(),
  estado: varchar("estado", { length: 20 }).notNull().default("procesando"),
  respuesta: jsonb("respuesta"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("idempotency_keys_tenant_operacion_clave_unique").on(table.tenant_id, table.operacion, table.clave),
]);
