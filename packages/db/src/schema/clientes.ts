import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const TIPOS_DOCUMENTO = ["CC", "NIT", "CE", "PPN", "TI"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const TIPOS_PERSONA = ["natural", "juridica"] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];

export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  tipo_persona: varchar("tipo_persona", { length: 20 }).$type<TipoPersona>().notNull(),
  tipo_documento: varchar("tipo_documento", { length: 10 }).$type<TipoDocumento>().notNull(),
  numero_documento: varchar("numero_documento", { length: 20 }).notNull(),
  digito_verificacion: varchar("digito_verificacion", { length: 1 }), // solo NIT
  nombre: varchar("nombre", { length: 300 }).notNull(),
  correo: varchar("correo", { length: 200 }),
  telefono: varchar("telefono", { length: 20 }),
  direccion: varchar("direccion", { length: 300 }),
  municipio: varchar("municipio", { length: 100 }),
  departamento: varchar("departamento", { length: 100 }),
  activo: boolean("activo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Cliente = typeof clientes.$inferSelect;
export type NewCliente = typeof clientes.$inferInsert;

