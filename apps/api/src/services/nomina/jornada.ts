/**
 * Jornada laboral máxima semanal — Ley 2101 de 2021 (reducción gradual):
 *   16 jul 2023 → 42 h    ... (tramos previos ya vencidos, no aplican a Doravia)
 *   16 jul 2025 → 44 h
 *   01 jul 2026 → 42 h    ← corte vigente que maneja este archivo
 * Afecta el valor de la hora ordinaria y, por lo tanto, el valor de horas extra
 * y recargos (que se calculan como múltiplos de la hora ordinaria).
 */
const FECHA_CORTE_JORNADA_42H = "2026-07-01";

/** Jornada semanal vigente para una fecha dada (fecha del período de nómina, no de hoy). */
export function calcularJornadaSemanal(fecha: string): 42 | 44 {
  return fecha >= FECHA_CORTE_JORNADA_42H ? 42 : 44;
}

/**
 * Valor de la hora ordinaria de trabajo.
 * Divisor mensual estándar = (jornada_semanal × 52 semanas) / 12 meses.
 *   44 h → 190.67 horas/mes
 *   42 h → 182.00 horas/mes
 */
export function calcularValorHoraOrdinaria(salarioBase: number, fecha: string): number {
  const jornada = calcularJornadaSemanal(fecha);
  const divisorMensual = (jornada * 52) / 12;
  return round2(salarioBase / divisorMensual);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
