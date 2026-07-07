import type { Request, Response, NextFunction } from "express";
import { FEATURE_LABELS, FEATURE_MIN_PLAN } from "@workspace/shared";
import type { PlanFeature } from "@workspace/shared";

/**
 * Bloquea operaciones de escritura a usuarios con rol "contador".
 * Los contadores pueden leer y exportar, pero no crear/modificar/eliminar.
 *
 * Uso: router.post("/", requireNotContador, handler)
 */
export function requireNotContador(req: Request, res: Response, next: NextFunction) {
  if (req.userRole === "contador") {
    return res.status(403).json({
      error: "Los usuarios con rol Contador solo tienen acceso de lectura.",
      code: "CONTADOR_READONLY",
    });
  }
  next();
}

/**
 * Mecanismo 1 — bloqueo de módulos completos.
 *
 * Uso en rutas:
 *   router.use("/inventario", authenticate, requirePlanFeature("inventario"), inventarioRouter);
 *   router.use("/centros-costos", authenticate, requirePlanFeature("centros_costos"), costoRouter);
 *
 * El middleware lee req.tenant (adjuntado por `authenticate`) y rechaza con 403
 * si el plan del tenant no tiene el feature activo.
 */
export function requirePlanFeature(feature: PlanFeature) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { plan, addons } = req.tenant;
    const hasFeature = plan.features[feature] || (addons as Record<string, boolean> | null)?.[feature];

    if (!hasFeature) {
      const minPlan = FEATURE_MIN_PLAN[feature];
      const upgrade = minPlan ? ` Requiere plan ${minPlan} o superior.` : " Actualiza tu plan para acceder.";
      return res.status(403).json({
        error: `Tu plan (${plan.nombre}) no incluye el módulo de ${FEATURE_LABELS[feature]}.${upgrade}`,
        code: "PLAN_FEATURE_NOT_INCLUDED",
        feature,
        current_plan: plan.slug,
        required_plan: minPlan ?? null,
        upgrade_required: true,
      });
    }

    next();
  };
}

/**
 * Mecanismo 1b — bloqueo por nivel contable.
 *
 * Uso: requireAccountingLevel(3) bloquea si el tenant tiene level < 3.
 * Útil para rutas de reportes comparativos, centros de costos, etc.
 */
export function requireAccountingLevel(minLevel: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { plan } = req.tenant;

    if (plan.accounting_level < minLevel) {
      return res.status(403).json({
        error: `Tu plan (${plan.nombre}) no incluye este nivel de reportes contables. Actualiza tu plan para acceder.`,
        code: "ACCOUNTING_LEVEL_INSUFFICIENT",
        current_level: plan.accounting_level,
        required_level: minLevel,
        upgrade_required: true,
      });
    }

    next();
  };
}

/**
 * Middleware reutilizable por ruta para restringir acceso por rol.
 * Uso: router.post("/", requireRole(["admin"]), handler)
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({
        error: "No tienes permisos para realizar esta acción.",
        code: "FORBIDDEN",
        required_roles: roles,
      });
    }
    next();
  };
}
