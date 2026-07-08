import { pgTable, uuid, varchar, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const TIPOS_PRODUCTO = ["producto", "servicio"] as const;
export type TipoProducto = (typeof TIPOS_PRODUCTO)[number];

// Tarifas de IVA vigentes en Colombia
export const TARIFAS_IVA = [0, 5, 19] as const;

export const productos = pgTable("productos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  codigo: varchar("codigo", { length: 50 }).notNull(),
  nombre: varchar("nombre", { length: 300 }).notNull(),
  descripcion: varchar("descripcion", { length: 500 }),
  tipo: varchar("tipo", { length: 20 }).$type<TipoProducto>().notNull().default("producto"),
  unidad: varchar("unidad", { length: 30 }).default("und"),
  precio_base: numeric("precio_base", { precision: 14, scale: 2 }).notNull(),
  precio_venta: numeric("precio_venta", { precision: 14, scale: 2 }),
  iva_pct: numeric("iva_pct", { precision: 5, scale: 2 }).notNull().default("19"),
  impoconsumo_pct: numeric("impoconsumo_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  codigo_barras: varchar("codigo_barras", { length: 50 }),
  stock_actual: numeric("stock_actual", { precision: 12, scale: 4 }).default("0"),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Producto = typeof productos.$inferSelect;
export type NewProducto = typeof productos.$inferInsert;

