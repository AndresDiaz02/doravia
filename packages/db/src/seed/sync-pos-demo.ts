/**
 * Completa los recursos POS de la empresa demostrativa del contador.
 * Es idempotente: puede ejecutarse sin crear cajas duplicadas.
 */
import { and, eq } from "drizzle-orm";
import { cajas_pos, db, tenants } from "../index.js";

const DEMO_NIT = "901234570";
const CAJA_NOMBRE = "Caja Principal de Pruebas";

async function syncPosDemo() {
  const [tenant] = await db
    .select({ id: tenants.id, nombre: tenants.nombre })
    .from(tenants)
    .where(eq(tenants.nit, DEMO_NIT))
    .limit(1);

  if (!tenant) throw new Error("La empresa demo del contador no existe.");

  const [existing] = await db
    .select({ id: cajas_pos.id })
    .from(cajas_pos)
    .where(and(eq(cajas_pos.tenant_id, tenant.id), eq(cajas_pos.nombre, CAJA_NOMBRE)))
    .limit(1);

  if (existing) {
    console.log(`Caja POS ya disponible: ${CAJA_NOMBRE}`);
    return;
  }

  await db.insert(cajas_pos).values({
    tenant_id: tenant.id,
    nombre: CAJA_NOMBRE,
    descripcion: "Caja POS de la empresa demo; asociada a la Bodega Principal.",
    activo: true,
  });
  console.log(`Caja POS creada para ${tenant.nombre}: ${CAJA_NOMBRE}`);
}

syncPosDemo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
