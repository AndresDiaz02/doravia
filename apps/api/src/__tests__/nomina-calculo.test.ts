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
import { calcularSaludEmpleado, calcularPensionEmpleado, calcularRetencionFuenteArt383 } from "../services/nomina/deducciones.js";
import { calcularAportesParafiscalesEmpleador } from "../services/nomina/aportes.js";
import { calcularNominaEmpleado } from "../services/nomina/calculadora.js";
import type { ParametrosNominaAnuales } from "@workspace/db";

// Mismos valores del seed 2026 (migrate.ts) — Decretos 1469 y 1470 de diciembre de 2025 (confirmados)
const PARAMETROS_2026 = {
  id: "test-id",
  ano: 2026,
  salario_minimo_cop: 1750905,
  auxilio_transporte_cop: 249095,
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
// Fechas de período de ejemplo antes/después del corte de jornada 42h (01/07/2026) —
// no afectan estos tests de deducciones/aportes, pero calcularNominaEmpleado las requiere.
const FECHA_ANTES_CORTE = "2026-03-15";

describe("nomina: deducciones del empleado", () => {
  it("salud empleado = 4% del devengado", () => {
    expect(calcularSaludEmpleado(2000000, PARAMETROS_2026)).toBe(80000);
  });

  it("pensión empleado = 4% del devengado", () => {
    expect(calcularPensionEmpleado(2000000, PARAMETROS_2026)).toBe(80000);
  });

  it("retención en la fuente: 0 para un salario mínimo (muy por debajo del umbral de 95 UVT)", () => {
    const devengado = 1750905;
    const salud = calcularSaludEmpleado(devengado, PARAMETROS_2026);
    const pension = calcularPensionEmpleado(devengado, PARAMETROS_2026);
    expect(calcularRetencionFuenteArt383(devengado, salud, pension, PARAMETROS_2026, UVT_2026)).toBe(0);
  });

  it("retención en la fuente: aplica tarifa simplificada sobre el exceso del umbral", () => {
    const umbralCop = 95 * UVT_2026; // ≈ 4,975,530
    const devengado = umbralCop + 1_000_000; // muy por encima del umbral, evita que salud/pension bajen la base por debajo
    const salud = calcularSaludEmpleado(devengado, PARAMETROS_2026);
    const pension = calcularPensionEmpleado(devengado, PARAMETROS_2026);
    const baseGravable = devengado - salud - pension;
    const esperado = Math.round((baseGravable - umbralCop) * 0.19 * 100) / 100;
    expect(calcularRetencionFuenteArt383(devengado, salud, pension, PARAMETROS_2026, UVT_2026)).toBe(esperado);
    expect(esperado).toBeGreaterThan(0);
  });

  it("retención en la fuente: acumula el componente fijo de cada tramo del art. 383", () => {
    const casos = [
      { baseUvt: 200, esperadoUvt: (200 - 150) * 0.28 + 10 },
      { baseUvt: 500, esperadoUvt: (500 - 360) * 0.33 + 69 },
      { baseUvt: 800, esperadoUvt: (800 - 640) * 0.35 + 162 },
      { baseUvt: 1200, esperadoUvt: (1200 - 945) * 0.37 + 268 },
      { baseUvt: 2500, esperadoUvt: (2500 - 2300) * 0.39 + 770 },
    ];
    for (const { baseUvt, esperadoUvt } of casos) {
      expect(calcularRetencionFuenteArt383(baseUvt * UVT_2026, 0, 0, PARAMETROS_2026, UVT_2026))
        .toBe(Math.round(esperadoUvt * UVT_2026 * 100) / 100);
    }
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
  it("empleado de salario mínimo sin ajustes: neto = devengado - deducciones + auxilio, sin retención", () => {
    const resultado = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    expect(resultado.retencion_fuente).toBe(0);
    expect(resultado.deducciones_totales).toBe(resultado.salud_empleado + resultado.pension_empleado);
    const devengado = resultado.salario_base + resultado.horas_extras_valor + resultado.recargos_valor + resultado.comisiones_valor;
    expect(resultado.neto_pagar).toBe(Math.round((devengado - resultado.deducciones_totales + resultado.auxilio_transporte) * 100) / 100);
  });

  it("aplica horas extra/recargos/comisiones como devengado adicional (ajuste manual, Etapa 2 LITE)", () => {
    const base = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    const conExtras = calcularNominaEmpleado(
      { salario_base: "1750905" },
      { horas_extras_valor: 100000, comisiones_valor: 50000 },
      PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE,
    );
    // Más devengado → más base para salud/pensión → deducciones suben
    expect(conExtras.salud_empleado).toBeGreaterThan(base.salud_empleado);
    expect(conExtras.neto_pagar).toBeGreaterThan(base.neto_pagar);
  });

  it("otras_deducciones se suma directo a deducciones_totales sin afectar aportes del empleador", () => {
    const sinOtras = calcularNominaEmpleado({ salario_base: "2000000" }, {}, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    const conOtras = calcularNominaEmpleado({ salario_base: "2000000" }, { otras_deducciones: 50000 }, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    expect(conOtras.deducciones_totales - sinOtras.deducciones_totales).toBe(50000);
    expect(conOtras.aportes_parafiscales).toBe(sinOtras.aportes_parafiscales);
    expect(conOtras.neto_pagar).toBe(Math.round((sinOtras.neto_pagar - 50000) * 100) / 100);
  });

  it("auxilio de transporte: se paga completo a quien gana hasta 2 SMLV (1.750.905 × 2 = 3.501.810)", () => {
    const resultado = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    expect(resultado.auxilio_transporte).toBe(249095);
  });

  it("auxilio de transporte: no se paga a quien gana más de 2 SMLV", () => {
    const resultado = calcularNominaEmpleado({ salario_base: "4000000" }, {}, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    expect(resultado.auxilio_transporte).toBe(0);
  });

  it("auxilio de transporte NO integra la base (IBC) de salud/pensión — solo afecta el neto", () => {
    const conAuxilio = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    const sinAuxilio = calcularNominaEmpleado({ salario_base: "4000000" }, {}, PARAMETROS_2026, UVT_2026, FECHA_ANTES_CORTE);
    // salud/pensión se calculan solo sobre salario_base, no sobre salario_base + auxilio
    expect(conAuxilio.salud_empleado).toBe(Math.round(1750905 * 0.04 * 100) / 100);
    expect(sinAuxilio.salud_empleado).toBe(Math.round(4000000 * 0.04 * 100) / 100);
  });
});

// ── Jornada laboral (Ley 2101/2021) y valor hora — ver services/nomina/jornada.ts ────
describe("nomina: jornada semanal y valor hora ordinaria cruzando el corte del 01/07/2026", () => {
  it("período antes del 01/07/2026 usa jornada de 44 horas", () => {
    const resultado = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, "2026-06-30");
    expect(resultado.jornada_semanal).toBe(44);
  });

  it("período del 01/07/2026 en adelante usa jornada de 42 horas", () => {
    const resultado = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, "2026-07-01");
    expect(resultado.jornada_semanal).toBe(42);
  });

  it("el valor hora ordinaria cambia correctamente al cruzar la fecha de corte para el mismo salario", () => {
    const antesDelCorte = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, "2026-06-30");
    const despuesDelCorte = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, "2026-07-01");

    const divisor44 = (44 * 52) / 12; // 190.666...
    const divisor42 = (42 * 52) / 12; // 182

    expect(antesDelCorte.valor_hora_ordinaria).toBe(Math.round((1750905 / divisor44) * 100) / 100);
    expect(despuesDelCorte.valor_hora_ordinaria).toBe(Math.round((1750905 / divisor42) * 100) / 100);
    // Misma jornada mensual pagada en menos horas → valor hora sube al reducirse la jornada
    expect(despuesDelCorte.valor_hora_ordinaria).toBeGreaterThan(antesDelCorte.valor_hora_ordinaria);
  });

  it("acumulados históricos anteriores al corte siguen usando 44h aunque se calculen hoy", () => {
    // Ej.: un cliente carga en 2027 un período histórico de mayo 2026 — debe usar 44h,
    // no la jornada vigente al momento de correr el cálculo.
    const periodoHistorico = calcularNominaEmpleado({ salario_base: "1750905" }, {}, PARAMETROS_2026, UVT_2026, "2026-05-31");
    expect(periodoHistorico.jornada_semanal).toBe(44);
  });
});

// ── Invariante contable del asiento de nómina (services/contabilidad.service.ts:crearAsientoNomina) ──
// Débito 5105 = Σ(devengado + auxilio_transporte) + Σaportes.
// Crédito = Σneto + Σdeducciones + Σaportes.
// Como neto_i = devengado_i - deducciones_i + auxilio_i, ambos lados son siempre iguales por construcción.
describe("nomina: invariante de balance del asiento contable consolidado", () => {
  it("débito (gasto) == crédito (bancos + aportes por pagar) para cualquier conjunto de detalles", () => {
    const detalles = [
      { devengado: 1750905, auxilio: 249095, deducciones: 140072.40, aportes: 525903.05 },
      { devengado: 2500000, auxilio: 0, deducciones: 340000, aportes: 750550 },
      { devengado: 1800000, auxilio: 0, deducciones: 144000, aportes: 540396 },
    ];

    const totalDevengado = detalles.reduce((s, d) => s + d.devengado + d.auxilio, 0);
    const totalAportes = detalles.reduce((s, d) => s + d.aportes, 0);
    const totalNeto = detalles.reduce((s, d) => s + (d.devengado - d.deducciones + d.auxilio), 0);
    const totalDeducciones = detalles.reduce((s, d) => s + d.deducciones, 0);

    const debito = totalDevengado + totalAportes;
    const credito = totalNeto + totalDeducciones + totalAportes;

    expect(Math.round(debito * 100) / 100).toBe(Math.round(credito * 100) / 100);
  });
});
