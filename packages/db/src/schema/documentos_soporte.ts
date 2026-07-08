import { pgTable, uuid, varchar, numeric, date, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

// Documento soporte en adquisiciones a no obligados a facturar (Art. 616-1 ET).
// Se genera cuando se compra a personas naturales sin RUT o no obligados a facturar.
export const documentos_soporte = pgTable("documentos_soporte", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  numero: varchar("numero", { length: 30 }).notNull(),
  consecutivo: integer("consecutivo", { mode: "number" }).notNull(),
  // Datos del vendedor no obligado
  nombre_vendedor: varchar("nombre_vendedor", { length: 200 }).notNull(),
  tipo_documento_vendedor: varchar("tipo_documento_vendedor", { length: 20 }).notNull().default("CC"),
  nit_vendedor: varchar("nit_vendedor", { length: 30 }).notNull(),
  // Concepto y valores
  descripcion: varchar("descripcion", { length: 500 }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_asumido: numeric("iva_asumido", { precision: 14, scale: 2 }).notNull().default("0"),
  retencion_fuente: numeric("retencion_fuente", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  fecha: date("fecha").notNull(),
  // Contabilidad
  asiento_id: uuid("asiento_id"),
  observaciones: text("observaciones"),
  anulado: boolean("anulado").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items_documento_soporte = pgTable("items_documento_soporte", {
  id: uuid("id").primaryKey().defaultRandom(),
  documento_id: uuid("documento_id").notNull().references(() => documentos_soporte.id, { onDelete: "cascade" }),
  descripcion: varchar("descripcion", { length: 300 }).notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  valor_unitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
});

export type DocumentoSoporte = typeof documentos_soporte.$inferSelect;
export type NewDocumentoSoporte = typeof documentos_soporte.$inferInsert;
