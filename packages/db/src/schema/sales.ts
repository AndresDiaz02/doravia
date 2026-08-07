import { pgTable, uuid, varchar, text, integer, numeric, timestamp, date, jsonb, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { users } from "./users.ts";
import { plans } from "./plans.ts";

export const SALES_ACCOUNT_TYPES = ["prospect", "customer", "former_customer", "partner"] as const;
export const SALES_ACCOUNT_SIZES = ["micro", "pequena", "mediana", "estrategica"] as const;
export const SALES_STAGES = ["new_lead", "contacted", "qualified", "discovery", "demo_scheduled", "demo_completed", "quote_sent", "negotiation", "payment_pending", "won", "lost"] as const;
export const SALES_ACTIVITY_TYPES = ["call", "whatsapp", "email", "demo", "meeting", "follow_up", "task", "note"] as const;
export const SALES_ACTIVITY_STATUSES = ["pending", "completed", "cancelled"] as const;
export const SALES_QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "rejected", "expired", "payment_pending", "paid", "cancelled"] as const;

export const sales_accounts = pgTable("sales_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").references(() => tenants.id),
  tipo: varchar("tipo", { length: 30 }).$type<(typeof SALES_ACCOUNT_TYPES)[number]>().notNull().default("prospect"),
  nombre_comercial: varchar("nombre_comercial", { length: 200 }).notNull(),
  razon_social: varchar("razon_social", { length: 200 }), nit: varchar("nit", { length: 20 }), dv: varchar("dv", { length: 2 }),
  ciudad: varchar("ciudad", { length: 100 }), departamento: varchar("departamento", { length: 100 }), direccion: varchar("direccion", { length: 300 }), sitio_web: varchar("sitio_web", { length: 200 }), industria: varchar("industria", { length: 100 }),
  numero_empleados: integer("numero_empleados"), numero_sedes: integer("numero_sedes"), tamano: varchar("tamano", { length: 30 }).$type<(typeof SALES_ACCOUNT_SIZES)[number]>(),
  fuente_lead: varchar("fuente_lead", { length: 50 }), owner_id: uuid("owner_id").references(() => users.id),
  current_acv: numeric("current_acv", { precision: 14, scale: 2 }).notNull().default("0"), potential_acv: numeric("potential_acv", { precision: 14, scale: 2 }).notNull().default("0"), expansion_acv: numeric("expansion_acv", { precision: 14, scale: 2 }).notNull().default("0"),
  notas: text("notas"), tags: jsonb("tags").$type<string[]>().notNull().default([]), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sales_contacts = pgTable("sales_contacts", {
  id: uuid("id").primaryKey().defaultRandom(), account_id: uuid("account_id").notNull().references(() => sales_accounts.id, { onDelete: "cascade" }),
  nombres: varchar("nombres", { length: 150 }).notNull(), apellidos: varchar("apellidos", { length: 150 }), cargo: varchar("cargo", { length: 100 }), telefono: varchar("telefono", { length: 30 }), whatsapp: varchar("whatsapp", { length: 30 }), email: varchar("email", { length: 200 }),
  es_principal: boolean("es_principal").notNull().default(false), es_decisor: boolean("es_decisor").notNull().default(false), es_influenciador: boolean("es_influenciador").notNull().default(false), canal_preferido: varchar("canal_preferido", { length: 30 }), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sales_opportunities = pgTable("sales_opportunities", {
  id: uuid("id").primaryKey().defaultRandom(), account_id: uuid("account_id").notNull().references(() => sales_accounts.id), contact_id: uuid("contact_id").references(() => sales_contacts.id), owner_id: uuid("owner_id").references(() => users.id),
  nombre: varchar("nombre", { length: 200 }).notNull(), etapa: varchar("etapa", { length: 30 }).$type<(typeof SALES_STAGES)[number]>().notNull().default("new_lead"), fuente: varchar("fuente", { length: 50 }),
  expected_acv: numeric("expected_acv", { precision: 14, scale: 2 }).notNull().default("0"), potential_acv: numeric("potential_acv", { precision: 14, scale: 2 }).notNull().default("0"), probability: integer("probability").notNull().default(10), forecast_category: varchar("forecast_category", { length: 20 }).notNull().default("pipeline"), expected_close_date: date("expected_close_date"), competitor: varchar("competitor", { length: 200 }), loss_reason: varchar("loss_reason", { length: 100 }), notes: text("notes"), discovery: jsonb("discovery").$type<Record<string, unknown>>().notNull().default({}), next_activity_at: timestamp("next_activity_at", { withTimezone: true }), won_at: timestamp("won_at", { withTimezone: true }), lost_at: timestamp("lost_at", { withTimezone: true }), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sales_activities = pgTable("sales_activities", {
  id: uuid("id").primaryKey().defaultRandom(), opportunity_id: uuid("opportunity_id").references(() => sales_opportunities.id, { onDelete: "cascade" }), account_id: uuid("account_id").references(() => sales_accounts.id, { onDelete: "cascade" }), contact_id: uuid("contact_id").references(() => sales_contacts.id), owner_id: uuid("owner_id").references(() => users.id),
  tipo: varchar("tipo", { length: 30 }).$type<(typeof SALES_ACTIVITY_TYPES)[number]>().notNull(), estado: varchar("estado", { length: 20 }).$type<(typeof SALES_ACTIVITY_STATUSES)[number]>().notNull().default("pending"), scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(), completed_at: timestamp("completed_at", { withTimezone: true }), notas: text("notas"), resultado: text("resultado"), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sales_timeline_events = pgTable("sales_timeline_events", {
  id: uuid("id").primaryKey().defaultRandom(), account_id: uuid("account_id").notNull().references(() => sales_accounts.id, { onDelete: "cascade" }), opportunity_id: uuid("opportunity_id").references(() => sales_opportunities.id, { onDelete: "cascade" }), actor_id: uuid("actor_id").references(() => users.id), tipo: varchar("tipo", { length: 80 }).notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cotizaciones comerciales internas de Doravia. No se mezclan con las cotizaciones
// operativas que cada tenant crea para sus propios clientes.
export const sales_quotes = pgTable("sales_quotes", {
  id: uuid("id").primaryKey().defaultRandom(), quote_number: varchar("quote_number", { length: 40 }).notNull().unique(),
  account_id: uuid("account_id").notNull().references(() => sales_accounts.id), contact_id: uuid("contact_id").references(() => sales_contacts.id), opportunity_id: uuid("opportunity_id").references(() => sales_opportunities.id), seller_id: uuid("seller_id").references(() => users.id),
  currency: varchar("currency", { length: 3 }).notNull().default("COP"), subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"), discount_total: numeric("discount_total", { precision: 14, scale: 2 }).notNull().default("0"), tax_total: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"), total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"), acv: numeric("acv", { precision: 14, scale: 2 }).notNull().default("0"),
  valid_until: date("valid_until"), status: varchar("status", { length: 30 }).$type<(typeof SALES_QUOTE_STATUSES)[number]>().notNull().default("draft"), payment_option: varchar("payment_option", { length: 20 }).notNull().default("full"), installments: integer("installments").notNull().default(1), terms: text("terms"), notes: text("notes"), public_token: varchar("public_token", { length: 96 }).notNull().unique(), version: integer("version").notNull().default(1),
  sent_at: timestamp("sent_at", { withTimezone: true }), viewed_at: timestamp("viewed_at", { withTimezone: true }), view_count: integer("view_count").notNull().default(0), accepted_at: timestamp("accepted_at", { withTimezone: true }), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sales_quote_line_items = pgTable("sales_quote_line_items", {
  id: uuid("id").primaryKey().defaultRandom(), quote_id: uuid("quote_id").notNull().references(() => sales_quotes.id, { onDelete: "cascade" }), plan_id: uuid("plan_id").references(() => plans.id),
  kind: varchar("kind", { length: 30 }).notNull().default("plan"), description: varchar("description", { length: 300 }).notNull(), quantity: integer("quantity").notNull().default(1), unit_price: numeric("unit_price", { precision: 14, scale: 2 }).notNull(), discount_pct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"), line_total: numeric("line_total", { precision: 14, scale: 2 }).notNull(), billing_period: varchar("billing_period", { length: 30 }).notNull().default("annual"), created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
