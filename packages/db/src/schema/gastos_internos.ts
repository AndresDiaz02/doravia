import { pgTable, uuid, varchar, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";

export const FRECUENCIA_GASTO = ["mensual", "anual", "unico"] as const;
export type FrecuenciaGasto = (typeof FRECUENCIA_GASTO)[number];

export const gastos_internos = pgTable("gastos_internos", {
  id: uuid("id").primaryKey().defaultRandom(),
  concepto: varchar("concepto", { length: 200 }).notNull(),
  proveedor: varchar("proveedor", { length: 100 }),
  monto_cop: integer("monto_cop").notNull(),
  frecuencia: varchar("frecuencia", { length: 10 }).$type<FrecuenciaGasto>().notNull().default("mensual"),
  activo: boolean("activo").notNull().default(true),
  notas: text("notas"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GastoInterno = typeof gastos_internos.$inferSelect;
export type NewGastoInterno = typeof gastos_internos.$inferInsert;
