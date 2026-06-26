import { db, tenants, plans } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Plan } from "@workspace/db";
import type { Tenant } from "@workspace/db";

export interface TenantWithPlan extends Tenant {
  plan: Plan;
}

export async function getTenantWithPlan(tenantId: string): Promise<TenantWithPlan> {
  const rows = await db
    .select()
    .from(tenants)
    .innerJoin(plans, eq(tenants.plan_id, plans.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!rows[0]) throw new Error(`Tenant no encontrado: ${tenantId}`);

  return { ...rows[0].tenants, plan: rows[0].plans };
}
