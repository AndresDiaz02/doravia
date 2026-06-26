import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, date } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { clientes } from "./clientes.ts";

export const FRECUENCIAS = [
  "diaria",
  "semanal",
  "quincenal",
  "mensual",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
] as const;

export type Frecuencia = (typeof FRECUENCIAS)[number];

// Dias a sumar segun frecuencia (aproximacion; mensual/bimestral etc. usan addMeses)
export const DIAS_POR_FRECUENCIA: Record<Frecuencia, number | null> = {
  diaria:      1,
  semanal:     7,
  quincenal:   15,
  mensual:     null, // +1 mes
  bimestral:   null, // +2 meses
  trimestral:  null, // +3 meses
  semestral:   null, // +6 meses
  anual:       null, // +12 meses
};

export const MESES_POR_FRECUENCIA: Partial<Record<Frecuencia, number>> = {
  mensual:    1,
  bimestral:  2,
  trimestral: 3,
  semestral:  6,
  anual:      12,
};

export interface PlantillaItem {
  producto_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct?: number;
  iva_pct?: number;
}

export const plantillas_factura = pgTable("plantillas_factura", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  cliente_id: uuid("cliente_id").notNull().references(() => clientes.id),
  frecuencia: varchar("frecuencia", { length: 20 }).$type<Frecuencia>().notNull(),
  dias_vencimiento: integer("dias_vencimiento").notNull().default(30),
  activo: boolean("activo").notNull().default(true),
  proxima_ejecucion: date("proxima_ejecucion").notNull(),
  ultima_ejecucion: date("ultima_ejecucion"),
  items: jsonb("items").$type<PlantillaItem[]>().notNull(),
  observaciones: varchar("observaciones", { length: 500 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlantillaFactura = typeof plantillas_factura.$inferSelect;
export type NewPlantillaFactura = typeof plantillas_factura.$inferInsert;

