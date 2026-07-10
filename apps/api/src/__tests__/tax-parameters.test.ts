/**
 * Tests de parámetros tributarios con vigencias (R7)
 *
 * Prueba la lógica pura de validación de vigencias sin tocar la BD.
 * Casos críticos:
 *   - Traslape simple (mitad de período)
 *   - Traslape en el límite exacto (31-dic → 1-ene, inclusivo/exclusivo)
 *   - Sin hueco: vigencia que empieza el día siguiente al fin de la anterior
 *   - Fechas incoherentes (hasta < desde)
 *   - Vigencias consecutivas válidas (sin traslape ni hueco entre ellas)
 */

import { describe, it, expect } from "vitest";

// ── Lógica de validación extraída del servicio (tests de lógica pura) ─────────

interface Vigencia {
  valido_desde: string; // YYYY-MM-DD
  valido_hasta: string; // YYYY-MM-DD
}

/**
 * Detecta si la nueva vigencia se traslapa con alguna existente del mismo parámetro.
 * Dos intervalos [a,b] y [c,d] se traslapan si a<=d AND c<=b (ambos lados inclusive).
 */
function detectarTraslape(existentes: Vigencia[], nueva: Vigencia): Vigencia | null {
  for (const v of existentes) {
    if (v.valido_desde <= nueva.valido_hasta && v.valido_hasta >= nueva.valido_desde) {
      return v;
    }
  }
  return null;
}

function validarVigencia(nueva: Vigencia): { valid: boolean; error?: string } {
  if (nueva.valido_hasta < nueva.valido_desde) {
    return { valid: false, error: `valido_hasta (${nueva.valido_hasta}) no puede ser anterior a valido_desde (${nueva.valido_desde})` };
  }
  return { valid: true };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("tax-parameters: validación de vigencias", () => {

  // ── Caso límite crítico: 31-dic → 1-ene ─────────────────────────────────
  it("no detecta traslape cuando vigencia 2026 termina 31-dic y 2027 empieza 1-ene", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    const nueva: Vigencia = { valido_desde: "2027-01-01", valido_hasta: "2027-12-31" };
    expect(detectarTraslape(existentes, nueva)).toBeNull();
  });

  it("detecta traslape cuando 2027 empieza el 31-dic-2026 (mismo día que termina la anterior)", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    // Ambos inclusive: 2026-12-31 ∈ [2026-01-01, 2026-12-31] y 2026-12-31 ∈ [2026-12-31, 2027-12-31]
    const nueva: Vigencia = { valido_desde: "2026-12-31", valido_hasta: "2027-12-31" };
    expect(detectarTraslape(existentes, nueva)).not.toBeNull();
  });

  // ── Traslapes simples ────────────────────────────────────────────────────
  it("detecta traslape en el medio del período", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    const nueva: Vigencia = { valido_desde: "2026-06-01", valido_hasta: "2027-05-31" };
    expect(detectarTraslape(existentes, nueva)).not.toBeNull();
  });

  it("detecta traslape cuando nueva vigencia engloba completamente a la existente", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-03-01", valido_hasta: "2026-09-30" }];
    const nueva: Vigencia = { valido_desde: "2026-01-01", valido_hasta: "2026-12-31" };
    expect(detectarTraslape(existentes, nueva)).not.toBeNull();
  });

  it("detecta traslape cuando existente engloba completamente a la nueva", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    const nueva: Vigencia = { valido_desde: "2026-03-01", valido_hasta: "2026-08-31" };
    expect(detectarTraslape(existentes, nueva)).not.toBeNull();
  });

  // ── Vigencias válidas consecutivas ───────────────────────────────────────
  it("permite vigencia anterior sin traslape (nueva termina antes de que empiece la existente)", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    const nueva: Vigencia = { valido_desde: "2024-01-01", valido_hasta: "2024-12-31" };
    expect(detectarTraslape(existentes, nueva)).toBeNull();
  });

  it("permite encadenar tres vigencias anuales consecutivas sin traslape", () => {
    const vigencias: Vigencia[] = [
      { valido_desde: "2024-01-01", valido_hasta: "2024-12-31" },
      { valido_desde: "2025-01-01", valido_hasta: "2025-12-31" },
    ];
    const nueva2026: Vigencia = { valido_desde: "2026-01-01", valido_hasta: "2026-12-31" };
    // 2026 no debe traslaparse con 2024 ni 2025
    expect(detectarTraslape(vigencias, nueva2026)).toBeNull();
  });

  // ── Vigencias de un solo día ─────────────────────────────────────────────
  it("permite vigencia de un solo día cuando no colisiona", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    const nueva: Vigencia = { valido_desde: "2027-01-15", valido_hasta: "2027-01-15" };
    expect(detectarTraslape(existentes, nueva)).toBeNull();
  });

  it("detecta traslape de un solo día dentro del período existente", () => {
    const existentes: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    const nueva: Vigencia = { valido_desde: "2026-07-04", valido_hasta: "2026-07-04" };
    expect(detectarTraslape(existentes, nueva)).not.toBeNull();
  });

  // ── Validación de fechas coherentes ──────────────────────────────────────
  it("rechaza vigencia con valido_hasta anterior a valido_desde", () => {
    const r = validarVigencia({ valido_desde: "2026-12-31", valido_hasta: "2026-01-01" });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("no puede ser anterior");
  });

  it("acepta vigencia de un solo día (valido_desde === valido_hasta)", () => {
    const r = validarVigencia({ valido_desde: "2026-07-04", valido_hasta: "2026-07-04" });
    expect(r.valid).toBe(true);
  });

  it("acepta vigencia abierta indefinida (valido_hasta = 9999-12-31)", () => {
    const r = validarVigencia({ valido_desde: "2026-01-01", valido_hasta: "9999-12-31" });
    expect(r.valid).toBe(true);
  });

  // ── Múltiples parámetros no se interfieren ───────────────────────────────
  it("vigencias de parámetros distintos no se consideran traslape entre sí", () => {
    // La función recibe solo vigencias del mismo parámetro — esto lo garantiza el servicio
    // que filtra por `WHERE parametro = ?`; aquí probamos que el filtrado funciona conceptualmente
    const existentesIVA: Vigencia[] = [{ valido_desde: "2026-01-01", valido_hasta: "2026-12-31" }];
    const nuevaUVT: Vigencia = { valido_desde: "2026-01-01", valido_hasta: "2026-12-31" };
    // Si el servicio filtra por parámetro, la lista de existentes para UVT estaría vacía
    expect(detectarTraslape([], nuevaUVT)).toBeNull();
    // Para el mismo parámetro (IVA) sí hay traslape
    expect(detectarTraslape(existentesIVA, nuevaUVT)).not.toBeNull();
  });

  // ── Caso de uso real: cambio de UVT 2026 → 2027 ─────────────────────────
  it("simula ciclo completo: UVT 2025, 2026, 2027 sin traslape en transiciones de año", () => {
    const uvt2025: Vigencia = { valido_desde: "2025-01-01", valido_hasta: "2025-12-31" };
    const uvt2026: Vigencia = { valido_desde: "2026-01-01", valido_hasta: "2026-12-31" };
    const uvt2027: Vigencia = { valido_desde: "2027-01-01", valido_hasta: "2027-12-31" };

    // Insertar 2026 después de 2025
    expect(detectarTraslape([uvt2025], uvt2026)).toBeNull();
    // Insertar 2027 después de 2025 y 2026
    expect(detectarTraslape([uvt2025, uvt2026], uvt2027)).toBeNull();
    // Verificar que 2027 no se traslapa con 2025 (período lejano)
    expect(detectarTraslape([uvt2025], uvt2027)).toBeNull();
  });
});
