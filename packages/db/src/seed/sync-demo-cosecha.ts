/** Actualiza la empresa de revisión del contador al plan ERP máximo. */
import { and, eq } from "drizzle-orm";
import { db, plans, product_subscriptions, tenants } from "../index.js";

const DEMO_NIT = "901234570";

async function syncDemoCosecha() {
  const planSlugs = ["cosecha", "punto_plus", "origen_300", "nomina_pro"] as const;
  const foundPlans = await db.select({ id: plans.id, slug: plans.slug }).from(plans);
  const planBySlug = new Map(foundPlans.map((plan) => [plan.slug, plan]));
  const missing = planSlugs.filter((slug) => !planBySlug.has(slug));
  if (missing.length) throw new Error(`Faltan planes: ${missing.join(", ")}. Ejecuta primero el seed de planes.`);

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.nit, DEMO_NIT))
    .limit(1);
  if (!tenant) throw new Error("La empresa demo del contador no existe.");

  await db
    .update(tenants)
    .set({
      plan_id: planBySlug.get("cosecha")!.id,
      nombre: "Empresa Demo Contable Cosecha Pruebas SAS",
      activo: true,
      // Habilita el acceso de prueba a los productos contratados por separado.
      // La emisión electrónica real continúa protegida por la configuración DIAN.
      addons: { pos: true, pos_multi_caja: true },
      facturacion_electronica: true,
    })
    .where(and(eq(tenants.id, tenant.id), eq(tenants.nit, DEMO_NIT)));

  const startsAt = new Date("2026-01-01T00:00:00.000Z");
  const endsAt = new Date("2027-12-31T23:59:59.999Z");
  for (const [product, slug] of [["erp", "cosecha"], ["pos", "punto_plus"], ["facturacion", "origen_300"], ["nomina", "nomina_pro"]] as const) {
    await db.insert(product_subscriptions).values({
      tenant_id: tenant.id,
      product,
      plan_id: planBySlug.get(slug)!.id,
      status: "active",
      starts_at: startsAt,
      ends_at: endsAt,
    }).onConflictDoUpdate({
      target: [product_subscriptions.tenant_id, product_subscriptions.product],
      set: { plan_id: planBySlug.get(slug)!.id, status: "active", starts_at: startsAt, ends_at: endsAt, updated_at: new Date() },
    });
  }

  const subscriptions = await db
    .select({ product: product_subscriptions.product, slug: plans.slug, status: product_subscriptions.status })
    .from(product_subscriptions)
    .innerJoin(plans, eq(product_subscriptions.plan_id, plans.id))
    .where(eq(product_subscriptions.tenant_id, tenant.id));
  const enabled = subscriptions
    .filter((subscription) => subscription.status === "active")
    .map((subscription) => `${subscription.product}:${subscription.slug}`)
    .sort();
  if (enabled.length !== 4) throw new Error("No se pudieron verificar todas las suscripciones de prueba.");

  console.log(`Empresa demo verificada: ${enabled.join(" | ")}.`);
}

syncDemoCosecha()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
