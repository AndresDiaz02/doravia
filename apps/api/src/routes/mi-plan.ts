import { Router } from "express";
import { db, facturas, plans, bold_payments } from "@workspace/db";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { calcularMontoCuota, type Modalidad } from "../services/subscription.service.js";

const router = Router();

// GET /api/mi-plan
// Retorna estado de suscripción, días de trial/vencimiento, uso de documentos y modalidad
router.get("/", async (req, res) => {
  try {
    const tenant = req.tenant;
    const plan = tenant.plan;
    const hoy = new Date();
    const vencimiento = new Date(tenant.plan_ends_at);

    const diasRestantes = Math.max(0, Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));

    const enTrial = tenant.subscription_status === "trial";
    const modalidad = (tenant.modalidad_suscripcion ?? "anual") as Modalidad;

    // Para 3cuotas: calcular cuántas cuotas se han pagado y el monto de la próxima
    let cuotaActual = 1;
    let proximaCuotaMonto: number | null = null;

    if (modalidad === "3cuotas") {
      const [row] = await db
        .select({ n: count() })
        .from(bold_payments)
        .where(
          and(
            eq(bold_payments.tenant_id, req.tenantId),
            eq(bold_payments.modalidad, "3cuotas"),
            eq(bold_payments.estado, "APPROVED"),
          ),
        );
      cuotaActual = Math.min(Number(row?.n ?? 0), 3);
      if (cuotaActual < 3) {
        const siguiente = cuotaActual + 1;
        proximaCuotaMonto = calcularMontoCuota(
          plan.precio_anual_cop,
          plan.precio_3cuotas_total_cop ?? Math.round(plan.precio_anual_cop * 1.1),
          "3cuotas",
          siguiente,
        );
      }
    } else if (modalidad === "mensual") {
      proximaCuotaMonto = plan.precio_mensual_cop ?? Math.round(plan.precio_anual_cop / 10);
    }

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
        subscription_status: tenant.subscription_status,
        ultimo_pago_confirmado_at: tenant.ultimo_pago_confirmado_at ?? null,
        modalidad,
        cuota_actual: modalidad === "3cuotas" ? cuotaActual : null,
        total_cuotas: modalidad === "3cuotas" ? 3 : null,
        proxima_cuota_monto: proximaCuotaMonto,
      },
      uso: {
        facturas_usadas_ano: facturasUsadasAno,
        max_facturas_ano: plan.max_facturas_ano,
        facturas_mes_actual: tenant.facturas_mes_actual ?? 0,
        limite_mes: null,
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
