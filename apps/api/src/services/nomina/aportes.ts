import type { ParametrosNominaAnuales } from "@workspace/db";

/**
 * Aportes parafiscales y de seguridad social a cargo del EMPLEADOR (no del empleado).
 * Suma: salud empleador + pensión empleador + ARL + SENA + ICBF + caja de compensación.
 *
 * ⚠️ arl_pct_default usa la tarifa de Clase I (riesgo mínimo) — la tarifa real varía por
 * clase de riesgo del cargo/actividad (Clase I a V). Selección de clase de riesgo por
 * empleado queda para una etapa posterior; por ahora aplica el default a todos.
 */
export function calcularAportesParafiscalesEmpleador(
  devengado: number,
  parametros: ParametrosNominaAnuales,
): number {
  const pctTotal =
    Number(parametros.salud_empleador_pct) +
    Number(parametros.pension_empleador_pct) +
    Number(parametros.arl_pct_default) +
    Number(parametros.sena_pct) +
    Number(parametros.icbf_pct) +
    Number(parametros.caja_compensacion_pct);

  return round2(devengado * (pctTotal / 100));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
