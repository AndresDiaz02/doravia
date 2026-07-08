/**
 * Seed de producción — datos estructurales (planes + PUC base + hub de contadores).
 * Seguro para correr en Railway en cada deploy.
 * NO toca tenants de clientes ni usuarios de clientes.
 */
import { sql, eq } from "drizzle-orm";
import { db } from "../client.js";
import { plans, cuentas_contables, tenants } from "../schema/index.js";
import { PLAN_SEEDS } from "./plans.js";
import { PUC_BASE } from "./cuentas_puc.js";

async function seedProd() {
  console.log("Sembrando planes...");
  await db
    .insert(plans)
    .values(PLAN_SEEDS)
    .onConflictDoUpdate({
      target: plans.slug,
      set: {
        nombre:            sql`excluded.nombre`,
        max_usuarios:      sql`excluded.max_usuarios`,
        max_bodegas:       sql`excluded.max_bodegas`,
        max_facturas_mes:  sql`excluded.max_facturas_mes`,
        max_facturas_ano:  sql`excluded.max_facturas_ano`,
        max_ia_docs_mes:   sql`excluded.max_ia_docs_mes`,
        accounting_level:  sql`excluded.accounting_level`,
        features:          sql`excluded.features`,
        precio_anual_cop:  sql`excluded.precio_anual_cop`,
      },
    });
  console.log("✓ Planes:", PLAN_SEEDS.map((p) => p.slug).join(", "));

  console.log("Sembrando PUC base...");
  await db
    .insert(cuentas_contables)
    .values(PUC_BASE.map((c) => ({ ...c, tenant_id: null })))
    .onConflictDoNothing();
  console.log(`✓ PUC: ${PUC_BASE.length} cuentas base`);

  console.log("Creando hub de contadores...");
  const [cosechaPlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.slug, "cosecha"))
    .limit(1);

  if (cosechaPlan) {
    await db
      .insert(tenants)
      .values({
        nit: "0000000001",
        nombre: "Hub Contadores Doravia",
        plan_id: cosechaPlan.id,
        activo: true,
        plan_starts_at: new Date("2024-01-01"),
        plan_ends_at: new Date("2099-12-31"),
        onboarding_completado: true,
      })
      .onConflictDoNothing();
    console.log("✓ Hub de contadores: NIT 0000000001");
  } else {
    console.warn("⚠ Plan 'cosecha' no encontrado — hub de contadores no creado.");
  }

  console.log("✓ Seed de producción completado.");
}

seedProd()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Error en seed:prod:", err);
    process.exit(1);
  });
