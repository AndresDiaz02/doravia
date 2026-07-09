import cron from "node-cron";
import { db, tenants, consumo_dian_mensual } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Guarda el historial del mes anterior y resetea el contador mensual de facturas DIAN.
 * Se ejecuta el día 1 de cada mes a las 00:05 UTC.
 */
export async function resetConsumoDian() {
  const ahora = new Date();
  const ano = ahora.getFullYear();
  const mes = ahora.getMonth() + 1; // 1-12

  // Calcula el mes anterior para el historial
  const mesPasado = mes === 1 ? 12 : mes - 1;
  const anoPasado = mes === 1 ? ano - 1 : ano;

  // Guarda el historial del mes anterior antes de resetear
  await db.execute(sql`
    INSERT INTO consumo_dian_mensual (tenant_id, ano, mes, cantidad)
    SELECT id, ${anoPasado}, ${mesPasado}, facturas_mes_actual
    FROM tenants
    WHERE facturas_mes_actual > 0
    ON CONFLICT (tenant_id, ano, mes) DO UPDATE SET cantidad = EXCLUDED.cantidad
  `);

  await db.execute(sql`UPDATE tenants SET facturas_mes_actual = 0`);
  console.log(`[cron] consumo DIAN reseteado — ${anoPasado}-${String(mesPasado).padStart(2, "0")}`);
}

export function iniciarCronResetConsumoDian() {
  // Día 1 de cada mes a las 00:05 UTC
  cron.schedule("5 0 1 * *", () => {
    resetConsumoDian().catch((e) => console.error("[cron] Error en resetConsumoDian:", e));
  });
  console.log("[cron] Reset consumo DIAN registrado (0 5 1 * *)");
}

// Re-export para mantener la referencia a consumo_dian_mensual activa (evita unused import drift)
void consumo_dian_mensual;
