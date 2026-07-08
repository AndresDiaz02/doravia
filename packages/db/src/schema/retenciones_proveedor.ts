import { pgTable, uuid, varchar, numeric, date, text, timestamp, integer } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { proveedores } from "./gastos.ts";

export const TIPOS_RETENCION_PROV = ["retefuente", "reteiva", "reteica"] as const;
export type TipoRetencionProv = (typeof TIPOS_RETENCION_PROV)[number];

// Registro de retenciones aplicadas al pagar a proveedores.
// Fuente para generar certificados anuales de retención.
export const retenciones_proveedor = pgTable("retenciones_proveedor", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  proveedor_id: uuid("proveedor_id").references(() => proveedores.id),
  nombre_proveedor: varchar("nombre_proveedor", { length: 200 }).notNull(),
  nit_proveedor: varchar("nit_proveedor", { length: 30 }),
  tipo: varchar("tipo", { length: 20 }).$type<TipoRetencionProv>().notNull(),
  nombre_concepto: varchar("nombre_concepto", { length: 100 }).notNull(),
  porcentaje: numeric("porcentaje", { precision: 6, scale: 4 }).notNull(),
  base: numeric("base", { precision: 14, scale: 2 }).notNull(),
  valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
  fecha: date("fecha").notNull(),
  ano: integer("ano").notNull(),
  mes: integer("mes").notNull(),
  referencia_tipo: varchar("referencia_tipo", { length: 30 }),
  referencia_id: uuid("referencia_id"),
  referencia_numero: varchar("referencia_numero", { length: 50 }),
  observaciones: text("observaciones"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RetencionProveedor = typeof retenciones_proveedor.$inferSelect;
export type NewRetencionProveedor = typeof retenciones_proveedor.$inferInsert;
