import { db, tenants, plans, plan_features } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Plan } from "@workspace/db";
import type { Tenant } from "@workspace/db";
import type { PlanFeatures } from "@workspace/shared";

export interface TenantWithPlan extends Tenant {
  plan: Plan;
}

export async function getTenantWithPlan(tenantId: string): Promise<TenantWithPlan> {
  const [rows, featureRows] = await Promise.all([
    db
      .select()
      .from(tenants)
      .innerJoin(plans, eq(tenants.plan_id, plans.id))
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db
      .select({ feature_key: plan_features.feature_key, enabled: plan_features.enabled })
      .from(plan_features)
      .innerJoin(plans, eq(plan_features.plan_id, plans.id))
      .innerJoin(tenants, eq(tenants.plan_id, plans.id))
      .where(eq(tenants.id, tenantId)),
  ]);

  if (!rows[0]) throw new Error(`Tenant no encontrado: ${tenantId}`);

  const plan = rows[0].plans;

  // Si plan_features tiene filas, usarlas como fuente de verdad; si no, usar JSONB
  if (featureRows.length > 0) {
    const featuresFromDb = Object.fromEntries(
      featureRows.map((r) => [r.feature_key, r.enabled]),
    ) as PlanFeatures;
    plan.features = featuresFromDb;
  }

  return { ...rows[0].tenants, plan };
}
