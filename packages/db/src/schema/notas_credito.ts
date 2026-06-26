import { pgTable, uuid, varchar, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { facturas } from "./facturas.ts";
import { clientes } from "./clientes.ts";

export const TIPOS_NOTA_CREDITO = ["anulacion", "devolucion", "descuento", "ajuste"] as const;
export type TipoNotaCredito = (typeof TIPOS_NOTA_CREDITO)[number];

export const ESTADOS_NOTA_CREDITO = ["borrador", "aceptada"] as const;
export type EstadoNotaCredito = (typeof ESTADOS_NOTA_CREDITO)[number];

export const notas_credito = pgTable("notas_credito", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  factura_id: uuid("factura_id").notNull().references(() => facturas.id),
  cliente_id: uuid("cliente_id").notNull().references(() => clientes.id),

  numero: varchar("numero", { length: 30 }).notNull(),
  consecutivo: integer("consecutivo").notNull(),

  tipo: varchar("tipo", { length: 20 }).$type<TipoNotaCredito>().notNull(),
  motivo: text("motivo").notNull(),

  estado: varchar("estado", { length: 20 }).$type<EstadoNotaCredito>().notNull().default("borrador"),

  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_total: numeric("iva_total", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),

  cufe_nota: varchar("cufe_nota", { length: 200 }),
  asiento_id: uuid("asiento_id"),

  fecha_emision: timestamp("fecha_emision", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items_nota_credito = pgTable("items_nota_credito", {
  id: uuid("id").primaryKey().defaultRandom(),
  nota_credito_id: uuid("nota_credito_id").notNull().references(() => notas_credito.id),
  descripcion: varchar("descripcion", { length: 500 }).notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  precio_unitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull(),
  iva_pct: numeric("iva_pct", { precision: 5, scale: 2 }).notNull().default("19"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_valor: numeric("iva_valor", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
});

export type NotaCredito = typeof notas_credito.$inferSelect;
export type ItemNotaCredito = typeof items_nota_credito.$inferSelect;
