import type { Empleado, ParametrosNominaAnuales } from "@workspace/db";
import { calcularSaludEmpleado, calcularPensionEmpleado, calcularRetencionFuenteSimplificada } from "./deducciones.js";
import { calcularAportesParafiscalesEmpleador } from "./aportes.js";

export interface AjusteEmpleado {
  horas_extras_valor?: number;
  recargos_valor?: number;
  comisiones_valor?: number;
  otras_deducciones?: number;
}

export interface DetalleCalculado {
  salario_base: number;
  horas_extras_valor: number;
  recargos_valor: number;
  comisiones_valor: number;
  salud_empleado: number;
  pension_empleado: number;
  retencion_fuente: number;
  otras_deducciones: number;
  deducciones_totales: number;
  aportes_parafiscales: number;
  neto_pagar: number;
}

/**
 * Calcula la nómina de UN empleado para un período. Función pura — sin acceso a BD,
 * para que sea testeable de forma aislada (ver __tests__/nomina-calculo.test.ts).
 *
 * Nota Etapa 2 (LITE): horas extra/recargos/comisiones son valores en COP capturados
 * manualmente vía `ajuste` (liquidación automática desde horas trabajadas es Etapa 4 — Plus).
 * No se prorratea por días trabajados en el mes (empleados de medio período usan salario_base
 * completo) — limitación conocida, documentada para Etapa 2.
 */
export function calcularNominaEmpleado(
  empleado: Pick<Empleado, "salario_base">,
  ajuste: AjusteEmpleado,
  parametros: ParametrosNominaAnuales,
  uvt: number,
): DetalleCalculado {
  const salario_base = Number(empleado.salario_base);
  const horas_extras_valor = ajuste.horas_extras_valor ?? 0;
  const recargos_valor = ajuste.recargos_valor ?? 0;
  const comisiones_valor = ajuste.comisiones_valor ?? 0;
  const otras_deducciones = ajuste.otras_deducciones ?? 0;

  const devengado = salario_base + horas_extras_valor + recargos_valor + comisiones_valor;

  const salud_empleado = calcularSaludEmpleado(devengado, parametros);
  const pension_empleado = calcularPensionEmpleado(devengado, parametros);
  const retencion_fuente = calcularRetencionFuenteSimplificada(devengado, salud_empleado, pension_empleado, parametros, uvt);

  const deducciones_totales = round2(salud_empleado + pension_empleado + retencion_fuente + otras_deducciones);
  const aportes_parafiscales = calcularAportesParafiscalesEmpleador(devengado, parametros);
  const neto_pagar = round2(devengado - deducciones_totales);

  return {
    salario_base, horas_extras_valor, recargos_valor, comisiones_valor,
    salud_empleado, pension_empleado, retencion_fuente, otras_deducciones,
    deducciones_totales, aportes_parafiscales, neto_pagar,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
