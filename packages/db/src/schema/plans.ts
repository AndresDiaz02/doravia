import { pgTable, uuid, varchar, smallint, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { PlanFeatures } from "@workspace/shared";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 20 }).unique().notNull(),
  nombre: varchar("nombre", { length: 50 }).notNull(),

  // Limites numericos -- NULL = ilimitado
  max_usuarios:     smallint("max_usuarios"),
  max_bodegas:      smallint("max_bodegas"),
  max_facturas_mes: integer("max_facturas_mes"),
  max_facturas_ano: integer("max_facturas_ano"),
  max_ia_docs_mes:  integer("max_ia_docs_mes"),

  // Nivel contable ordinal: 0=ninguno, 1=diario_mayor, 2=balance, 3=comparativo, 4=centros_costos
  accounting_level: smallint("accounting_level").notNull(),

  // Feature flags booleanos para modulos completos
  features: jsonb("features").$type<PlanFeatures>().notNull(),

  precio_anual_cop: integer("precio_anual_cop").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
