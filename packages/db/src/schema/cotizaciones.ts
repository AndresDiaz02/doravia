import { pgTable, uuid, varchar, timestamp, numeric, text, integer } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { clientes } from "./clientes.ts";
import { facturas } from "./facturas.ts";

export const ESTADOS_COTIZACION = [
  "borrador",
  "enviada",
  "aceptada",
  "rechazada",
  "vencida",
  "convertida", // convertida a factura
] as const;

export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

export const cotizaciones = pgTable("cotizaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  cliente_id: uuid("cliente_id").notNull().references(() => clientes.id),
  numero: varchar("numero", { length: 30 }).notNull(), // COT-0001
  estado: varchar("estado", { length: 20 }).$type<EstadoCotizacion>().notNull().default("borrador"),
  fecha_emision: timestamp("fecha_emision", { withTimezone: true }).notNull(),
  fecha_vencimiento: timestamp("fecha_vencimiento", { withTimezone: true }),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  descuento_total: numeric("descuento_total", { precision: 14, scale: 2 }).notNull().default("0"),
  iva_total: numeric("iva_total", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  // Referencia a la factura generada si se convirtio
  factura_id: uuid("factura_id").references(() => facturas.id),
  // Consecutivo para autonumeracion
  consecutivo: integer("consecutivo").notNull(),
  observaciones: text("observaciones"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items_cotizacion = pgTable("items_cotizacion", {
  id: uuid("id").primaryKey().defaultRandom(),
  cotizacion_id: uuid("cotizacion_id").notNull().references(() => cotizaciones.id),
  producto_id: uuid("producto_id"),
  descripcion: varchar("descripcion", { length: 500 }).notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  precio_unitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull(),
  descuento_pct: numeric("descuento_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  iva_pct: numeric("iva_pct", { precision: 5, scale: 2 }).notNull().default("19"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_valor: numeric("iva_valor", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
});

export type Cotizacion = typeof cotizaciones.$inferSelect;
export type NewCotizacion = typeof cotizaciones.$inferInsert;
export type ItemCotizacion = typeof items_cotizacion.$inferSelect;

