import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const bodegas = pgTable("bodegas", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  descripcion: varchar("descripcion", { length: 500 }),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Bodega = typeof bodegas.$inferSelect;
export type NewBodega = typeof bodegas.$inferInsert;

