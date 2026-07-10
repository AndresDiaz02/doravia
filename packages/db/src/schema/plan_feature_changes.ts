import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { plans } from "./plans.ts";

export const plan_feature_changes = pgTable("plan_feature_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  plan_id: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  feature_key: varchar("feature_key", { length: 50 }).notNull(),
  old_value: boolean("old_value"),
  new_value: boolean("new_value").notNull(),
  changed_by: varchar("changed_by", { length: 200 }).notNull(),
  changed_at: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlanFeatureChange = typeof plan_feature_changes.$inferSelect;
export type NewPlanFeatureChange = typeof plan_feature_changes.$inferInsert;
