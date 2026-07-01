import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.ts";

export const contador_registrations = pgTable("contador_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  email: varchar("email", { length: 200 }).unique().notNull(),
  celular: varchar("celular", { length: 20 }),
  firma_contable: varchar("firma_contable", { length: 200 }),
  // token para confirmar el correo
  token_confirmacion: varchar("token_confirmacion", { length: 100 }).unique().notNull(),
  confirmado: boolean("confirmado").notNull().default(false),
  // una vez confirmado, se crea el usuario en el hub y se vincula aquí
  user_id: uuid("user_id").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmado_at: timestamp("confirmado_at", { withTimezone: true }),
});

export type ContadorRegistration = typeof contador_registrations.$inferSelect;
export type NewContadorRegistration = typeof contador_registrations.$inferInsert;
