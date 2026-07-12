export type CicloPago = "anual" | "mensual" | "cuotas";

export interface PlanPreciosBold {
  precio_anual_cop: number;
  precio_mensual_cop: number | null;
  precio_3cuotas_total_cop: number | null;
  num_cuotas: number | null;
}

/**
 * Resuelve el monto a cobrar usando solo datos de la BD.
 * El cliente nunca controla este valor.
 */
export function resolverMontoBold(plan: PlanPreciosBold, ciclo: CicloPago = "anual"): number {
  switch (ciclo) {
    case "mensual":
      return plan.precio_mensual_cop ?? plan.precio_anual_cop;
    case "cuotas": {
      const total = plan.precio_3cuotas_total_cop ?? plan.precio_anual_cop;
      const nCuotas = plan.num_cuotas ?? 1;
      return Math.ceil(total / nCuotas);
    }
    default:
      return plan.precio_anual_cop;
  }
}
