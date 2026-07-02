import { pgTable, uuid, varchar, boolean, timestamp, text, jsonb, integer } from "drizzle-orm/pg-core";
import { plans } from "./plans.ts";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  nit: varchar("nit", { length: 20 }).unique().notNull(),
  plan_id: uuid("plan_id").notNull().references(() => plans.id),
  plan_starts_at: timestamp("plan_starts_at", { withTimezone: true }).notNull(),
  plan_ends_at: timestamp("plan_ends_at", { withTimezone: true }).notNull(),
  activo: boolean("activo").notNull().default(true),
  // ── Datos fiscales y de contacto ──────────────────────────────────────────
  direccion: varchar("direccion", { length: 300 }),
  ciudad: varchar("ciudad", { length: 100 }),
  telefono: varchar("telefono", { length: 30 }),
  correo: varchar("correo", { length: 200 }),
  sitio_web: varchar("sitio_web", { length: 200 }),
  regimen: varchar("regimen", { length: 50 }).default("comun"),
  representante_legal: varchar("representante_legal", { length: 200 }),
  actividad_economica: varchar("actividad_economica", { length: 10 }),
  logo_base64: text("logo_base64"),
  pie_factura: varchar("pie_factura", { length: 500 }),
  // Features adicionales habilitadas sobre el plan base (add-ons)
  addons: jsonb("addons").$type<Partial<Record<string, boolean>>>().default({}),
  onboarding_completado: boolean("onboarding_completado").notNull().default(false),
  // ── Métricas de adquisición para el panel fundadores ─────────────────────
  fuente_adquisicion: varchar("fuente_adquisicion", { length: 50 }),
  cac_cop: integer("cac_cop"),
  ultimo_pago_confirmado_at: timestamp("ultimo_pago_confirmado_at", { withTimezone: true }),
  // ── Facturación electrónica (DIAN) ───────────────────────────────────────
  facturacion_electronica: boolean("facturacion_electronica").notNull().default(false),
  // ── Configuración de módulos del POS ─────────────────────────────────────
  pos_config: jsonb("pos_config").$type<{
    cartera_visible?: boolean;
    citas_visible?: boolean;
    fe_deshabilitada_en?: string;
  }>().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

