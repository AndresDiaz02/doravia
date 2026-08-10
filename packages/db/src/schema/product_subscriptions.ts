import { pgTable, uuid, varchar, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.ts";
import { plans } from "./plans.ts";

/** Suscripción independiente por producto, combinable en una misma empresa. */
export const product_subscriptions = pgTable("product_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  product: varchar("product", { length: 20 }).notNull(),
  plan_id: uuid("plan_id").notNull().references(() => plans.id),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  starts_at: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("product_subscriptions_tenant_product_unique").on(table.tenant_id, table.product),
]);

export type ProductSubscription = typeof product_subscriptions.$inferSelect;
