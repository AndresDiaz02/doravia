import { Router } from "express";
import { db, facturas, plans } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

const router = Router();

// GET /api/mi-plan
// Retorna estado de suscripción, días de trial/vencimiento, uso de documentos
router.get("/", async (req, res) => {
  try {
    const tenant = req.tenant;
    const plan = tenant.plan;
    const hoy = new Date();
    const vencimiento = new Date(tenant.plan_ends_at);

    const diasRestantes = Math.max(0, Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));

    // Determinar si está en trial (plan ERP con ends_at ≤ 15 días desde starts_at)
    const inicio = tenant.plan_starts_at ? new Date(tenant.plan_starts_at) : null;
    const duracionDias = inicio
      ? Math.ceil((vencimiento.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const enTrial = plan.product === "erp" && duracionDias !== null && duracionDias <= 15;

    // Uso de facturas (año calendario actual)
    let facturasUsadasAno = 0;
    if (plan.max_facturas_ano !== null) {
      const inicioAno = new Date(hoy.getFullYear(), 0, 1);
      const [row] = await db
        .select({ total: sql<number>`count(*)` })
        .from(facturas)
        .where(
          and(
            eq(facturas.tenant_id, req.tenantId),
            gte(facturas.fecha_emision, inicioAno),
          ),
        );
      facturasUsadasAno = Number(row?.total ?? 0);
    }

    return res.json({
      plan: {
        slug: plan.slug,
        nombre: plan.nombre,
        product: plan.product,
        precio_anual_cop: plan.precio_anual_cop,
        precio_mensual_cop: plan.precio_mensual_cop,
        precio_regular_anual_cop: plan.precio_regular_anual_cop,
        precio_regular_mensual_cop: plan.precio_regular_mensual_cop,
        features: plan.features,
        max_usuarios: plan.max_usuarios,
        max_facturas_ano: plan.max_facturas_ano,
      },
      suscripcion: {
        starts_at: tenant.plan_starts_at,
        ends_at: tenant.plan_ends_at,
        dias_restantes: diasRestantes,
        en_trial: enTrial,
        activo: tenant.activo,
        ultimo_pago_confirmado_at: tenant.ultimo_pago_confirmado_at ?? null,
      },
      uso: {
        facturas_usadas_ano: facturasUsadasAno,
        max_facturas_ano: plan.max_facturas_ano,
        facturas_mes_actual: tenant.facturas_mes_actual ?? 0,
        limite_mes: null, // sin límite por ahora, extensible
        porcentaje_uso: null,
      },
    });
  } catch (err) {
    console.error("Error en GET /mi-plan:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export { router as miPlanRouter };
export default router;
