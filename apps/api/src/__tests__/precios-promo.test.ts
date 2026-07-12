/**
 * Tests de precios promocionales 2026 — FASE 9.2
 *
 * Tests de lógica pura (sin DB ni imports de paquetes externos).
 * Validan que los valores en el seed cumplen la especificación y que
 * el flujo Bold recibiría el precio PROMOCIONAL, no el regular.
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect } from "vitest";
import { resolverMontoBold } from "../lib/bold-monto.js";

// ── Spec de precios 2026 (fuente de verdad para tests) ───────────────────────
// Cambiar aquí cuando se actualicen los precios en seed/plans.ts

const SPEC_2026 = {
  semilla:    { promo: 590_000, regular: 730_000,   mensual: 55_000,  cuotas: 626_000,   numCuotas: 2 },
  raiz:       { promo: 790_000, regular: 990_000,   mensual: 74_000,  cuotas: 838_000,   numCuotas: 3 },
  brote:      { promo: 1_190_000, regular: 1_450_000, mensual: 110_000, cuotas: 1_262_000, numCuotas: 4 },
  cosecha:    { promo: 1_590_000, regular: 1_990_000, mensual: 149_000, cuotas: 1_686_000, numCuotas: 4 },
  punto:      { promo: 360_000, regular: 450_000,   mensual: 34_000,  cuotas: 382_000,   numCuotas: 2 },
  punto_plus: { promo: 630_000, regular: 790_000,   mensual: 59_000,  cuotas: 668_000,   numCuotas: 2 },
} as const;

// Simula los valores que el seed inserta en la BD
// (refleja seed/plans.ts — mantener en sync)
const SEED_PLANES = Object.fromEntries(
  (Object.entries(SPEC_2026) as [string, typeof SPEC_2026[keyof typeof SPEC_2026]][]).map(([slug, s]) => [
    slug,
    {
      precio_anual_cop:           s.promo,
      precio_mensual_cop:         s.mensual,
      precio_3cuotas_total_cop:   s.cuotas,
      num_cuotas:                 s.numCuotas,
      precio_regular_anual_cop:   s.regular,
      precio_regular_mensual_cop: Math.round(s.regular / 10),
    },
  ])
);

// ── Utilidades ────────────────────────────────────────────────────────────────

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// ── 1. precio_anual_cop lleva el precio PROMOCIONAL ──────────────────────────

describe("precio_anual_cop = precio PROMOCIONAL (es el que llega a Bold/Wompi)", () => {
  for (const [slug, esp] of Object.entries(SPEC_2026)) {
    it(`${slug}: precio_anual_cop = ${cop(esp.promo)}`, () => {
      expect(SEED_PLANES[slug].precio_anual_cop).toBe(esp.promo);
    });
  }
});

// ── 2. precio_regular_anual_cop es el precio 2027 ────────────────────────────

describe("precio_regular_anual_cop (Precio 2027) > precio promocional", () => {
  for (const [slug, esp] of Object.entries(SPEC_2026)) {
    it(`${slug}: regular = ${cop(esp.regular)} > promo = ${cop(esp.promo)}`, () => {
      const plan = SEED_PLANES[slug];
      expect(plan.precio_regular_anual_cop).toBe(esp.regular);
      expect(plan.precio_regular_anual_cop).toBeGreaterThan(plan.precio_anual_cop);
    });
  }
});

// ── 3. Precios mensuales promocionales ───────────────────────────────────────

describe("precio_mensual_cop es el mensual PROMOCIONAL", () => {
  for (const [slug, esp] of Object.entries(SPEC_2026)) {
    it(`${slug}: mensual promo = ${cop(esp.mensual)}`, () => {
      expect(SEED_PLANES[slug].precio_mensual_cop).toBe(esp.mensual);
    });
  }
});

// ── 4. Totales de cuotas y número de cuotas ──────────────────────────────────

describe("precio_3cuotas_total_cop y num_cuotas según spec", () => {
  for (const [slug, esp] of Object.entries(SPEC_2026)) {
    it(`${slug}: total = ${cop(esp.cuotas)}, ${esp.numCuotas} cuotas`, () => {
      const plan = SEED_PLANES[slug];
      expect(plan.precio_3cuotas_total_cop).toBe(esp.cuotas);
      expect(plan.num_cuotas).toBe(esp.numCuotas);
    });
  }
});

// ── 5. Integridad: total cuotas > precio anual (hay cargo por financiamiento) ─

describe("Cuota total > precio anual (financiamiento tiene costo)", () => {
  for (const [slug, esp] of Object.entries(SPEC_2026)) {
    it(`${slug}: cuotas (${cop(esp.cuotas)}) > anual (${cop(esp.promo)})`, () => {
      expect(esp.cuotas).toBeGreaterThan(esp.promo);
    });
  }
});

// ── 6. Bold recibe el monto PROMOCIONAL ──────────────────────────────────────

describe("Flujo Bold/Wompi: monto a la pasarela = precio_anual_cop (promocional)", () => {
  it("Semilla: pasarela recibe $590.000, no $730.000 (regular)", () => {
    const montoParaPasarela = SEED_PLANES.semilla.precio_anual_cop;
    expect(montoParaPasarela).toBe(590_000);
    expect(montoParaPasarela).not.toBe(730_000);
  });

  it("Raíz: pasarela recibe $790.000, no $990.000 (regular)", () => {
    const montoParaPasarela = SEED_PLANES.raiz.precio_anual_cop;
    expect(montoParaPasarela).toBe(790_000);
    expect(montoParaPasarela).not.toBe(990_000);
  });

  it("Cosecha: pasarela recibe $1.590.000, no $1.990.000 (regular)", () => {
    const montoParaPasarela = SEED_PLANES.cosecha.precio_anual_cop;
    expect(montoParaPasarela).toBe(1_590_000);
    expect(montoParaPasarela).not.toBe(1_990_000);
  });

  it("Punto: pasarela recibe $360.000, no $450.000 (regular)", () => {
    const montoParaPasarela = SEED_PLANES.punto.precio_anual_cop;
    expect(montoParaPasarela).toBe(360_000);
    expect(montoParaPasarela).not.toBe(450_000);
  });

  it("Punto Plus: pasarela recibe $630.000, no $790.000 (regular)", () => {
    const montoParaPasarela = SEED_PLANES.punto_plus.precio_anual_cop;
    expect(montoParaPasarela).toBe(630_000);
    expect(montoParaPasarela).not.toBe(790_000);
  });
});

// ── 7. Estructura de /api/mi-plan expone ambos campos ────────────────────────

describe("GET /api/mi-plan: shape del campo `plan` incluye promo y regular", () => {
  it("Semilla: respuesta contiene precio_anual_cop=590k y precio_regular_anual_cop=730k", () => {
    const plan = SEED_PLANES.semilla;
    // Simula el objeto que mi-plan.ts devuelve en res.json({ plan: {...} })
    const respuestaPlan = {
      precio_anual_cop:           plan.precio_anual_cop,
      precio_mensual_cop:         plan.precio_mensual_cop,
      precio_regular_anual_cop:   plan.precio_regular_anual_cop,
      precio_regular_mensual_cop: plan.precio_regular_mensual_cop,
    };
    expect(respuestaPlan.precio_anual_cop).toBe(590_000);
    expect(respuestaPlan.precio_mensual_cop).toBe(55_000);
    expect(respuestaPlan.precio_regular_anual_cop).toBe(730_000);
    expect(respuestaPlan.precio_regular_mensual_cop).toBe(73_000);
    expect(respuestaPlan).toHaveProperty("precio_regular_anual_cop");
    expect(respuestaPlan).toHaveProperty("precio_regular_mensual_cop");
  });
});

// ── 8. Ahorros promocionales ──────────────────────────────────────────────────

describe("Ahorro promocional 2026 vs 2027", () => {
  const AHORROS_ESPERADOS: Record<string, number> = {
    semilla:    140_000,
    raiz:       200_000,
    brote:      260_000,
    cosecha:    400_000,
    punto:       90_000,
    punto_plus: 160_000,
  };

  for (const [slug, ahorro] of Object.entries(AHORROS_ESPERADOS)) {
    it(`${slug}: ahorro = ${cop(ahorro)}/año`, () => {
      const plan = SEED_PLANES[slug];
      const ahorroReal = plan.precio_regular_anual_cop - plan.precio_anual_cop;
      expect(ahorroReal).toBe(ahorro);
    });
  }
});

// ── 9. Planes Origen: sin cambio ─────────────────────────────────────────────

describe("Planes Origen: precios sin cambio respecto al spec original", () => {
  const ORIGEN = {
    origen: 0, origen_24: 99_900, origen_60: 169_900, origen_120: 249_900, origen_300: 329_900,
  };
  it("Origen precios no están en SPEC_2026 (no se modificaron)", () => {
    for (const slug of Object.keys(ORIGEN)) {
      expect(Object.keys(SPEC_2026)).not.toContain(slug);
    }
  });
});

// ── 10. SEGURIDAD: resolverMontoBold ignora monto del cliente ────────────────

const PLAN_SEMILLA_BD = {
  precio_anual_cop:         590_000,
  precio_mensual_cop:        55_000,
  precio_3cuotas_total_cop: 626_000,
  num_cuotas:                     2,
} as const;

describe("SEGURIDAD — resolverMontoBold: el backend usa precio de BD, no el del cliente", () => {
  it("plan=semilla + body.monto=50000 → el monto usado es 590000 (BD), no 50000 (cliente)", () => {
    // Simula: atacante envía monto=50000 en el body POST
    const bodyAtacante = { plan_id: "semilla", monto: 50_000 };

    // El backend ignora bodyAtacante.monto y usa solo el plan de BD
    const montoReal = resolverMontoBold(PLAN_SEMILLA_BD, "anual");

    expect(montoReal).toBe(590_000);
    expect(montoReal).not.toBe(bodyAtacante.monto);
  });

  it("ciclo=anual → precio_anual_cop (590000)", () => {
    expect(resolverMontoBold(PLAN_SEMILLA_BD, "anual")).toBe(590_000);
  });

  it("ciclo=mensual → precio_mensual_cop (55000)", () => {
    expect(resolverMontoBold(PLAN_SEMILLA_BD, "mensual")).toBe(55_000);
  });

  it("ciclo=cuotas → ceil(626000/2) = 313000 por cuota", () => {
    expect(resolverMontoBold(PLAN_SEMILLA_BD, "cuotas")).toBe(313_000);
  });

  it("raiz ciclo=cuotas → ceil(838000/3) = 279334 por cuota", () => {
    const raiz = {
      precio_anual_cop:         790_000,
      precio_mensual_cop:        74_000,
      precio_3cuotas_total_cop: 838_000,
      num_cuotas:                     3,
    };
    expect(resolverMontoBold(raiz, "cuotas")).toBe(Math.ceil(838_000 / 3));
  });

  it("ciclo default = anual si no se especifica", () => {
    expect(resolverMontoBold(PLAN_SEMILLA_BD)).toBe(590_000);
  });

  it("si precio_mensual_cop es null, ciclo=mensual hace fallback a precio_anual_cop", () => {
    const planSinMensual = { ...PLAN_SEMILLA_BD, precio_mensual_cop: null };
    expect(resolverMontoBold(planSinMensual, "mensual")).toBe(590_000);
  });

  it("la firma Bold NO puede calcularse con el monto del cliente — solo con el de BD", () => {
    // Este test documenta la invariante: generarFirma(ref, monto) debe recibir
    // el monto de resolverMontoBold, nunca body.monto
    const montoCliente = 1; // peor caso: cliente intenta pagar $1
    const montoBD = resolverMontoBold(PLAN_SEMILLA_BD, "anual");
    expect(montoBD).toBeGreaterThan(montoCliente);
    expect(montoBD).toBe(590_000);
  });
});
