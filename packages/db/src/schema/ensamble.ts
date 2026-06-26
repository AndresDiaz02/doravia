import { pgTable, uuid, timestamp, numeric } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { productos } from "./productos.ts";

// Componentes de un producto ensamblado.
// producto_id = producto final (tipo "servicio" o "producto" marcado como ensamble)
// componente_id = insumo que se consume al producir/vender el producto final
export const componentes_producto = pgTable("componentes_producto", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  producto_id: uuid("producto_id").notNull().references(() => productos.id),
  componente_id: uuid("componente_id").notNull().references(() => productos.id),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ComponenteProducto = typeof componentes_producto.$inferSelect;
export type NewComponenteProducto = typeof componentes_producto.$inferInsert;

