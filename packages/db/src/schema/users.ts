import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
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
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

