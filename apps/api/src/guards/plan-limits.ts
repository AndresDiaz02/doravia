import { db, users, bodegas, facturas, uso_ia } from "@workspace/db";
import { eq, and, count, gte, lt } from "drizzle-orm";
import { PlanLimitError } from "@workspace/shared";
import type { TenantWithPlan } from "../lib/tenant.js";

export async function assertCanUseIA(tenant: TenantWithPlan): Promise<void> {
  const { max_ia_docs_mes } = tenant.plan;
  if (max_ia_docs_mes === null) return; // ilimitado (Cosecha)
  if (max_ia_docs_mes === 0) {
    throw new PlanLimitError(
      `Tu plan (${tenant.plan.nombre}) no incluye el Asistente con IA. Actualiza a Semilla o superior.`
    );
  }

  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const inicioSiguiente = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

  const [{ value }] = await db
    .select({ value: count() })
    .from(uso_ia)
    .where(
      and(
        eq(uso_ia.tenant_id, tenant.id),
        gte(uso_ia.created_at, inicioMes),
        lt(uso_ia.created_at, inicioSiguiente),
      )
    );

  if (value >= max_ia_docs_mes) {
    throw new PlanLimitError(
      `Has usado los ${max_ia_docs_mes} análisis con IA disponibles este mes en tu plan (${tenant.plan.nombre}).`
    );
  }
}

/**
 * Mecanismo 2 — guards de límites numéricos.
 *
 * Se llaman desde la capa de servicio ANTES de ejecutar el INSERT,
 * no desde el middleware de rutas. Esto garantiza que el límite se
 * cheque incluso en procesos en background (ej. importación masiva).
 *
 * Uso:
 *   await assertCanAddUsuario(tenant);
 *   await db.insert(users).values(nuevoUsuario);
 */

export async function assertCanAddUsuario(tenant: TenantWithPlan): Promise<void> {
  const { max_usuarios } = tenant.plan;
  if (max_usuarios === null) return; // ilimitado

  const [{ value }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.tenant_id, tenant.id), eq(users.activo, true)));

  if (value >= max_usuarios) {
    throw new PlanLimitError(
      `Tu plan (${tenant.plan.nombre}) permite hasta ${max_usuarios} usuario(s) activo(s). ` +
        `Desactiva un usuario existente o actualiza tu plan para agregar más.`
    );
  }
}

export async function assertCanAddBodega(tenant: TenantWithPlan): Promise<void> {
  const { max_bodegas } = tenant.plan;

  if (max_bodegas === 0) {
    throw new PlanLimitError(
      `Tu plan (${tenant.plan.nombre}) no incluye el módulo de inventario. ` +
        `Actualiza a Raíz o superior para gestionar bodegas.`
    );
  }

  if (max_bodegas === null) return; // ilimitado

  const [{ value }] = await db
    .select({ value: count() })
    .from(bodegas)
    .where(and(eq(bodegas.tenant_id, tenant.id), eq(bodegas.activo, true)));

  if (value >= max_bodegas) {
    throw new PlanLimitError(
      `Tu plan (${tenant.plan.nombre}) permite hasta ${max_bodegas} bodega(s). ` +
        `Actualiza tu plan para agregar más.`
    );
  }
}

export async function assertCanEmitirFactura(tenant: TenantWithPlan): Promise<void> {
  const { max_facturas_mes, max_facturas_ano } = tenant.plan;

  // Límite mensual (Semilla: 50/mes)
  if (max_facturas_mes !== null) {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioSiguiente = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

    const [{ value }] = await db
      .select({ value: count() })
      .from(facturas)
      .where(
        and(
          eq(facturas.tenant_id, tenant.id),
          gte(facturas.created_at, inicioMes),
          lt(facturas.created_at, inicioSiguiente),
        ),
      );

    if (value >= max_facturas_mes) {
      throw new PlanLimitError(
        `Has alcanzado el límite de ${max_facturas_mes} factura(s) electrónica(s) este mes ` +
          `para tu plan (${tenant.plan.nombre}). Actualiza a Raíz o superior para facturar sin límite.`,
      );
    }
    return;
  }

  // Límite anual (Origen: 30/año, Exprés: 300/año)
  if (max_facturas_ano !== null) {
    const ahora = new Date();
    const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
    const inicioSiguiente = new Date(ahora.getFullYear() + 1, 0, 1);

    const [{ value }] = await db
      .select({ value: count() })
      .from(facturas)
      .where(
        and(
          eq(facturas.tenant_id, tenant.id),
          gte(facturas.created_at, inicioAnio),
          lt(facturas.created_at, inicioSiguiente),
        ),
      );

    if (value >= max_facturas_ano) {
      throw new PlanLimitError(
        `Has alcanzado el límite de ${max_facturas_ano} factura(s) electrónica(s) este año ` +
          `para tu plan (${tenant.plan.nombre}). Actualiza a Exprés o Semilla para facturar más.`,
      );
    }
  }
}
