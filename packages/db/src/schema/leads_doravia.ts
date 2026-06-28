import { pgTable, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";

export const ETAPAS_LEAD = ["prospecto", "interesado", "demo_agendada", "propuesta", "convertido", "perdido"] as const;
export type EtapaLead = (typeof ETAPAS_LEAD)[number];

export const FUENTES_LEAD = ["instagram", "linkedin", "google", "referido_contador", "referido_cliente", "whatsapp", "directo", "otro"] as const;
export type FuenteLead = (typeof FUENTES_LEAD)[number];

export const leads_doravia = pgTable("leads_doravia", {
  id: uuid("id").primaryKey().defaultRandom(),
  empresa: varchar("empresa", { length: 200 }).notNull(),
  contacto: varchar("contacto", { length: 200 }),
  email: varchar("email", { length: 200 }),
  telefono: varchar("telefono", { length: 30 }),
  fuente: varchar("fuente", { length: 50 }).$type<FuenteLead>(),
  etapa: varchar("etapa", { length: 30 }).$type<EtapaLead>().notNull().default("prospecto"),
  valor_potencial_cop: integer("valor_potencial_cop"),
  notas: text("notas"),
  responsable: varchar("responsable", { length: 100 }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadDoravia = typeof leads_doravia.$inferSelect;
export type NewLeadDoravia = typeof leads_doravia.$inferInsert;
