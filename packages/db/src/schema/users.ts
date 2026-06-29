import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";

export const USER_ROLES = ["admin", "contador", "vendedor", "operario"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  email: varchar("email", { length: 200 }).unique().notNull(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  role: varchar("role", { length: 50 }).$type<UserRole>().notNull().default("operario"),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  activo: boolean("activo").notNull().default(true),
  permisos_contables: boolean("permisos_contables").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Accesos adicionales: un usuario puede ser vinculado a múltiples empresas
// (ej. un contador externo gestionando varias empresas cliente)
export const user_accesos = pgTable(
  "user_accesos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tenant_id: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).$type<UserRole>().notNull().default("contador"),
    invitado_por: uuid("invitado_por").references(() => users.id),
    permisos_contables: boolean("permisos_contables").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqUserTenant: uniqueIndex("user_accesos_user_tenant_idx").on(t.user_id, t.tenant_id),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserAcceso = typeof user_accesos.$inferSelect;
