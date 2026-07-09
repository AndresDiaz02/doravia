import { pgTable, uuid, varchar, timestamp, numeric, date, boolean, text } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { cuentas_contables, lineas_asiento } from "./contabilidad.ts";

// Cuentas bancarias del tenant (Bancolombia, Davivienda, Nequi, etc.)
export const cuentas_bancarias = pgTable("cuentas_bancarias", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: varchar("nombre", { length: 200 }).notNull(), // "Bancolombia Ahorros 1234"
  banco: varchar("banco", { length: 100 }).notNull(),   // "Bancolombia"
  numero_cuenta: varchar("numero_cuenta", { length: 50 }),
  cuenta_contable_id: uuid("cuenta_contable_id").references(() => cuentas_contables.id), // cuenta 1110 asociada
  activa: boolean("activa").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cabecera de cada proceso de conciliación (una por período + cuenta)
export const conciliaciones = pgTable("conciliaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  cuenta_bancaria_id: uuid("cuenta_bancaria_id").notNull().references(() => cuentas_bancarias.id),
  fecha_desde: date("fecha_desde").notNull(),
  fecha_hasta: date("fecha_hasta").notNull(),
  saldo_inicial_banco: numeric("saldo_inicial_banco", { precision: 14, scale: 2 }).notNull().default("0"),
  saldo_final_banco: numeric("saldo_final_banco", { precision: 14, scale: 2 }).notNull().default("0"),
  estado: varchar("estado", { length: 20 }).notNull().default("en_proceso"), // en_proceso | cerrada
  cerrada_at: timestamp("cerrada_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Movimientos importados del extracto bancario
// monto: positivo = crédito (ingreso al banco), negativo = débito (salida del banco)
export const movimientos_banco = pgTable("movimientos_banco", {
  id: uuid("id").primaryKey().defaultRandom(),
  conciliacion_id: uuid("conciliacion_id").notNull().references(() => conciliaciones.id),
  fecha: date("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull(), // positivo=ingreso, negativo=salida
  referencia: varchar("referencia", { length: 100 }),             // número cheque, REF bancaria, etc.
  estado: varchar("estado", { length: 20 }).notNull().default("pendiente"), // pendiente | conciliado | sin_libro
  // Qué línea de asiento cubre este movimiento (null = no conciliado aún)
  linea_asiento_id: uuid("linea_asiento_id").references(() => lineas_asiento.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CuentaBancaria = typeof cuentas_bancarias.$inferSelect;
export type NewCuentaBancaria = typeof cuentas_bancarias.$inferInsert;
export type Conciliacion = typeof conciliaciones.$inferSelect;
export type NewConciliacion = typeof conciliaciones.$inferInsert;
export type MovimientoBanco = typeof movimientos_banco.$inferSelect;
export type NewMovimientoBanco = typeof movimientos_banco.$inferInsert;
