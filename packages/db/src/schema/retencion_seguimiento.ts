import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const ETAPAS_RETENCION = ["en_riesgo", "contactado", "en_negociacion", "renovado", "cancelado"] as const;
export type EtapaRetencion = (typeof ETAPAS_RETENCION)[number];

export const retencion_seguimiento = pgTable("retencion_seguimiento", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().unique().references(() => tenants.id),
  etapa: varchar("etapa", { length: 30 }).$type<EtapaRetencion>().notNull().default("en_riesgo"),
  notas: text("notas"),
  responsable: varchar("responsable", { length: 100 }),
  proxima_accion_at: timestamp("proxima_accion_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RetenciónSeguimiento = typeof retencion_seguimiento.$inferSelect;
