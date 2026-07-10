import { pgTable, uuid, varchar, boolean, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { plans } from "./plans.ts";

export const plan_features = pgTable("plan_features", {
  id: uuid("id").primaryKey().defaultRandom(),
  plan_id: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  feature_key: varchar("feature_key", { length: 50 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  limit_value: integer("limit_value"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq_plan_feature: unique("uq_plan_feature").on(t.plan_id, t.feature_key),
}));

export type PlanFeatureRow = typeof plan_features.$inferSelect;
export type NewPlanFeatureRow = typeof plan_features.$inferInsert;
