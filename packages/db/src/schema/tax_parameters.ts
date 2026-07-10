import { pgTable, uuid, varchar, numeric, date, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Parámetros tributarios vigentes por año/período.
 * R7: NUNCA sobreescribir — nueva fila por cada vigencia.
 * Regla de no-huecos / no-traslapes se valida en el servicio antes de INSERT.
 */
export const tax_parameters = pgTable("tax_parameters", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Código único del parámetro: 'uvt', 'retefuente_compras_base', 'ica_bogota_comercio', etc.
  parametro: varchar("parametro", { length: 80 }).notNull(),
  descripcion: varchar("descripcion", { length: 300 }).notNull(),
  // Valor numérico: UVT en pesos, tasa en porcentaje, base en UVT, etc.
  valor: numeric("valor", { precision: 18, scale: 4 }).notNull(),
  // Unidad del valor: 'cop' | 'pct' | 'uvt' | 'dias'
  unidad: varchar("unidad", { length: 20 }).notNull().default("cop"),
  // Vigencia: [valido_desde, valido_hasta] — ambos inclusive (día → día)
  // Para vigencias indefinidas: valido_hasta = '9999-12-31'
  valido_desde: date("valido_desde").notNull(),
  valido_hasta: date("valido_hasta").notNull(),
  // Fuente normativa: 'Resolución DIAN 000238 de 2025', 'Art. 868 ET', etc.
  fuente_normativa: varchar("fuente_normativa", { length: 300 }),
  creado_por: varchar("creado_por", { length: 200 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
, (t) => ({
  // No puede arrancar dos vigencias del mismo parámetro en la misma fecha → garantiza unicidad mínima
  uq_param_inicio: unique("uq_tax_param_inicio").on(t.parametro, t.valido_desde),
  chk_fechas: check("chk_tax_fechas", sql`${t.valido_hasta} >= ${t.valido_desde}`),
}));

export type TaxParameter = typeof tax_parameters.$inferSelect;
export type NewTaxParameter = typeof tax_parameters.$inferInsert;

/** Claves canónicas de parámetros usadas en el código */
export const TAX_PARAM_KEYS = {
  UVT: "uvt",
  RETEFUENTE_COMPRAS_BASE_UVT: "retefuente_compras_base_uvt",
  RETEFUENTE_COMPRAS_PCT: "retefuente_compras_pct",
  RETEFUENTE_SERVICIOS_BASE_UVT: "retefuente_servicios_base_uvt",
  RETEFUENTE_SERVICIOS_PCT: "retefuente_servicios_pct",
  RETEFUENTE_HONORARIOS_PCT: "retefuente_honorarios_pct",
  RETEFUENTE_ARRENDAMIENTO_PCT: "retefuente_arrendamiento_pct",
  IVA_GENERAL_PCT: "iva_general_pct",
  IMPOCONSUMO_PCT: "impoconsumo_pct",
} as const;

export type TaxParamKey = (typeof TAX_PARAM_KEYS)[keyof typeof TAX_PARAM_KEYS];
