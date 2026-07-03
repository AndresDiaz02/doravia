import { pgTable, uuid, varchar, integer, boolean, date, timestamp, text } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

// Cada tenant debe tener una resolucion DIAN vigente para emitir facturas electronicas.
// El consecutivo_actual se incrementa con cada factura emitida.
export const resoluciones_dian = pgTable("resoluciones_dian", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  numero_resolucion: varchar("numero_resolucion", { length: 50 }).notNull(),
  fecha_resolucion: date("fecha_resolucion").notNull(),
  prefijo: varchar("prefijo", { length: 10 }).notNull(),
  consecutivo_desde: integer("consecutivo_desde").notNull(),
  consecutivo_hasta: integer("consecutivo_hasta").notNull(),
  consecutivo_actual: integer("consecutivo_actual").notNull(),
  fecha_desde: date("fecha_desde").notNull(),
  fecha_hasta: date("fecha_hasta").notNull(),
  activa: boolean("activa").notNull().default(true),
  clave_tecnica: text("clave_tecnica"),
  plemsi_id: varchar("plemsi_id", { length: 100 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResolucionDian = typeof resoluciones_dian.$inferSelect;
export type NewResolucionDian = typeof resoluciones_dian.$inferInsert;

