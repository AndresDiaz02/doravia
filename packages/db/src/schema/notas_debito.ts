import { pgTable, uuid, varchar, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { facturas } from "./facturas.ts";
import { clientes } from "./clientes.ts";

export const TIPOS_NOTA_DEBITO = ["interes", "gastos", "ajuste"] as const;
export type TipoNotaDebito = (typeof TIPOS_NOTA_DEBITO)[number];

export const notas_debito = pgTable("notas_debito", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  factura_id: uuid("factura_id").notNull().references(() => facturas.id),
  cliente_id: uuid("cliente_id").notNull().references(() => clientes.id),

  numero: varchar("numero", { length: 30 }).notNull(),
  consecutivo: integer("consecutivo").notNull(),

  tipo: varchar("tipo", { length: 20 }).$type<TipoNotaDebito>().notNull(),
  motivo: text("motivo").notNull(),

  estado: varchar("estado", { length: 20 }).notNull().default("aceptada"),

  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_total: numeric("iva_total", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),

  // Integración Plemsi / DIAN
  cude: varchar("cude", { length: 256 }),
  plemsi_id: varchar("plemsi_id", { length: 100 }),
  estado_dian: varchar("estado_dian", { length: 30 }).default("no_aplica"),
  error_dian: text("error_dian"),

  asiento_id: uuid("asiento_id"),

  fecha_emision: timestamp("fecha_emision", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items_nota_debito = pgTable("items_nota_debito", {
  id: uuid("id").primaryKey().defaultRandom(),
  nota_debito_id: uuid("nota_debito_id").notNull().references(() => notas_debito.id),
  descripcion: varchar("descripcion", { length: 500 }).notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  precio_unitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull(),
  iva_pct: numeric("iva_pct", { precision: 5, scale: 2 }).notNull().default("19"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_valor: numeric("iva_valor", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
});

export type NotaDebito = typeof notas_debito.$inferSelect;
export type ItemNotaDebito = typeof items_nota_debito.$inferSelect;
