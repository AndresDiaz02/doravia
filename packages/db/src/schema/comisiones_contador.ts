import { pgTable, uuid, varchar, integer, numeric, boolean, smallint, timestamp, text } from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { tenants } from "./tenants.ts";

export const TIPO_COMISION = ["venta_inicial", "renovacion"] as const;
export type TipoComision = (typeof TIPO_COMISION)[number];

export const comisiones_contador = pgTable("comisiones_contador", {
  id: uuid("id").primaryKey().defaultRandom(),
  contador_user_id: uuid("contador_user_id").notNull().references(() => users.id),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  tipo: varchar("tipo", { length: 20 }).$type<TipoComision>().notNull(),
  // 1 = venta inicial, 2-5 = año de renovación
  ano_renovacion: smallint("ano_renovacion").notNull().default(1),
  porcentaje: numeric("porcentaje", { precision: 5, scale: 2 }).notNull(),
  base_cop: integer("base_cop").notNull(),
  valor_cop: integer("valor_cop").notNull(),
  pagada: boolean("pagada").notNull().default(false),
  fecha_pago: timestamp("fecha_pago", { withTimezone: true }),
  notas: text("notas"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ComisionContador = typeof comisiones_contador.$inferSelect;
export type NewComisionContador = typeof comisiones_contador.$inferInsert;
