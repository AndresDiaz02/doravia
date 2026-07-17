import { pgTable, uuid, varchar, numeric, date, text, boolean, timestamp, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { centros_costos } from "./centros_costos.ts";

export const TIPOS_CONTRATO = ["indefinido", "termino_fijo", "obra_labor", "prestacion_servicios"] as const;
export type TipoContrato = (typeof TIPOS_CONTRATO)[number];

export const ESTADOS_EMPLEADO = ["activo", "inactivo", "retirado"] as const;
export type EstadoEmpleado = (typeof ESTADOS_EMPLEADO)[number];

export const ESTADOS_NOMINA_PERIODO = ["borrador", "calculada", "aprobada", "emitida"] as const;
export type EstadoNominaPeriodo = (typeof ESTADOS_NOMINA_PERIODO)[number];

export const ESTADOS_DIAN_NOMINA = ["pendiente", "emitida", "error"] as const;
export type EstadoDianNomina = (typeof ESTADOS_DIAN_NOMINA)[number];

// ── Empleados ────────────────────────────────────────────────────────────────
export const empleados = pgTable("empleados", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  cedula: varchar("cedula", { length: 30 }).notNull(),
  nombres: varchar("nombres", { length: 150 }).notNull(),
  apellidos: varchar("apellidos", { length: 150 }).notNull(),
  cargo: varchar("cargo", { length: 100 }),
  fecha_ingreso: date("fecha_ingreso").notNull(),
  salario_base: numeric("salario_base", { precision: 14, scale: 2 }).notNull(),
  tipo_contrato: varchar("tipo_contrato", { length: 30 }).$type<TipoContrato>().notNull(),
  estado: varchar("estado", { length: 20 }).$type<EstadoEmpleado>().notNull().default("activo"),
  fecha_retiro: date("fecha_retiro"),
  centro_costos_id: uuid("centro_costos_id").references(() => centros_costos.id),
  // AES-256-GCM, mismo patrón que tenants.plemsi_api_key_encrypted (services/encryption.ts)
  datos_bancarios_encrypted: text("datos_bancarios_encrypted"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq_empleado_tenant_cedula: unique("uq_empleado_tenant_cedula").on(t.tenant_id, t.cedula),
}));

export type Empleado = typeof empleados.$inferSelect;
export type NewEmpleado = typeof empleados.$inferInsert;

// ── Contratos (historial por empleado — cada fila es un contrato) ────────────
export const contratos_empleado = pgTable("contratos_empleado", {
  id: uuid("id").primaryKey().defaultRandom(),
  empleado_id: uuid("empleado_id").notNull().references(() => empleados.id, { onDelete: "cascade" }),
  fecha_inicio: date("fecha_inicio").notNull(),
  fecha_fin: date("fecha_fin"),
  tipo: varchar("tipo", { length: 30 }).$type<TipoContrato>().notNull(),
  salario: numeric("salario", { precision: 14, scale: 2 }).notNull(),
  observaciones: text("observaciones"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContratoEmpleado = typeof contratos_empleado.$inferSelect;
export type NewContratoEmpleado = typeof contratos_empleado.$inferInsert;

// ── Períodos de nómina ───────────────────────────────────────────────────────
export const nominas_periodo = pgTable("nominas_periodo", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  ano: integer("ano").notNull(),
  mes: integer("mes").notNull(),
  // null = ciclo mensual; 1 o 2 = primera/segunda quincena
  quincena: integer("quincena"),
  estado: varchar("estado", { length: 20 }).$type<EstadoNominaPeriodo>().notNull().default("borrador"),
  totales_calculados: jsonb("totales_calculados").$type<{
    total_devengado?: number;
    total_deducciones?: number;
    total_aportes_parafiscales?: number;
    total_neto_pagar?: number;
  }>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq_periodo_tenant_ciclo: unique("uq_periodo_tenant_ciclo").on(t.tenant_id, t.ano, t.mes, t.quincena),
}));

export type NominaPeriodo = typeof nominas_periodo.$inferSelect;
export type NewNominaPeriodo = typeof nominas_periodo.$inferInsert;

// ── Detalle de nómina por empleado dentro de un período ───────────────────────
export const nominas_detalle = pgTable("nominas_detalle", {
  id: uuid("id").primaryKey().defaultRandom(),
  nomina_periodo_id: uuid("nomina_periodo_id").notNull().references(() => nominas_periodo.id, { onDelete: "cascade" }),
  empleado_id: uuid("empleado_id").notNull().references(() => empleados.id),
  salario_base: numeric("salario_base", { precision: 14, scale: 2 }).notNull(),
  horas_extras_valor: numeric("horas_extras_valor", { precision: 14, scale: 2 }).notNull().default("0"),
  recargos_valor: numeric("recargos_valor", { precision: 14, scale: 2 }).notNull().default("0"),
  comisiones_valor: numeric("comisiones_valor", { precision: 14, scale: 2 }).notNull().default("0"),
  deducciones_totales: numeric("deducciones_totales", { precision: 14, scale: 2 }).notNull().default("0"),
  aportes_parafiscales: numeric("aportes_parafiscales", { precision: 14, scale: 2 }).notNull().default("0"),
  neto_pagar: numeric("neto_pagar", { precision: 14, scale: 2 }).notNull().default("0"),
  documento_soporte_id: uuid("documento_soporte_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq_detalle_periodo_empleado: unique("uq_detalle_periodo_empleado").on(t.nomina_periodo_id, t.empleado_id),
}));

export type NominaDetalle = typeof nominas_detalle.$inferSelect;
export type NewNominaDetalle = typeof nominas_detalle.$inferInsert;

// ── Documento soporte de nómina electrónica (Plemsi/DIAN) ────────────────────
export const documentos_soporte_nomina = pgTable("documentos_soporte_nomina", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nomina_detalle_id: uuid("nomina_detalle_id").notNull().references(() => nominas_detalle.id, { onDelete: "cascade" }),
  cude: varchar("cude", { length: 256 }),
  estado_dian: varchar("estado_dian", { length: 20 }).$type<EstadoDianNomina>().notNull().default("pendiente"),
  fecha_emision: timestamp("fecha_emision", { withTimezone: true }),
  plemsi_response: jsonb("plemsi_response"),
  error_dian: text("error_dian"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentoSoporteNomina = typeof documentos_soporte_nomina.$inferSelect;
export type NewDocumentoSoporteNomina = typeof documentos_soporte_nomina.$inferInsert;

// ── Pool de documentos de nómina por tenant (1:1, mismo patrón que configuracion_pagos_tenant) ─
export const pool_documentos_nomina_tenant = pgTable("pool_documentos_nomina_tenant", {
  tenant_id: uuid("tenant_id").primaryKey().references(() => tenants.id),
  plan_slug: varchar("plan_slug", { length: 20 }).notNull(),
  documentos_incluidos: integer("documentos_incluidos").notNull(),
  documentos_consumidos_ciclo: integer("documentos_consumidos_ciclo").notNull().default(0),
  documentos_acumulados_previos: integer("documentos_acumulados_previos").notNull().default(0),
  documentos_adicionales_comprados: integer("documentos_adicionales_comprados").notNull().default(0),
  fecha_renovacion: date("fecha_renovacion").notNull(),
  // tope de acumulación = 2x documentos_incluidos del plan (regla de negocio, doc Fase 10)
  limite_acumulacion: integer("limite_acumulacion").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PoolDocumentosNominaTenant = typeof pool_documentos_nomina_tenant.$inferSelect;
export type NewPoolDocumentosNominaTenant = typeof pool_documentos_nomina_tenant.$inferInsert;
