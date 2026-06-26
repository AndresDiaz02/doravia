import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const centros_costos = pgTable("centros_costos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  codigo: varchar("codigo", { length: 20 }).notNull(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  descripcion: varchar("descripcion", { length: 300 }),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CentroCosto = typeof centros_costos.$inferSelect;
export type NewCentroCosto = typeof centros_costos.$inferInsert;

