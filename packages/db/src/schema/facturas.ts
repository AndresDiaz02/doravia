import { pgTable, uuid, varchar, integer, boolean, timestamp, numeric, text, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { clientes } from "./clientes.ts";
import { resoluciones_dian } from "./resoluciones_dian.ts";

export const ESTADOS_FACTURA = ["borrador", "enviada", "aceptada", "rechazada", "anulada"] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

export const CONDICIONES_PAGO = ["contado", "credito"] as const;
export type CondicionPago = (typeof CONDICIONES_PAGO)[number];

export const FORMAS_PAGO = ["efectivo", "tarjeta_credito", "tarjeta_debito", "transferencia", "cheque", "otro"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export const UNIDADES_MEDIDA = ["UN", "KG", "GR", "LT", "ML", "MT", "CM", "M2", "M3", "HOR", "DIA", "MES", "BOL", "CJA", "PAR", "DOZ"] as const;
export type UnidadMedida = (typeof UNIDADES_MEDIDA)[number];

export const facturas = pgTable("facturas", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  cliente_id: uuid("cliente_id").notNull().references(() => clientes.id),
  resolucion_id: uuid("resolucion_id").notNull().references(() => resoluciones_dian.id),

  // Numeracion DIAN: prefijo + consecutivo forman el numero visible (ej. FV-0001)
  prefijo: varchar("prefijo", { length: 10 }).notNull(),
  consecutivo: integer("consecutivo").notNull(),
  numero: varchar("numero", { length: 30 }).notNull(), // prefijo + consecutivo formateado

  estado: varchar("estado", { length: 20 }).$type<EstadoFactura>().notNull().default("borrador"),

  // Campos DIAN â€” se llenan una vez la factura es aceptada por el PT
  cufe: varchar("cufe", { length: 200 }).unique(),
  qr_code: text("qr_code"),
  xml_firmado: text("xml_firmado"),

  fecha_emision: timestamp("fecha_emision", { withTimezone: true }).notNull(),
  fecha_vencimiento: timestamp("fecha_vencimiento", { withTimezone: true }),

  // Totales calculados y almacenados para consultas rapidas
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  descuento_total: numeric("descuento_total", { precision: 14, scale: 2 }).notNull().default("0"),
  iva_total: numeric("iva_total", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),

  total_retenciones: numeric("total_retenciones", { precision: 14, scale: 2 }).notNull().default("0"),
  neto_a_pagar: numeric("neto_a_pagar", { precision: 14, scale: 2 }).notNull().default("0"),

  // FK al asiento contable generado automaticamente
  asiento_id: uuid("asiento_id"),

  // Campos requeridos por UBL 2.1 / DIAN Resolución 000042 de 2020
  condicion_pago: varchar("condicion_pago", { length: 10 }).$type<CondicionPago>().notNull().default("contado"),
  forma_pago: varchar("forma_pago", { length: 30 }).$type<FormaPago>().notNull().default("efectivo"),

  observaciones: text("observaciones"),
  pagada_at: timestamp("pagada_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("facturas_tenant_fecha_idx").on(t.tenant_id, t.fecha_emision),
  index("facturas_tenant_estado_idx").on(t.tenant_id, t.estado),
]);

export const items_factura = pgTable("items_factura", {
  id: uuid("id").primaryKey().defaultRandom(),
  factura_id: uuid("factura_id").notNull().references(() => facturas.id),
  producto_id: uuid("producto_id"), // nullable â€” permite linea de texto libre
  descripcion: varchar("descripcion", { length: 500 }).notNull(),
  cantidad: numeric("cantidad", { precision: 10, scale: 4 }).notNull(),
  precio_unitario: numeric("precio_unitario", { precision: 14, scale: 4 }).notNull(),
  descuento_pct: numeric("descuento_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  iva_pct: numeric("iva_pct", { precision: 5, scale: 2 }).notNull().default("19"),
  unidad_medida: varchar("unidad_medida", { length: 10 }).$type<UnidadMedida>().notNull().default("UN"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  iva_valor: numeric("iva_valor", { precision: 14, scale: 2 }).notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
}, (t) => [
  index("items_factura_factura_idx").on(t.factura_id),
]);

export type Factura = typeof facturas.$inferSelect;
export type NewFactura = typeof facturas.$inferInsert;
export type ItemFactura = typeof items_factura.$inferSelect;
export type NewItemFactura = typeof items_factura.$inferInsert;

