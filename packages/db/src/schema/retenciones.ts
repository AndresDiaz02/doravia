import { pgTable, uuid, varchar, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { facturas } from "./facturas.ts";

export const TIPOS_RETENCION = ["retefuente", "reteiva", "reteica"] as const;
export type TipoRetencion = (typeof TIPOS_RETENCION)[number];

export const retenciones_config = pgTable("retenciones_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  tipo: varchar("tipo", { length: 20 }).$type<TipoRetencion>().notNull(),
  porcentaje: numeric("porcentaje", { precision: 6, scale: 4 }).notNull(),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const retenciones_factura = pgTable("retenciones_factura", {
  id: uuid("id").primaryKey().defaultRandom(),
  factura_id: uuid("factura_id").notNull().references(() => facturas.id),
  config_id: uuid("config_id").references(() => retenciones_config.id),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  tipo: varchar("tipo", { length: 20 }).$type<TipoRetencion>().notNull(),
  porcentaje: numeric("porcentaje", { precision: 6, scale: 4 }).notNull(),
  base: numeric("base", { precision: 14, scale: 2 }).notNull(),
  valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
});

export type RetencionConfig = typeof retenciones_config.$inferSelect;
export type RetencionFactura = typeof retenciones_factura.$inferSelect;
