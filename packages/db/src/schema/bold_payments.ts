import { pgTable, uuid, varchar, numeric, timestamp, jsonb, smallint } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const bold_payments = pgTable("bold_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").references(() => tenants.id),
  reference_id: varchar("reference_id", { length: 100 }).notNull().unique(),
  transaction_id: varchar("transaction_id", { length: 100 }),
  plan_id: varchar("plan_id", { length: 50 }),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull(),
  moneda: varchar("moneda", { length: 10 }).notNull().default("COP"),
  metodo_pago: varchar("metodo_pago", { length: 30 }),
  estado: varchar("estado", { length: 30 }).notNull().default("PENDING"),
  // Modalidad de pago: 'anual' | 'mensual' | '3cuotas'
  modalidad: varchar("modalidad", { length: 20 }).notNull().default("anual"),
  cuota_numero: smallint("cuota_numero").notNull().default(1),
  total_cuotas: smallint("total_cuotas").notNull().default(1),
  descripcion: varchar("descripcion", { length: 200 }),
  callback_url: varchar("callback_url", { length: 500 }),
  bold_response: jsonb("bold_response").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BoldPayment = typeof bold_payments.$inferSelect;
export type NewBoldPayment = typeof bold_payments.$inferInsert;
