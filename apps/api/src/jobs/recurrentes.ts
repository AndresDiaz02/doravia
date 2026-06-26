import cron from "node-cron";
import { db, plantillas_factura, tenants, plans } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { crearFactura } from "../services/factura.service.js";
import type { PlantillaFactura } from "@workspace/db";
import type { TenantWithPlan } from "../lib/tenant.js";
import {
  DIAS_POR_FRECUENCIA,
  MESES_POR_FRECUENCIA,
  type Frecuencia,
} from "@workspace/db";

function calcularProximaEjecucion(fecha: string, frecuencia: Frecuencia): string {
  const d = new Date(fecha + "T12:00:00Z");
  const meses = MESES_POR_FRECUENCIA[frecuencia];

  if (meses != null) {
    d.setMonth(d.getMonth() + meses);
  } else {
    const dias = DIAS_POR_FRECUENCIA[frecuencia];
    if (dias != null) d.setDate(d.getDate() + dias);
  }

  return d.toISOString().split("T")[0];
}

export async function ejecutarPlantilla(
  plantilla: PlantillaFactura,
  tenant: TenantWithPlan,
): Promise<Awaited<ReturnType<typeof crearFactura>>> {
  const hoy = new Date();
  const fechaVencimiento = new Date(hoy);
  fechaVencimiento.setDate(fechaVencimiento.getDate() + plantilla.dias_vencimiento);

  const factura = await crearFactura(tenant, {
    cliente_id: plantilla.cliente_id,
    items: plantilla.items,
    fecha_vencimiento: fechaVencimiento.toISOString().split("T")[0],
    observaciones: plantilla.observaciones ?? undefined,
  });

  const proxima = calcularProximaEjecucion(
    plantilla.proxima_ejecucion,
    plantilla.frecuencia as Frecuencia,
  );

  await db
    .update(plantillas_factura)
    .set({
      ultima_ejecucion: hoy.toISOString().split("T")[0],
      proxima_ejecucion: proxima,
    })
    .where(eq(plantillas_factura.id, plantilla.id));

  return factura;
}

async function procesarPlantillasVencidas() {
  const hoy = new Date().toISOString().split("T")[0];

  const pendientes = await db
    .select({ plantilla: plantillas_factura, tenant: tenants, plan: plans })
    .from(plantillas_factura)
    .innerJoin(tenants, eq(plantillas_factura.tenant_id, tenants.id))
    .innerJoin(plans, eq(tenants.plan_id, plans.id))
    .where(
      and(
        eq(plantillas_factura.activo, true),
        lte(plantillas_factura.proxima_ejecucion, hoy),
        eq(tenants.activo, true),
      ),
    );

  for (const { plantilla, tenant, plan } of pendientes) {
    const tenantWithPlan: TenantWithPlan = { ...tenant, plan };
    try {
      await ejecutarPlantilla(plantilla, tenantWithPlan);
      console.log(`[recurrentes] Generada factura para plantilla ${plantilla.id} (${plantilla.nombre})`);
    } catch (err) {
      console.error(`[recurrentes] Error en plantilla ${plantilla.id}:`, err);
    }
  }
}

// Se ejecuta todos los días a las 06:00 (hora del servidor)
export function iniciarCronRecurrentes() {
  cron.schedule("0 6 * * *", () => {
    void procesarPlantillasVencidas();
  });
  console.log("[recurrentes] Cron job programado — 06:00 diario");
}
