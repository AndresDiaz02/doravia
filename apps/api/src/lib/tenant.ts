import * as Sentry from "@sentry/node";
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

  if (featureRows.length > 0) {
    const featuresFromDb = Object.fromEntries(
      featureRows.map((r) => [r.feature_key, r.enabled]),
    ) as PlanFeatures;
    plan.features = featuresFromDb;
  } else {
    // Fallback al JSONB mientras plan_features se propaga (solo debería ocurrir en dev / primeros segundos del deploy).
    // TODO(2026-07): eliminar este fallback y la columna plans.features (~3 ramas, después de feat/accounting-hardening).
    // En prod: indica que la migración no corrió o el seed no se aplicó → alerta Sentry nivel warning.
    if (process.env.NODE_ENV === "production") {
      Sentry.captureMessage(
        `[tenant] plan_features vacío para tenant ${tenantId} (plan: ${plan.slug}); usando JSONB fallback — verificar migración`,
        "warning",
      );
    }
  }

  return { ...rows[0].tenants, plan };
}
