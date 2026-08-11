import { db, plans, pool_documentos_nomina_tenant, product_subscriptions, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";

export type ProductCode = "erp" | "pos" | "facturacion" | "nomina";
export function productFromPlan(product: string): ProductCode { return product === "origen" ? "facturacion" : product as ProductCode; }

/** Activa o renueva un producto sin sustituir los demás productos del tenant. */
export async function activarSuscripcionProducto(tenantId: string, planSlug: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
  if (!plan) throw new Error("Plan no encontrado.");
  const product = productFromPlan(plan.product);
  const now = new Date(); const endsAt = new Date(now); endsAt.setFullYear(endsAt.getFullYear() + 1);
  await db.insert(product_subscriptions).values({ tenant_id: tenantId, product, plan_id: plan.id, status: "active", starts_at: now, ends_at: endsAt })
    .onConflictDoUpdate({ target: [product_subscriptions.tenant_id, product_subscriptions.product], set: { plan_id: plan.id, status: "active", starts_at: now, ends_at: endsAt, updated_at: now } });
  if (product === "pos" || product === "facturacion") {
    const [tenant] = await db.select({ addons: tenants.addons }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const addons = { ...((tenant?.addons ?? {}) as Record<string, boolean>) };
    if (product === "pos") addons.pos = true;
    await db.update(tenants).set({ addons, ...(product === "facturacion" ? { facturacion_electronica: true } : {}) }).where(eq(tenants.id, tenantId));
  }
  if (product === "nomina") {
    const documentosIncluidos = plan.document_limit ?? 999_999;
    await db.insert(pool_documentos_nomina_tenant).values({
      tenant_id: tenantId,
      plan_slug: plan.slug,
      documentos_incluidos: documentosIncluidos,
      fecha_renovacion: endsAt.toISOString().slice(0, 10),
      limite_acumulacion: documentosIncluidos * 2,
    }).onConflictDoUpdate({
      target: pool_documentos_nomina_tenant.tenant_id,
      set: {
        plan_slug: plan.slug,
        documentos_incluidos: documentosIncluidos,
        fecha_renovacion: endsAt.toISOString().slice(0, 10),
        limite_acumulacion: documentosIncluidos * 2,
        updated_at: now,
      },
    });
  }
  return { plan, product, startsAt: now, endsAt };
}
