import { pgTable, uuid, varchar, timestamp, numeric, integer, text, date } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { clientes } from "./clientes.ts";
import { productos } from "./productos.ts";

export const ESTADOS_REMISION = ["borrador", "enviada", "entregada", "anulada"] as const;
export type EstadoRemision = (typeof ESTADOS_REMISION)[number];

export const remisiones = pgTable("remisiones", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  numero: varchar("numero", { length: 30 }).notNull(),
  consecutivo: integer("consecutivo").notNull(),
  cliente_id: uuid("cliente_id").references(() => clientes.id),
  nombre_cliente: varchar("nombre_cliente", { length: 200 }),
  direccion_entrega: varchar("direccion_entrega", { length: 300 }),
  fecha: date("fecha").notNull(),
  fecha_entrega: date("fecha_entrega"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  estado: varchar("estado", { length: 20 }).$type<EstadoRemision>().notNull().default("borrador"),
  observaciones: text("observaciones"),
  creado_por: uuid("creado_por"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items_remision = pgTable("items_remision", {
  id: uuid("id").primaryKey().defaultRandom(),
  remision_id: uuid("remision_id").notNull().references(() => remisiones.id, { onDelete: "cascade" }),
  producto_id: uuid("producto_id").references(() => productos.id),
  descripcion: varchar("descripcion", { length: 300 }).notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  precio_unitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
});

export type Remision = typeof remisiones.$inferSelect;
export type ItemRemision = typeof items_remision.$inferSelect;
