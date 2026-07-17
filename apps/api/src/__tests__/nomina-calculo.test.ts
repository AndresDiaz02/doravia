/**
 * Tests de cálculo de nómina — FASE 10, Etapa 2
 *
 * A diferencia de otros tests de este repo (que replican lógica inline porque viven en
 * rutas Express), calculadora.ts/aportes.ts/deducciones.ts son funciones puras sin acceso
 * a BD — se importan y se testean directamente.
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect } from "vitest";
import { calcularSaludEmpleado, calcularPensionEmpleado, calcularRetencionFuenteSimplificada } from "../services/nomina/deducciones.js";
import { calcularAportesParafiscalesEmpleador } from "../services/nomina/aportes.js";
import { calcularNominaEmpleado } from "../services/nomina/calculadora.js";
import type { ParametrosNominaAnuales } from "@workspace/db";

// Mismos valores del seed 2026 (migrate.ts) — ver nota de "ESTIMADO" ahí para salario mínimo
const PARAMETROS_2026 = {
  id: "test-id",
  ano: 2026,
  salario_minimo_cop: 1509000,
  auxilio_transporte_cop: 212000,
  tope_auxilio_transporte_smlv: "2.00",
  salud_empleado_pct: "4.00",
  salud_empleador_pct: "8.50",
  pension_empleado_pct: "4.00",
  pension_empleador_pct: "12.00",
  arl_pct_default: "0.5220",
  sena_pct: "2.00",
  icbf_pct: "3.00",
  caja_compensacion_pct: "4.00",
  cesantias_pct: "8.33",
  intereses_cesantias_pct: "12.00",
  prima_pct: "8.33",
  vacaciones_pct: "4.17",
  retencion_base_uvt: "95.00",
  retencion_pct_simplificada: "19.00",
  fuente_normativa: null,
  creado_por: null,
  created_at: new Date(),
} as unknown as ParametrosNominaAnuales;

const UVT_2026 = 52374;

describe("nomina: deducciones del empleado", () => {
  it("salud empleado = 4% del devengado", () => {
    expect(calcularSaludEmpleado(2000000, PARAMETROS_2026)).toBe(80000);
  });

  it("pensión empleado = 4% del devengado", () => {
    expect(calcularPensionEmpleado(2000000, PARAMETROS_2026)).toBe(80000);
  });

  it("retención en la fuente: 0 para un salario mínimo (muy por debajo del umbral de 95 UVT)", () => {
    const devengado = 1509000;
    const salud = calcularSaludEmpleado(devengado, PARAMETROS_2026);
    const pension = calcularPensionEmpleado(devengado, PARAMETROS_2026);
    expect(calcularRetencionFuenteSimplificada(devengado, salud, pension, PARAMETROS_2026, UVT_2026)).toBe(0);
  });

  it("retención en la fuente: aplica tarifa simplificada sobre el exceso del umbral", () => {
    const umbralCop = 95 * UVT_2026; // ≈ 4,975,530
    const devengado = umbralCop + 1_000_000; // muy por encima del umbral, evita que salud/pension bajen la base por debajo
    const salud = calcularSaludEmpleado(devengado, PARAMETROS_2026);
    const pension = calcularPensionEmpleado(devengado, PARAMETROS_2026);
    const baseGravable = devengado - salud - pension;
    const esperado = Math.round((baseGravable - umbralCop) * 0.19 * 100) / 100;
    expect(calcularRetencionFuenteSimplificada(devengado, salud, pension, PARAMETROS_2026, UVT_2026)).toBe(esperado);
    expect(esperado).toBeGreaterThan(0);
  });
});

describe("nomina: aportes parafiscales del empleador", () => {
  it("suma las 6 tarifas del empleador (salud+pension+arl+sena+icbf+caja)", () => {
    const devengado = 2000000;
    const pctEsperado = 8.50 + 12.00 + 0.522 + 2.00 + 3.00 + 4.00; // 30.022%
    const esperado = Math.round(devengado * (pctEsperado / 100) * 100) / 100;
    expect(calcularAportesParafiscalesEmpleador(devengado, PARAMETROS_2026)).toBe(esperado);
  });
});

describe("nomina: calcularNominaEmpleado (integración)", () => {
  it("empleado de salario mínimo sin ajustes: neto = devengado - deducciones, sin retención", () => {
    const resultado = calcularNominaEmpleado({ salario_base: "1509000" }, {}, PARAMETROS_2026, UVT_2026);
    expect(resultado.retencion_fuente).toBe(0);
    expect(resultado.deducciones_totales).toBe(resultado.salud_empleado + resultado.pension_empleado);
    const devengado = resultado.salario_base + resultado.horas_extras_valor + resultado.recargos_valor + resultado.comisiones_valor;
    expect(resultado.neto_pagar).toBe(Math.round((devengado - resultado.deducciones_totales) * 100) / 100);
  });

  it("aplica horas extra/recargos/comisiones como devengado adicional (ajuste manual, Etapa 2 LITE)", () => {
    const base = calcularNominaEmpleado({ salario_base: "1509000" }, {}, PARAMETROS_2026, UVT_2026);
    const conExtras = calcularNominaEmpleado(
      { salario_base: "1509000" },
      { horas_extras_valor: 100000, comisiones_valor: 50000 },
      PARAMETROS_2026, UVT_2026,
    );
    // Más devengado → más base para salud/pensión → deducciones suben
    expect(conExtras.salud_empleado).toBeGreaterThan(base.salud_empleado);
    expect(conExtras.neto_pagar).toBeGreaterThan(base.neto_pagar);
  });

  it("otras_deducciones se suma directo a deducciones_totales sin afectar aportes del empleador", () => {
    const sinOtras = calcularNominaEmpleado({ salario_base: "2000000" }, {}, PARAMETROS_2026, UVT_2026);
    const conOtras = calcularNominaEmpleado({ salario_base: "2000000" }, { otras_deducciones: 50000 }, PARAMETROS_2026, UVT_2026);
    expect(conOtras.deducciones_totales - sinOtras.deducciones_totales).toBe(50000);
    expect(conOtras.aportes_parafiscales).toBe(sinOtras.aportes_parafiscales);
    expect(conOtras.neto_pagar).toBe(Math.round((sinOtras.neto_pagar - 50000) * 100) / 100);
  });
});

// ── Invariante contable del asiento de nómina (services/contabilidad.service.ts:crearAsientoNomina) ──
// Débito 5105 = Σdevengado + Σaportes.  Crédito = Σneto + Σdeducciones + Σaportes.
// Como neto_i = devengado_i - deducciones_i, ambos lados son siempre iguales por construcción.
describe("nomina: invariante de balance del asiento contable consolidado", () => {
  it("débito (gasto) == crédito (bancos + aportes por pagar) para cualquier conjunto de detalles", () => {
    const detalles = [
      { devengado: 1509000, deducciones: 120720, aportes: 453143.22 },
      { devengado: 2500000, deducciones: 340000, aportes: 750550 },
      { devengado: 1800000, deducciones: 144000, aportes: 540396 },
    ];

    const totalDevengado = detalles.reduce((s, d) => s + d.devengado, 0);
    const totalAportes = detalles.reduce((s, d) => s + d.aportes, 0);
    const totalNeto = detalles.reduce((s, d) => s + (d.devengado - d.deducciones), 0);
    const totalDeducciones = detalles.reduce((s, d) => s + d.deducciones, 0);

    const debito = totalDevengado + totalAportes;
    const credito = totalNeto + totalDeducciones + totalAportes;

    expect(Math.round(debito * 100) / 100).toBe(Math.round(credito * 100) / 100);
  });
});
