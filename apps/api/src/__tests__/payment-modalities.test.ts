/**
 * FASE 5 — Tests de modalidades de pago (puros, sin DB).
 *
 * Cubre:
 *   1. calcularDuracion — días por modalidad y cuota
 *   2. calcularMontoCuota — fórmulas de precio según spec
 *   3. Invariantes: mensual × 10 < 3cuotas total < anual × 1.11, cuota3 = residuo
 *   4. Todos los planes del catálogo verifican la fórmula
 */

import { describe, it, expect } from "vitest";
import { calcularDuracion, calcularMontoCuota } from "../services/subscription.service.js";

// ── Planes del catálogo (precio_anual_cop exacto del seed) ────────────────────
const PLANES = [
  { slug: "semilla",    anual: 730_000,   total3: 803_000   },
  { slug: "raiz",       anual: 990_000,   total3: 1_089_000 },
  { slug: "brote",      anual: 1_450_000, total3: 1_595_000 },
  { slug: "cosecha",    anual: 1_990_000, total3: 2_189_000 },
  { slug: "punto",      anual: 450_000,   total3: 495_000   },
  { slug: "punto_plus", anual: 790_000,   total3: 869_000   },
];

// ── 1. calcularDuracion ───────────────────────────────────────────────────────

describe("calcularDuracion", () => {
  it("anual siempre = 365 días", () => {
    expect(calcularDuracion("anual")).toBe(365);
    expect(calcularDuracion("anual", 1)).toBe(365);
  });

  it("mensual siempre = 30 días", () => {
    expect(calcularDuracion("mensual")).toBe(30);
    expect(calcularDuracion("mensual", 12)).toBe(30);
  });

  it("3cuotas: cuota 1 = 122 días", () => {
    expect(calcularDuracion("3cuotas", 1)).toBe(122);
  });

  it("3cuotas: cuota 2 = 122 días", () => {
    expect(calcularDuracion("3cuotas", 2)).toBe(122);
  });

  it("3cuotas: cuota 3 = 121 días", () => {
    expect(calcularDuracion("3cuotas", 3)).toBe(121);
  });

  it("3cuotas: suma de 3 cuotas = 365 días", () => {
    const total = calcularDuracion("3cuotas", 1) + calcularDuracion("3cuotas", 2) + calcularDuracion("3cuotas", 3);
    expect(total).toBe(365);
  });
});

// ── 2. calcularMontoCuota — plan Semilla ──────────────────────────────────────

describe("calcularMontoCuota — Semilla (730k anual)", () => {
  const anual = 730_000;
  const total3 = 803_000;

  it("anual = precio_anual_cop", () => {
    expect(calcularMontoCuota(anual, total3, "anual")).toBe(730_000);
  });

  it("mensual = round(anual / 10) = 73.000", () => {
    expect(calcularMontoCuota(anual, total3, "mensual")).toBe(73_000);
  });

  it("3cuotas cuota 1 = ceil(803000/3 / 100) * 100", () => {
    // 803000/3 = 267666.67 → ceil al 100 superior = 267700
    expect(calcularMontoCuota(anual, total3, "3cuotas", 1)).toBe(267_700);
  });

  it("3cuotas cuota 2 = misma que cuota 1", () => {
    expect(calcularMontoCuota(anual, total3, "3cuotas", 2)).toBe(267_700);
  });

  it("3cuotas cuota 3 = residuo (803000 - 267700 * 2 = 267600)", () => {
    expect(calcularMontoCuota(anual, total3, "3cuotas", 3)).toBe(267_600);
  });

  it("suma de 3 cuotas = total3", () => {
    const c1 = calcularMontoCuota(anual, total3, "3cuotas", 1);
    const c2 = calcularMontoCuota(anual, total3, "3cuotas", 2);
    const c3 = calcularMontoCuota(anual, total3, "3cuotas", 3);
    expect(c1 + c2 + c3).toBe(total3);
  });
});

// ── 3. Invariantes para todos los planes ──────────────────────────────────────

describe("Invariantes de precio para todos los planes del catálogo", () => {
  for (const { slug, anual, total3 } of PLANES) {
    it(`${slug}: mensual × 10 = anual`, () => {
      const mensual = calcularMontoCuota(anual, total3, "mensual");
      expect(mensual * 10).toBe(anual);
    });

    it(`${slug}: suma de 3 cuotas = precio_3cuotas_total (= anual × 1.10)`, () => {
      const c1 = calcularMontoCuota(anual, total3, "3cuotas", 1);
      const c2 = calcularMontoCuota(anual, total3, "3cuotas", 2);
      const c3 = calcularMontoCuota(anual, total3, "3cuotas", 3);
      expect(c1 + c2 + c3).toBe(total3);
    });

    it(`${slug}: 3cuotas total > anual (hay recargo del 10%)`, () => {
      expect(total3).toBeGreaterThan(anual);
    });

    it(`${slug}: cuota 1 = cuota 2 (múltiplo de 100)`, () => {
      const c1 = calcularMontoCuota(anual, total3, "3cuotas", 1);
      const c2 = calcularMontoCuota(anual, total3, "3cuotas", 2);
      expect(c1).toBe(c2);
      expect(c1 % 100).toBe(0);
    });

    it(`${slug}: cuota 1 ≥ ceil(total3/3) (redondeo al alza al 100 superior)`, () => {
      const c1 = calcularMontoCuota(anual, total3, "3cuotas", 1);
      expect(c1).toBeGreaterThanOrEqual(Math.ceil(total3 / 3));
    });
  }
});

// ── 4. Casos borde ────────────────────────────────────────────────────────────

describe("Casos borde", () => {
  it("3cuotas cuota sin argumento → cuota 1 (default)", () => {
    expect(calcularMontoCuota(730_000, 803_000, "3cuotas")).toBe(
      calcularMontoCuota(730_000, 803_000, "3cuotas", 1),
    );
  });

  it("calcularDuracion sin cuotaNumero → 1 (default, anual=365)", () => {
    expect(calcularDuracion("anual")).toBe(365);
  });

  it("anual devuelve precio_anual_cop exacto sin importar el cuota_numero", () => {
    expect(calcularMontoCuota(730_000, 803_000, "anual", 2)).toBe(730_000);
    expect(calcularMontoCuota(730_000, 803_000, "anual", 3)).toBe(730_000);
  });
});
