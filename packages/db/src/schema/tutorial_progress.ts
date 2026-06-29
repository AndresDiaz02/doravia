import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { tenants } from "./tenants.ts";

export const tutorial_progress = pgTable("tutorial_progress", {
  id:          uuid("id").primaryKey().defaultRandom(),
  user_id:     uuid("user_id").notNull().references(() => users.id),
  tenant_id:   uuid("tenant_id").notNull().references(() => tenants.id),
  slug:        varchar("slug", { length: 64 }).notNull(),
  completado_at: timestamp("completado_at", { withTimezone: true }),
  saltado_at:  timestamp("saltado_at", { withTimezone: true }),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TutorialProgress = typeof tutorial_progress.$inferSelect;
