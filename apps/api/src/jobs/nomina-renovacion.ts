import cron from "node-cron";
import { db, pool_documentos_nomina_tenant, product_subscriptions } from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";

/**
 * Renovación de ciclo de pools de nómina (Fase 10, regla de negocio #3):
 * los documentos no usados se acumulan hasta un máximo de 2x el plan (limite_acumulacion),
 * el consumo del ciclo se reinicia, y la fecha de renovación avanza un año — los planes de
 * nómina se venden como cupo anual ("Docs/año" en el documento de la fase).
 *
 * La renovación es obligatoria aunque queden documentos acumulados sin usar (regla #4):
 * este job corre siempre para todo pool vencido, sin excepción ni confirmación manual.
 */
export async function procesarRenovacionesNomina(): Promise<{ procesados: number }> {
  const hoy = new Date().toISOString().slice(0, 10);

  const vencidos = await db
    .select({ pool: pool_documentos_nomina_tenant })
    .from(pool_documentos_nomina_tenant)
    .innerJoin(product_subscriptions, and(
      eq(product_subscriptions.tenant_id, pool_documentos_nomina_tenant.tenant_id),
      eq(product_subscriptions.product, "nomina"),
    ))
    .where(and(
      lte(pool_documentos_nomina_tenant.fecha_renovacion, hoy),
      eq(product_subscriptions.status, "active"),
      gte(product_subscriptions.ends_at, new Date()),
    ));

  for (const { pool } of vencidos) {
    const noUsados = Math.max(0, pool.documentos_incluidos - pool.documentos_consumidos_ciclo);
    const acumuladosNuevos = Math.min(pool.documentos_acumulados_previos + noUsados, pool.limite_acumulacion);

    const proximaRenovacion = new Date(pool.fecha_renovacion);
    proximaRenovacion.setFullYear(proximaRenovacion.getFullYear() + 1);

    await db.update(pool_documentos_nomina_tenant)
      .set({
        documentos_acumulados_previos: acumuladosNuevos,
        documentos_consumidos_ciclo: 0,
        documentos_adicionales_comprados: 0,
        fecha_renovacion: proximaRenovacion.toISOString().slice(0, 10),
        updated_at: new Date(),
      })
      .where(eq(pool_documentos_nomina_tenant.tenant_id, pool.tenant_id));

    console.log(`[nomina-renovacion] Tenant ${pool.tenant_id}: acumulados ${pool.documentos_acumulados_previos} → ${acumuladosNuevos}, próxima renovación ${proximaRenovacion.toISOString().slice(0, 10)}`);
  }

  return { procesados: vencidos.length };
}

export function iniciarCronRenovacionNomina() {
  cron.schedule("0 5 * * *", () => {
    void procesarRenovacionesNomina().catch((err) => console.error("[nomina-renovacion] Error:", err));
  });
  console.log("[nomina-renovacion] Cron job programado — diariamente 05:00");
}
