import type { ParametrosNominaAnuales } from "@workspace/db";

/** Salud a cargo del empleado (Ley 100/1993 Art. 204) */
export function calcularSaludEmpleado(devengado: number, parametros: ParametrosNominaAnuales): number {
  return round2(devengado * (Number(parametros.salud_empleado_pct) / 100));
}

/** Pensión a cargo del empleado (Ley 100/1993 Art. 20) */
export function calcularPensionEmpleado(devengado: number, parametros: ParametrosNominaAnuales): number {
  return round2(devengado * (Number(parametros.pension_empleado_pct) / 100));
}

/**
 * Retención en la fuente laboral — APROXIMACIÓN SIMPLIFICADA.
 *
 * ⚠️ Esto NO es la tabla progresiva completa del Art. 383 ET (procedimiento 2, fuera de
 * alcance en Fase 10 por decisión explícita). Implementa un procedimiento 1 simplificado:
 * exento por debajo de retencion_base_uvt, tarifa marginal única simplificada por encima.
 * Requiere revisión de un contador antes de usarse con nóminas reales — ver nota en
 * packages/db/src/schema/parametros_nomina.ts.
 *
 * Base gravable = devengado - deducciones obligatorias (salud + pensión empleado), que es
 * la base real que usa la ley antes de aplicar la tabla de retención.
 */
export function calcularRetencionFuenteSimplificada(
  devengado: number,
  saludEmpleado: number,
  pensionEmpleado: number,
  parametros: ParametrosNominaAnuales,
  uvt: number,
): number {
  const baseGravable = devengado - saludEmpleado - pensionEmpleado;
  const umbral = Number(parametros.retencion_base_uvt) * uvt;
  if (baseGravable <= umbral) return 0;

  const exceso = baseGravable - umbral;
  return round2(exceso * (Number(parametros.retencion_pct_simplificada) / 100));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
