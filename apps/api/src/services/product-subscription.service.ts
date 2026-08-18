import { db, plans, pool_documentos_nomina_tenant, product_subscriptions, tenants } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type ProductCode = "erp" | "pos" | "facturacion" | "nomina";
export function productFromPlan(product: string): ProductCode { return product === "origen" ? "facturacion" : product as ProductCode; }

/** Productos que quedan cubiertos por el plan principal, sin una compra duplicada. */
export function productosIncluidosPorPlan(product: string, features: Record<string, boolean>): ProductCode[] {
  if (product !== "erp") return [];
  return features.facturacion_ilimitada ? ["facturacion"] : [];
}

/**
 * Evita cobrar o mostrar dos veces un producto que el plan ERP ya incluye.
 * La suscripciÃ³n independiente queda cancelada para conservar el historial;
 * el acceso continÃºa por la funcionalidad incluida en el ERP.
 */
async function desactivarProductosIncluidosEnERP(tenantId: string, plan: typeof plans.$inferSelect, now: Date) {
  const features = plan.features as Record<string, boolean>;
  const incluidos = productosIncluidosPorPlan(plan.product, features);

  for (const product of incluidos) {
    await db.update(product_subscriptions)
      .set({ status: "cancelled", updated_at: now })
      .where(and(
        eq(product_subscriptions.tenant_id, tenantId),
        eq(product_subscriptions.product, product),
        eq(product_subscriptions.status, "active"),
      ));
  }
  return incluidos;
}

/** Activa o renueva un producto sin sustituir los demás productos del tenant. */
export async function activarSuscripcionProducto(tenantId: string, planSlug: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
  if (!plan) throw new Error("Plan no encontrado.");
  const product = productFromPlan(plan.product);
  const now = new Date(); const endsAt = new Date(now); endsAt.setFullYear(endsAt.getFullYear() + 1);
  await db.insert(product_subscriptions).values({ tenant_id: tenantId, product, plan_id: plan.id, status: "active", starts_at: now, ends_at: endsAt })
    .onConflictDoUpdate({ target: [product_subscriptions.tenant_id, product_subscriptions.product], set: { plan_id: plan.id, status: "active", starts_at: now, ends_at: endsAt, updated_at: now } });
  const productosSustituidos = await desactivarProductosIncluidosEnERP(tenantId, plan, now);
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
  return { plan, product, startsAt: now, endsAt, productosSustituidos };
}
