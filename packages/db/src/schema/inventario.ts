import { pgTable, uuid, varchar, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { bodegas } from "./bodegas.ts";
import { productos } from "./productos.ts";

export const TIPOS_MOVIMIENTO = ["entrada", "salida", "ajuste"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

// Cada movimiento es un evento inmutable.
// Stock actual = SUM(cantidad * signo) agrupado por producto+bodega:
//   entrada â†’ +cantidad
//   salida  â†’ -cantidad
//   ajuste  â†’ +cantidad (puede ser negativo para registrar una reduccion)
export const movimientos_inventario = pgTable("movimientos_inventario", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  bodega_id: uuid("bodega_id").notNull().references(() => bodegas.id),
  producto_id: uuid("producto_id").notNull().references(() => productos.id),
  tipo: varchar("tipo", { length: 20 }).$type<TipoMovimiento>().notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  costo_unitario: numeric("costo_unitario", { precision: 14, scale: 4 }),
  referencia_tipo: varchar("referencia_tipo", { length: 20 }), // "factura" | "compra" | "ajuste_manual"
  referencia_id: uuid("referencia_id"),
  observaciones: varchar("observaciones", { length: 300 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("movimientos_inventario_producto_tenant_idx").on(t.producto_id, t.tenant_id),
]);

export type MovimientoInventario = typeof movimientos_inventario.$inferSelect;
export type NewMovimientoInventario = typeof movimientos_inventario.$inferInsert;

