import { pgTable, uuid, varchar, smallint, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { PlanFeatures } from "@workspace/shared";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 20 }).unique().notNull(),
  nombre: varchar("nombre", { length: 50 }).notNull(),
  // 'erp' | 'pos' | 'origen'
  product: varchar("product", { length: 20 }).notNull().default("erp"),

  // Limites numericos -- NULL = ilimitado
  max_usuarios:     smallint("max_usuarios"),
  max_bodegas:      smallint("max_bodegas"),
  max_facturas_mes: integer("max_facturas_mes"),
  max_facturas_ano: integer("max_facturas_ano"),
  max_ia_docs_mes:  integer("max_ia_docs_mes"),
  // Cupo anual de documentos electrónicos (solo planes Origen). NULL = sin límite (ERP/POS). Prerrequisito FASE 3.
  document_limit:   integer("document_limit"),

  // Nivel contable ordinal: 0=ninguno, 1=diario_mayor, 2=balance, 3=comparativo, 4=centros_costos
  accounting_level: smallint("accounting_level").notNull(),

  // Feature flags booleanos para modulos completos
  features: jsonb("features").$type<PlanFeatures>().notNull(),

  precio_anual_cop: integer("precio_anual_cop").notNull(),
  // Modalidades de pago (calculados del anual; sin lógica de cobro aún — FASE 5)
  // mensual = anual / 10 ; 3 cuotas = anual * 1.10
  precio_mensual_cop: integer("precio_mensual_cop"),
  precio_3cuotas_total_cop: integer("precio_3cuotas_total_cop"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
