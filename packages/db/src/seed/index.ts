import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { plans, cuentas_contables } from "../schema/index.js";
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
        max_usuarios: sql`excluded.max_usuarios`,
        max_bodegas: sql`excluded.max_bodegas`,
        max_facturas_mes: sql`excluded.max_facturas_mes`,
        max_facturas_ano: sql`excluded.max_facturas_ano`,
        max_ia_docs_mes: sql`excluded.max_ia_docs_mes`,
        accounting_level: sql`excluded.accounting_level`,
        features: sql`excluded.features`,
        precio_anual_cop: sql`excluded.precio_anual_cop`,
      },
    });
  console.log("✓ Planes:", PLAN_SEEDS.map((p) => p.slug).join(", "));

  console.log("Sembrando PUC base...");
  await db
    .insert(cuentas_contables)
    .values(PUC_BASE.map((c) => ({ ...c, tenant_id: null })))
    .onConflictDoNothing(); // idempotente por código
  console.log(`✓ PUC: ${PUC_BASE.length} cuentas`);

  console.log("Sembrando demo...");
  await seedDemo();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
