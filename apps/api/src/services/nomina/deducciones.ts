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
export function calcularRetencionFuenteArt383(
  devengado: number,
  saludEmpleado: number,
  pensionEmpleado: number,
  parametros: ParametrosNominaAnuales,
  uvt: number,
): number {
  if (!Number.isFinite(uvt) || uvt <= 0) return 0;

  // Tabla progresiva del art. 383 ET. La base se expresa primero en UVT y
  // cada tramo aplica su componente fijo acumulado, no una tarifa plana.
  const baseUvt = Math.max(0, devengado - saludEmpleado - pensionEmpleado) / uvt;
  let retencionUvt = 0;
  if (baseUvt > 2300) retencionUvt = (baseUvt - 2300) * 0.39 + 770;
  else if (baseUvt > 945) retencionUvt = (baseUvt - 945) * 0.37 + 268;
  else if (baseUvt > 640) retencionUvt = (baseUvt - 640) * 0.35 + 162;
  else if (baseUvt > 360) retencionUvt = (baseUvt - 360) * 0.33 + 69;
  else if (baseUvt > 150) retencionUvt = (baseUvt - 150) * 0.28 + 10;
  else if (baseUvt > 95) retencionUvt = (baseUvt - 95) * 0.19;

  return round2(retencionUvt * uvt);
}

/** @deprecated Conservada temporalmente para integraciones internas previas. */
export const calcularRetencionFuenteSimplificada = calcularRetencionFuenteArt383;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
