import { pgTable, uuid, varchar, timestamp, numeric, integer, boolean, text, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { clientes } from "./clientes.ts";
import { productos } from "./productos.ts";

export const METODOS_PAGO_POS = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata", "mixto"] as const;
export type MetodoPagoPOS = (typeof METODOS_PAGO_POS)[number];

export const ESTADOS_TURNO = ["abierto", "cerrado"] as const;
export const ESTADOS_VENTA_POS = ["completada", "anulada"] as const;
export const ESTADOS_DIAN_POS = ["pendiente_envio", "enviado", "anulado"] as const;
export const TIPOS_DOCUMENTO_POS = ["factura_electronica", "tiquete_pos"] as const;
export type EstadoDianPOS = (typeof ESTADOS_DIAN_POS)[number];
export type TipoDocumentoPOS = (typeof TIPOS_DOCUMENTO_POS)[number];

export interface GrameraConfig {
  habilitada: boolean;
  marca: string;
  modelo: string;
  tipo: "serial" | "keyboard";
  baudRate?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  regex: string;
  unidad: "kg" | "g" | "lb";
}

export interface CajaConfig {
  gramera?: GrameraConfig;
}

// Cajas registradoras del tenant
export const cajas_pos = pgTable("cajas_pos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  descripcion: varchar("descripcion", { length: 200 }),
  activo: boolean("activo").notNull().default(true),
  config: jsonb("config").$type<CajaConfig>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Turnos de caja (apertura/cierre)
export const turnos_pos = pgTable("turnos_pos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  caja_id: uuid("caja_id").notNull().references(() => cajas_pos.id),
  usuario_id: uuid("usuario_id").notNull(),
  monto_inicial: numeric("monto_inicial", { precision: 14, scale: 2 }).notNull().default("0"),
  monto_final_declarado: numeric("monto_final_declarado", { precision: 14, scale: 2 }),
  total_ventas: numeric("total_ventas", { precision: 14, scale: 2 }).notNull().default("0"),
  estado: varchar("estado", { length: 20 }).notNull().default("abierto"),
  apertura_at: timestamp("apertura_at", { withTimezone: true }).notNull().defaultNow(),
  cierre_at: timestamp("cierre_at", { withTimezone: true }),
  notas_cierre: text("notas_cierre"),
});

// Ventas del POS
export const ventas_pos = pgTable("ventas_pos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  turno_id: uuid("turno_id").notNull().references(() => turnos_pos.id),
  caja_id: uuid("caja_id").notNull().references(() => cajas_pos.id),
  numero: varchar("numero", { length: 30 }).notNull(),
  consecutivo: integer("consecutivo").notNull(),
  cliente_id: uuid("cliente_id").references(() => clientes.id),
  nombre_cliente: varchar("nombre_cliente", { length: 200 }),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  descuento_total: numeric("descuento_total", { precision: 14, scale: 2 }).notNull().default("0"),
  iva_total: numeric("iva_total", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  metodo_pago: varchar("metodo_pago", { length: 20 }).$type<MetodoPagoPOS>().notNull().default("efectivo"),
  monto_recibido: numeric("monto_recibido", { precision: 14, scale: 2 }),
  vuelto: numeric("vuelto", { precision: 14, scale: 2 }),
  estado: varchar("estado", { length: 20 }).notNull().default("completada"),
  tipo_documento: varchar("tipo_documento", { length: 30 }).$type<TipoDocumentoPOS>().notNull().default("tiquete_pos"),
  // Estado DIAN — completamente independiente del estado de la venta
  estado_dian: varchar("estado_dian", { length: 30 }).$type<EstadoDianPOS>().notNull().default("pendiente_envio"),
  fecha_limite_envio: timestamp("fecha_limite_envio", { withTimezone: true }),
  enviado_en: timestamp("enviado_en", { withTimezone: true }),
  // Auditoría de anulación (si estado_dian = "anulado")
  anulado_por: uuid("anulado_por"),
  anulado_en: timestamp("anulado_en", { withTimezone: true }),
  anulado_motivo: text("anulado_motivo"),
  observaciones: text("observaciones"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Ítems de cada venta POS
export const items_venta_pos = pgTable("items_venta_pos", {
  id: uuid("id").primaryKey().defaultRandom(),
  venta_id: uuid("venta_id").notNull().references(() => ventas_pos.id),
  producto_id: uuid("producto_id").references(() => productos.id),
  descripcion: varchar("descripcion", { length: 300 }).notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  precio_unitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull(),
  descuento_pct: numeric("descuento_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  iva_pct: numeric("iva_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_valor: numeric("iva_valor", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
});

export type CajaPOS = typeof cajas_pos.$inferSelect;
export type TurnoPOS = typeof turnos_pos.$inferSelect;
export type VentaPOS = typeof ventas_pos.$inferSelect;
export type ItemVentaPOS = typeof items_venta_pos.$inferSelect;

// ── Fiados (crédito informal en POS) ─────────────────────────────────────────

export const ESTADOS_FIADO = ["pendiente", "pagado", "vencido"] as const;
export type EstadoFiado = (typeof ESTADOS_FIADO)[number];

export const fiados = pgTable("fiados", {
  id:               uuid("id").primaryKey().defaultRandom(),
  tenant_id:        uuid("tenant_id").notNull().references(() => tenants.id),
  caja_id:          uuid("caja_id").references(() => cajas_pos.id),
  cliente_id:       uuid("cliente_id").references(() => clientes.id),
  nombre_cliente:   varchar("nombre_cliente", { length: 200 }).notNull(),
  telefono_cliente: varchar("telefono_cliente", { length: 30 }),
  monto_total:      numeric("monto_total",  { precision: 14, scale: 2 }).notNull(),
  monto_pagado:     numeric("monto_pagado", { precision: 14, scale: 2 }).notNull().default("0"),
  estado:           varchar("estado", { length: 20 }).$type<EstadoFiado>().notNull().default("pendiente"),
  fecha_vencimiento: text("fecha_vencimiento"),  // "YYYY-MM-DD" opcional
  notas:            text("notas"),
  asiento_id:       uuid("asiento_id"),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items_fiado = pgTable("items_fiado", {
  id:              uuid("id").primaryKey().defaultRandom(),
  fiado_id:        uuid("fiado_id").notNull().references(() => fiados.id),
  producto_id:     uuid("producto_id").references(() => productos.id),
  descripcion:     varchar("descripcion", { length: 300 }).notNull(),
  cantidad:        numeric("cantidad",        { precision: 10, scale: 4 }).notNull(),
  precio_unitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull(),
  total:           numeric("total",           { precision: 14, scale: 2 }).notNull(),
});

export const abonos_fiado = pgTable("abonos_fiado", {
  id:          uuid("id").primaryKey().defaultRandom(),
  fiado_id:    uuid("fiado_id").notNull().references(() => fiados.id),
  usuario_id:  uuid("usuario_id").notNull(),
  monto:       numeric("monto", { precision: 14, scale: 2 }).notNull(),
  metodo_pago: varchar("metodo_pago", { length: 20 }).notNull().default("efectivo"),
  notas:       text("notas"),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Fiado = typeof fiados.$inferSelect;
export type AbonoFiado = typeof abonos_fiado.$inferSelect;

// ── Citas / Agenda POS ──────────────────────────────────────────────────────
export const ESTADOS_CITA = ["programada", "en_proceso", "completada", "cancelada"] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

export const citas_pos = pgTable("citas_pos", {
  id:                uuid("id").primaryKey().defaultRandom(),
  tenant_id:         uuid("tenant_id").notNull().references(() => tenants.id),
  caja_id:           uuid("caja_id").references(() => cajas_pos.id),
  cliente_nombre:    varchar("cliente_nombre", { length: 200 }).notNull(),
  cliente_telefono:  varchar("cliente_telefono", { length: 30 }),
  fecha_hora:        timestamp("fecha_hora", { withTimezone: true }).notNull(),
  servicio:          varchar("servicio", { length: 200 }).notNull(),
  profesional:       varchar("profesional", { length: 200 }),
  duracion_min:      integer("duracion_min").default(30),
  notas:             text("notas"),
  estado:            varchar("estado", { length: 20 }).$type<EstadoCita>().notNull().default("programada"),
  created_at:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CitaPos = typeof citas_pos.$inferSelect;
export type NewCitaPos = typeof citas_pos.$inferInsert;
