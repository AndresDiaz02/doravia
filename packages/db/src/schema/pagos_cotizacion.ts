import { pgTable, uuid, varchar, numeric, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { cotizaciones } from "./cotizaciones.ts";
import { users } from "./users.ts";

export const ESTADOS_PAGO_COTIZACION = [
  "pendiente",
  "pagado",
  "expirado",
  "fallido",
  "reembolsado",
] as const;

export type EstadoPagoCotizacion = (typeof ESTADOS_PAGO_COTIZACION)[number];

export const PROVEEDORES_PAGO = [
  "bold",
  "stub",
  // slots documentados para futuros providers:
  // "wompi", "payu", "mercadopago"
] as const;

export type ProveedorPago = (typeof PROVEEDORES_PAGO)[number];

// ── Configuración de pagos por tenant (1:1 con tenants) ──────────────────────
export const configuracion_pagos_tenant = pgTable("configuracion_pagos_tenant", {
  tenant_id: uuid("tenant_id").primaryKey().references(() => tenants.id),
  proveedor: varchar("proveedor", { length: 30 }).notNull().$type<ProveedorPago>(),
  // Credenciales cifradas con AES-256-GCM (mismo esquema que plemsi)
  credenciales_encriptadas: text("credenciales_encriptadas").notNull(),
  habilitado: boolean("habilitado").notNull().default(true),
  actualizado_por: uuid("actualizado_por").references(() => users.id),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export type ConfiguracionPagosTenant = typeof configuracion_pagos_tenant.$inferSelect;

// ── Registro de pagos por cotización ─────────────────────────────────────────
export const pagos_cotizacion = pgTable("pagos_cotizacion", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  cotizacion_id: uuid("cotizacion_id").notNull().references(() => cotizaciones.id),
  proveedor: varchar("proveedor", { length: 30 }).notNull().$type<ProveedorPago>(),
  // referencia_externa: ID del link/intent en el proveedor
  referencia_externa: varchar("referencia_externa", { length: 200 }).notNull().unique(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull(),
  moneda: varchar("moneda", { length: 10 }).notNull().default("COP"),
  estado: varchar("estado", { length: 30 }).notNull().$type<EstadoPagoCotizacion>().default("pendiente"),
  url_link_pago: text("url_link_pago").notNull(),
  pagado_en: timestamp("pagado_en", { withTimezone: true }),
  expira_en: timestamp("expira_en", { withTimezone: true }),
  // metadata: respuesta cruda del proveedor para debug
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PagoCotizacion = typeof pagos_cotizacion.$inferSelect;
export type NewPagoCotizacion = typeof pagos_cotizacion.$inferInsert;
