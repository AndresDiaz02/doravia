import { pgTable, uuid, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { tenants } from "./tenants.ts";

export const refresh_tokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id),
  token_hash: varchar("token_hash", { length: 64 }).unique(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("refresh_tokens_user_idx").on(t.user_id),
  index("refresh_tokens_tenant_idx").on(t.tenant_id),
]);

export type RefreshToken = typeof refresh_tokens.$inferSelect;

