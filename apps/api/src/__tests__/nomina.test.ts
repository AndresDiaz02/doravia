/**
 * Tests de nómina electrónica — FASE 10, Etapa 1
 *
 * Tests de lógica pura (sin DB, sin HTTP), extraída de routes/nomina.ts:
 * - Cálculo de documentos_disponibles del pool
 * - Validación de tipo_contrato y quincena
 * - Regla de acumulación (tope 2x plan)
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect } from "vitest";

const TIPOS_CONTRATO = ["indefinido", "termino_fijo", "obra_labor", "prestacion_servicios"] as const;

// ── documentos_disponibles (misma fórmula que GET /api/nomina/pool) ──────────

function documentosDisponibles(pool: {
  documentos_incluidos: number;
  documentos_acumulados_previos: number;
  documentos_adicionales_comprados: number;
  documentos_consumidos_ciclo: number;
}): number {
  const disponibles =
    pool.documentos_incluidos +
    pool.documentos_acumulados_previos +
    pool.documentos_adicionales_comprados -
    pool.documentos_consumidos_ciclo;
  return Math.max(0, disponibles);
}

describe("nomina: documentosDisponibles", () => {
  it("plan sin consumo: disponibles = incluidos", () => {
    expect(documentosDisponibles({
      documentos_incluidos: 36, documentos_acumulados_previos: 0,
      documentos_adicionales_comprados: 0, documentos_consumidos_ciclo: 0,
    })).toBe(36);
  });

  it("suma acumulados previos y adicionales comprados", () => {
    expect(documentosDisponibles({
      documentos_incluidos: 36, documentos_acumulados_previos: 10,
      documentos_adicionales_comprados: 10, documentos_consumidos_ciclo: 5,
    })).toBe(51);
  });

  it("nunca retorna negativo si el consumo excede lo disponible (defensivo)", () => {
    expect(documentosDisponibles({
      documentos_incluidos: 36, documentos_acumulados_previos: 0,
      documentos_adicionales_comprados: 0, documentos_consumidos_ciclo: 40,
    })).toBe(0);
  });
});

// NOTA: la regla de negocio "documentos no usados se acumulan hasta 2x el plan al
// renovar" (doc FASE 10, regla #3) NO está implementada todavía — no existe un job
// de renovación en esta etapa. El modelo de datos ya tiene las columnas necesarias
// (documentos_acumulados_previos, limite_acumulacion) para que Etapa 2 la implemente.

// ── Validación tipo_contrato / quincena (mismas reglas que POST /empleados y /periodos) ─

function validarTipoContrato(tipo: string): boolean {
  return (TIPOS_CONTRATO as readonly string[]).includes(tipo);
}

function validarQuincena(quincena: number | null | undefined): boolean {
  return quincena == null || quincena === 1 || quincena === 2;
}

describe("nomina: validación de tipo_contrato", () => {
  it.each(TIPOS_CONTRATO)("acepta tipo válido: %s", (tipo) => {
    expect(validarTipoContrato(tipo)).toBe(true);
  });

  it("rechaza tipo con acento (debe usarse la forma ascii)", () => {
    expect(validarTipoContrato("término_fijo")).toBe(false);
  });

  it("rechaza tipo inventado", () => {
    expect(validarTipoContrato("freelance")).toBe(false);
  });
});

describe("nomina: validación de quincena", () => {
  it("acepta null (ciclo mensual)", () => {
    expect(validarQuincena(null)).toBe(true);
  });
  it("acepta 1 y 2", () => {
    expect(validarQuincena(1)).toBe(true);
    expect(validarQuincena(2)).toBe(true);
  });
  it("rechaza 3 o cualquier otro valor", () => {
    expect(validarQuincena(3)).toBe(false);
    expect(validarQuincena(0)).toBe(false);
  });
});
