import { pgTable, uuid, varchar, timestamp, numeric, boolean, date, text, integer } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const proveedores = pgTable("proveedores", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  tipo_documento: varchar("tipo_documento", { length: 20 }).notNull().default("NIT"),
  nit: varchar("nit", { length: 30 }),
  correo: varchar("correo", { length: 200 }),
  telefono: varchar("telefono", { length: 30 }),
  direccion: varchar("direccion", { length: 300 }),
  ciudad: varchar("ciudad", { length: 100 }),
  persona_contacto: varchar("persona_contacto", { length: 200 }),
  terminos_pago: integer("terminos_pago").notNull().default(0),
  observaciones: text("observaciones"),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const CATEGORIAS_GASTO = [
  "arrendamiento",
  "nomina",
  "servicios_publicos",
  "transporte",
  "publicidad",
  "papeleria",
  "tecnologia",
  "mantenimiento",
  "impuestos",
  "honorarios",
  "compra_mercancia",
  "otros",
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

export const CATEGORIA_LABELS: Record<CategoriaGasto, string> = {
  arrendamiento:     "Arrendamiento",
  nomina:            "Nomina",
  servicios_publicos: "Servicios publicos",
  transporte:        "Transporte",
  publicidad:        "Publicidad",
  papeleria:         "Papeleria",
  tecnologia:        "Tecnologia",
  mantenimiento:     "Mantenimiento",
  impuestos:         "Impuestos",
  honorarios:        "Honorarios",
  compra_mercancia:  "Compra de mercancia",
  otros:             "Otros",
};

export const ESTADOS_GASTO = ["borrador", "aprobado", "pagado"] as const;
export type EstadoGasto = (typeof ESTADOS_GASTO)[number];

export const gastos = pgTable("gastos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  proveedor_id: uuid("proveedor_id").references(() => proveedores.id),
  categoria: varchar("categoria", { length: 50 }).$type<CategoriaGasto>().notNull(),
  descripcion: varchar("descripcion", { length: 500 }).notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull(),
  iva: numeric("iva", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  fecha: date("fecha").notNull(),
  fecha_vencimiento: date("fecha_vencimiento"),  // para cuentas por pagar
  estado: varchar("estado", { length: 20 }).$type<EstadoGasto>().notNull().default("borrador"),
  pagado_at: timestamp("pagado_at", { withTimezone: true }),
  observaciones: text("observaciones"),
  centro_costo_id: uuid("centro_costo_id"),
  asiento_id: uuid("asiento_id"), // FK a asientos_contables generado al aprobar
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tracking de uso mensual del asistente IA por tenant
export const uso_ia = pgTable("uso_ia", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  tipo: varchar("tipo", { length: 50 }).notNull().default("analizar_documento"),
  tokens_entrada: integer("tokens_entrada"),
  tokens_salida: integer("tokens_salida"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Proveedor = typeof proveedores.$inferSelect;
export type Gasto = typeof gastos.$inferSelect;
export type NewGasto = typeof gastos.$inferInsert;
export type UsoIa = typeof uso_ia.$inferSelect;

