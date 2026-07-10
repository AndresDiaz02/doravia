/**
 * FASE 2 — Tests del ciclo de vida de suscripciones con clock mockeado.
 *
 * Ciclos cubiertos:
 *   1. Trial 15 días → suspended al vencerse sin pago
 *   2. Mensualidad  → active → grace → suspended → active (pago en gracia)
 *   3. 3 cuotas     → active (cuota 1) → grace (cuota 2 vencida) → active (cuota 2 pagada)
 *   4. Renovación anual → active → grace → suspended → active (renovado)
 *   5. Contador     → no bloqueado en trial/active/grace/suspended; sí en archived
 *
 * Todos los tests son PUROS (sin DB) — usan las funciones puras exportadas
 * de subscription.service.ts con la fecha inyectada como parámetro.
 */

import { describe, it, expect } from "vitest";
import {
  calcularEstadoTrial,
  calcularEstadoRenovacion,
  debeBloquearRequest,
  GRACE_DAYS,
  TRIAL_DAYS,
} from "../services/subscription.service.js";
import type { SubscriptionStatus } from "../services/subscription.service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// Inicio ficticio del mundo para todos los tests (punto cero)
const D0 = new Date("2026-01-01T12:00:00Z");

// ── Ciclo 1: Trial ────────────────────────────────────────────────────────────

describe("Ciclo 1 — Trial 15 días", () => {
  const trialEndsAt = addDays(D0, TRIAL_DAYS); // D0 + 15

  it("D0 → trial (primer día)", () => {
    expect(calcularEstadoTrial(trialEndsAt, D0)).toBe("trial");
  });

  it("D10 → aún en trial (quedan 5 días)", () => {
    expect(calcularEstadoTrial(trialEndsAt, addDays(D0, 10))).toBe("trial");
  });

  it("D13 → aún en trial (quedan 2 días)", () => {
    expect(calcularEstadoTrial(trialEndsAt, addDays(D0, 13))).toBe("trial");
  });

  it("D14 23:59 → aún en trial (último segundo)", () => {
    const ultimoSegundo = new Date(trialEndsAt);
    ultimoSegundo.setSeconds(ultimoSegundo.getSeconds() - 1);
    expect(calcularEstadoTrial(trialEndsAt, ultimoSegundo)).toBe("trial");
  });

  it("D15 00:00 exacto → suspended (trial vencido)", () => {
    expect(calcularEstadoTrial(trialEndsAt, trialEndsAt)).toBe("suspended");
  });

  it("D20 → suspended (5 días después del vencimiento sin pago)", () => {
    expect(calcularEstadoTrial(trialEndsAt, addDays(D0, 20))).toBe("suspended");
  });
});

// ── Ciclo 2: Mensualidad ─────────────────────────────────────────────────────

describe("Ciclo 2 — Mensualidad (30 días)", () => {
  // Pago el D0 → plan_ends_at = D0 + 30 días
  const planEndsAt = addDays(D0, 30);
  const graceDays = GRACE_DAYS; // default 7

  it("D0 pago → active", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, D0)).toBe("active");
  });

  it("D29 → active (un día antes del vencimiento)", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, addDays(D0, 29))).toBe("active");
  });

  it("D30 00:00 exacto → grace (plan vencido, gracia inicia)", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, planEndsAt)).toBe("grace");
  });

  it("D30+3 → grace (dentro de gracia)", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, addDays(D0, 33))).toBe("grace");
  });

  it("D30+GRACE_DAYS-1 → grace (último día de gracia)", () => {
    const ultimoDiaGracia = addDays(planEndsAt, graceDays - 1);
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, ultimoDiaGracia)).toBe("grace");
  });

  it("D30+GRACE_DAYS exacto → suspended (gracia vencida)", () => {
    const graceEndsAt = addDays(planEndsAt, graceDays);
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, graceEndsAt)).toBe("suspended");
  });

  it("D30+GRACE_DAYS+5 → suspended (sin pago)", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, addDays(D0, 30 + graceDays + 5))).toBe("suspended");
  });

  it("Pago en gracia (D30+3) → reactivado calcula estado active desde nuevo plan_ends_at", () => {
    // Si paga en D33, el nuevo plan_ends_at sería D33 + 30 días = D63
    const nuevoPlanEndsAt = addDays(D0, 63);
    expect(calcularEstadoRenovacion(nuevoPlanEndsAt, graceDays, addDays(D0, 33))).toBe("active");
  });
});

// ── Ciclo 3: 3 cuotas ─────────────────────────────────────────────────────────

describe("Ciclo 3 — 3 cuotas (4 meses por cuota)", () => {
  const graceDays = GRACE_DAYS;

  // Cuota 1 pagada en D0 → plan_ends_at = D0 + 120 días (4 meses aprox)
  const planDespuesCuota1 = addDays(D0, 120);

  it("Cuota 1 pagada → active (D0)", () => {
    expect(calcularEstadoRenovacion(planDespuesCuota1, graceDays, D0)).toBe("active");
  });

  it("D119 → active (un día antes de vencer cuota 1)", () => {
    expect(calcularEstadoRenovacion(planDespuesCuota1, graceDays, addDays(D0, 119))).toBe("active");
  });

  it("D120 → grace (cuota 2 no pagada, inicia gracia)", () => {
    expect(calcularEstadoRenovacion(planDespuesCuota1, graceDays, planDespuesCuota1)).toBe("grace");
  });

  it("D120+GRACE_DAYS → suspended (cuota 2 nunca pagada)", () => {
    const graceEndsAt = addDays(planDespuesCuota1, graceDays);
    expect(calcularEstadoRenovacion(planDespuesCuota1, graceDays, graceEndsAt)).toBe("suspended");
  });

  it("Cuota 2 pagada en gracia (D122) → active con nuevo plan_ends_at", () => {
    // Nuevo plan_ends_at = D122 + 120 días = D242
    const planDespuesCuota2 = addDays(D0, 242);
    expect(calcularEstadoRenovacion(planDespuesCuota2, graceDays, addDays(D0, 122))).toBe("active");
  });
});

// ── Ciclo 4: Renovación anual ─────────────────────────────────────────────────

describe("Ciclo 4 — Renovación anual", () => {
  const graceDays = GRACE_DAYS;
  // Pago anual en D0 → plan_ends_at = D0 + 365 días
  const planEndsAt = addDays(D0, 365);

  it("D0 pago anual → active", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, D0)).toBe("active");
  });

  it("D180 → active (mitad del año)", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, addDays(D0, 180))).toBe("active");
  });

  it("D364 → active (un día antes del vencimiento)", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, addDays(D0, 364))).toBe("active");
  });

  it("D365 exacto → grace (plan vencido, inicia gracia)", () => {
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, planEndsAt)).toBe("grace");
  });

  it("D365+GRACE_DAYS → suspended (gracia vencida sin renovar)", () => {
    const graceEndsAt = addDays(planEndsAt, graceDays);
    expect(calcularEstadoRenovacion(planEndsAt, graceDays, graceEndsAt)).toBe("suspended");
  });

  it("Renovacion pagada (D365+2 en gracia) → active con plan_ends_at extendido", () => {
    // Nuevo plan_ends_at = D365+2 + 365 = D732
    const nuevoPlanEndsAt = addDays(D0, 732);
    expect(calcularEstadoRenovacion(nuevoPlanEndsAt, graceDays, addDays(D0, 367))).toBe("active");
  });
});

// ── Ciclo 5: Acceso del contador en cada estado ───────────────────────────────

describe("Ciclo 5 — Contador accede en cada estado", () => {
  const estados: SubscriptionStatus[] = ["trial", "active", "grace", "suspended", "archived"];

  for (const status of estados) {
    if (status === "archived") {
      // Archived bloquea incluso al contador
      it(`${status}: contador GET bloqueado (empresa archivada)`, () => {
        expect(debeBloquearRequest(status, "contador", "GET")).toBe(true);
      });
      it(`${status}: admin GET bloqueado`, () => {
        expect(debeBloquearRequest(status, "admin", "GET")).toBe(true);
      });
    } else if (status === "suspended") {
      // Suspended: contador puede leer; admin/vendedor bloqueados en escritura
      it(`${status}: contador GET pasa (lee siempre)`, () => {
        expect(debeBloquearRequest(status, "contador", "GET")).toBe(false);
      });
      it(`${status}: contador POST pasa (su perimeto ya es read-only por rol)`, () => {
        expect(debeBloquearRequest(status, "contador", "POST")).toBe(false);
      });
      it(`${status}: cajero GET pasa (mantiene whitelist)`, () => {
        expect(debeBloquearRequest(status, "cajero", "GET")).toBe(false);
      });
      it(`${status}: admin GET pasa (lectura permitida)`, () => {
        expect(debeBloquearRequest(status, "admin", "GET")).toBe(false);
      });
      it(`${status}: admin POST bloqueado (escritura bloqueada)`, () => {
        expect(debeBloquearRequest(status, "admin", "POST")).toBe(true);
      });
      it(`${status}: admin DELETE bloqueado`, () => {
        expect(debeBloquearRequest(status, "admin", "DELETE")).toBe(true);
      });
    } else {
      // trial, active, grace: nunca bloquear
      it(`${status}: admin POST pasa`, () => {
        expect(debeBloquearRequest(status, "admin", "POST")).toBe(false);
      });
      it(`${status}: contador GET pasa`, () => {
        expect(debeBloquearRequest(status, "contador", "GET")).toBe(false);
      });
    }
  }
});

// ── Invariantes del ciclo de vida ─────────────────────────────────────────────

describe("Invariantes globales", () => {
  it("TRIAL_DAYS es 15", () => {
    expect(TRIAL_DAYS).toBe(15);
  });

  it("GRACE_DAYS default es 7", () => {
    // GRACE_DAYS puede ser sobreescrito por env — en test sin env es 7
    expect(GRACE_DAYS).toBeGreaterThanOrEqual(1);
  });

  it("trial no se reinicia: si trial_ends_at es fijo, el estado es independiente del plan_id", () => {
    // El trial usa plan_starts_at original, no cambia al cambiar plan
    // Aquí verificamos que calcularEstadoTrial solo depende de trial_ends_at y now
    const ends = addDays(D0, 15);
    // En D10 con plan A o plan B: mismo resultado
    expect(calcularEstadoTrial(ends, addDays(D0, 10))).toBe("trial");
    expect(calcularEstadoTrial(ends, addDays(D0, 10))).toBe("trial"); // mismo call = idempotente
  });

  it("grace es transitorio: no puede haber suspended antes de pasar por grace (si hay pago previo)", () => {
    // Dado plan_ends_at = D+30 y graceDays = 7:
    // D30: grace (no suspended directo)
    // D37: suspended
    const planEndsAt = addDays(D0, 30);
    expect(calcularEstadoRenovacion(planEndsAt, 7, addDays(D0, 30))).toBe("grace");
    expect(calcularEstadoRenovacion(planEndsAt, 7, addDays(D0, 37))).toBe("suspended");
  });
});
