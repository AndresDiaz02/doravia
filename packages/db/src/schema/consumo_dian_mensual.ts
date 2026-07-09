import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const consumo_dian_mensual = pgTable("consumo_dian_mensual", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  ano: integer("ano").notNull(),
  mes: integer("mes").notNull(),
  cantidad: integer("cantidad").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConsumoDianMensual = typeof consumo_dian_mensual.$inferSelect;
