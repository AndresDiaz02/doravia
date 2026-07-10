import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { plans, plan_features, cuentas_contables } from "../schema/index.js";
import { PLAN_SEEDS } from "./plans.js";
import { PUC_BASE } from "./cuentas_puc.js";
import { seedDemo } from "./demo.js";

async function seed() {
  console.log("Sembrando planes...");
  await db
    .insert(plans)
    .values(PLAN_SEEDS)
    .onConflictDoUpdate({
      target: plans.slug,
      set: {
        nombre: sql`excluded.nombre`,
        product: sql`excluded.product`,
        max_usuarios: sql`excluded.max_usuarios`,
        max_bodegas: sql`excluded.max_bodegas`,
        max_facturas_mes: sql`excluded.max_facturas_mes`,
        max_facturas_ano: sql`excluded.max_facturas_ano`,
        max_ia_docs_mes: sql`excluded.max_ia_docs_mes`,
        accounting_level: sql`excluded.accounting_level`,
        features: sql`excluded.features`,
        precio_anual_cop: sql`excluded.precio_anual_cop`,
        precio_mensual_cop: sql`excluded.precio_mensual_cop`,
        precio_3cuotas_total_cop: sql`excluded.precio_3cuotas_total_cop`,
      },
    });
  console.log("✓ Planes:", PLAN_SEEDS.map((p) => p.slug).join(", "));

  // Sincronizar plan_features desde el JSONB de cada plan
  console.log("Sembrando plan_features...");
  const allPlans = await db.select().from(plans);
  const featureRows: (typeof plan_features.$inferInsert)[] = [];
  for (const plan of allPlans) {
    const features = plan.features as Record<string, boolean>;
    for (const [key, enabled] of Object.entries(features)) {
      featureRows.push({ plan_id: plan.id, feature_key: key, enabled });
    }
  }
  if (featureRows.length > 0) {
    await db
      .insert(plan_features)
      .values(featureRows)
      .onConflictDoUpdate({
        target: [plan_features.plan_id, plan_features.feature_key],
        set: { enabled: sql`excluded.enabled`, updated_at: sql`now()` },
      });
  }
  console.log(`✓ plan_features: ${featureRows.length} filas`);

  console.log("Sembrando PUC base...");
  await db
    .insert(cuentas_contables)
    .values(PUC_BASE.map((c) => ({ ...c, tenant_id: null })))
    .onConflictDoNothing(); // idempotente por código
  console.log(`✓ PUC: ${PUC_BASE.length} cuentas`);

  if (process.env.SEED_DEMO === "true") {
    console.log("Sembrando demo...");
    await seedDemo();
  } else {
    console.log("ℹ️  SEED_DEMO != 'true' — datos de simulación omitidos (seguro en producción).");
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
