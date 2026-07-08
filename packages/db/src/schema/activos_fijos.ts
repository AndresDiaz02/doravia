import { pgTable, uuid, varchar, numeric, date, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const METODOS_DEPRECIACION = ["lineal", "reduccion_saldos"] as const;
export type MetodoDepreciacion = (typeof METODOS_DEPRECIACION)[number];

export const ESTADOS_ACTIVO = ["activo", "depreciado", "dado_de_baja"] as const;
export type EstadoActivo = (typeof ESTADOS_ACTIVO)[number];

export const activos_fijos = pgTable("activos_fijos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  codigo: varchar("codigo", { length: 30 }),
  descripcion: varchar("descripcion", { length: 300 }).notNull(),
  categoria: varchar("categoria", { length: 100 }),
  valor_adquisicion: numeric("valor_adquisicion", { precision: 14, scale: 2 }).notNull(),
  valor_residual: numeric("valor_residual", { precision: 14, scale: 2 }).notNull().default("0"),
  depreciacion_acumulada: numeric("depreciacion_acumulada", { precision: 14, scale: 2 }).notNull().default("0"),
  valor_neto: numeric("valor_neto", { precision: 14, scale: 2 }).notNull(),
  vida_util_meses: integer("vida_util_meses").notNull(),
  metodo: varchar("metodo", { length: 20 }).$type<MetodoDepreciacion>().notNull().default("lineal"),
  fecha_adquisicion: date("fecha_adquisicion").notNull(),
  fecha_inicio_depreciacion: date("fecha_inicio_depreciacion").notNull(),
  cuenta_activo: varchar("cuenta_activo", { length: 20 }),
  cuenta_depreciacion: varchar("cuenta_depreciacion", { length: 20 }),
  cuenta_gasto: varchar("cuenta_gasto", { length: 20 }),
  estado: varchar("estado", { length: 20 }).$type<EstadoActivo>().notNull().default("activo"),
  observaciones: text("observaciones"),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Registro mensual de depreciación por activo
export const depreciaciones_activo = pgTable("depreciaciones_activo", {
  id: uuid("id").primaryKey().defaultRandom(),
  activo_id: uuid("activo_id").notNull().references(() => activos_fijos.id),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  ano: integer("ano").notNull(),
  mes: integer("mes").notNull(),
  valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
  valor_neto_al_final: numeric("valor_neto_al_final", { precision: 14, scale: 2 }).notNull(),
  asiento_id: uuid("asiento_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivoFijo = typeof activos_fijos.$inferSelect;
export type NewActivoFijo = typeof activos_fijos.$inferInsert;
export type DepreciacionActivo = typeof depreciaciones_activo.$inferSelect;
