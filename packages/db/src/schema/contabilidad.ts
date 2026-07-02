import { pgTable, uuid, varchar, timestamp, numeric, date, smallint, boolean } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const TIPOS_CUENTA = ["activo", "pasivo", "patrimonio", "ingreso", "costo", "gasto"] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number];

export const NATURALEZA_CUENTA = ["debito", "credito"] as const;
export type NaturalezaCuenta = (typeof NATURALEZA_CUENTA)[number];

export const ORIGENES_ASIENTO = ["factura", "compra", "pago", "ajuste", "manual"] as const;
export type OrigenAsiento = (typeof ORIGENES_ASIENTO)[number];

// PUC simplificado â€” cuentas del sistema (tenant_id null) + cuentas del tenant
export const cuentas_contables = pgTable("cuentas_contables", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").references(() => tenants.id), // null = cuenta del sistema
  codigo: varchar("codigo", { length: 20 }).notNull(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  tipo: varchar("tipo", { length: 20 }).$type<TipoCuenta>().notNull(),
  naturaleza: varchar("naturaleza", { length: 10 }).$type<NaturalezaCuenta>().notNull(),
  nivel: smallint("nivel").notNull(), // 1=clase, 2=grupo, 3=cuenta, 4=subcuenta
  padre_id: uuid("padre_id").references((): AnyPgColumn => cuentas_contables.id),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Libro diario â€” cada asiento agrupa sus lineas
export const asientos_contables = pgTable("asientos_contables", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  numero: varchar("numero", { length: 30 }).notNull(), // ej. "AC-2025-001"
  fecha: date("fecha").notNull(),
  descripcion: varchar("descripcion", { length: 300 }).notNull(),
  origen: varchar("origen", { length: 20 }).$type<OrigenAsiento>().notNull(),
  referencia_id: uuid("referencia_id"), // factura_id, compra_id, etc.
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Lineas del asiento â€” partida doble: sum(debito) = sum(credito)
export const lineas_asiento = pgTable("lineas_asiento", {
  id: uuid("id").primaryKey().defaultRandom(),
  asiento_id: uuid("asiento_id").notNull().references(() => asientos_contables.id),
  cuenta_id: uuid("cuenta_id").notNull().references(() => cuentas_contables.id),
  descripcion: varchar("descripcion", { length: 200 }),
  debito: numeric("debito", { precision: 14, scale: 2 }).notNull().default("0"),
  credito: numeric("credito", { precision: 14, scale: 2 }).notNull().default("0"),
  // Centro de costos â€” opcional, solo en tenants con feature centros_costos
  centro_costo_id: uuid("centro_costo_id"),
});

// Períodos contables — cierre de período para proteger asientos
export const periodos_contables = pgTable("periodos_contables", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  tipo: varchar("tipo", { length: 10 }).notNull().default("mensual"),
  fecha_inicio: date("fecha_inicio").notNull(),
  fecha_fin: date("fecha_fin").notNull(),
  estado: varchar("estado", { length: 20 }).notNull().default("abierto"),
  cerrado_at: timestamp("cerrado_at", { withTimezone: true }),
  cerrado_por_id: uuid("cerrado_por_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CuentaContable = typeof cuentas_contables.$inferSelect;
export type NewCuentaContable = typeof cuentas_contables.$inferInsert;
export type AsientoContable = typeof asientos_contables.$inferSelect;
export type NewAsientoContable = typeof asientos_contables.$inferInsert;
export type LineaAsiento = typeof lineas_asiento.$inferSelect;
export type NewLineaAsiento = typeof lineas_asiento.$inferInsert;
export type PeriodoContable = typeof periodos_contables.$inferSelect;

