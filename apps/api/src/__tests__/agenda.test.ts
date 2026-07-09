/**
 * Tests de agenda de servicios — FASE 7
 *
 * Tests de lógica pura (sin DB, sin HTTP):
 * - Máquina de estados: transiciones válidas e inválidas
 * - wa.me links: formato y encoding
 * - RBAC: requireNotContador bloquea contador (403), permite admin/cajero
 * - Reportes: tasa de no-show calculada correctamente
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Máquina de estados (espejo de agenda.ts) ──────────────────────────────────

type EstadoCita =
  | "agendada" | "confirmada" | "en_atencion" | "lista_entrega"
  | "entregada_cobrada" | "no_show" | "cancelada";

const TRANSICIONES: Record<string, EstadoCita[]> = {
  agendada:           ["confirmada", "en_atencion", "no_show", "cancelada"],
  confirmada:         ["en_atencion", "no_show", "cancelada"],
  en_atencion:        ["lista_entrega", "cancelada"],
  lista_entrega:      ["entregada_cobrada", "cancelada"],
  entregada_cobrada:  [],
  no_show:            [],
  cancelada:          [],
  programada:         ["agendada", "en_atencion", "cancelada"],
  en_proceso:         ["lista_entrega", "cancelada"],
  completada:         [],
};

function esTransicionValida(desde: string, hacia: EstadoCita): boolean {
  return (TRANSICIONES[desde] ?? []).includes(hacia);
}

// ── wa.me link builder (espejo de agenda.ts) ──────────────────────────────────

function waLink(telefono: string, mensaje: string): string {
  const tel = telefono.replace(/\D/g, "");
  return tel
    ? `https://wa.me/57${tel}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
}

// ── Cálculo de tasa no-show ───────────────────────────────────────────────────

function tasaNoShow(total: number, noShows: number): number {
  return total > 0 ? Math.round((noShows / total) * 100) : 0;
}

// ── RBAC (espejo de middleware requireNotContador) ────────────────────────────

function makeReq(role: string): Partial<Request> {
  return { userRole: role } as unknown as Partial<Request>;
}

function makeRes(): { status: Mock; json: Mock; statusCode: number } {
  const res = { statusCode: 200 } as { statusCode: number; status: Mock; json: Mock };
  res.json = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockImplementation((code: number) => { res.statusCode = code; return res; });
  return res;
}

function requireNotContador(
  req: Partial<Request>,
  res: { status: Mock; json: Mock; statusCode: number },
  next: NextFunction,
) {
  if ((req as Request & { userRole: string }).userRole === "contador") {
    res.status(403).json({ error: "Acceso denegado para contadores." });
    return;
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Máquina de estados — transiciones válidas", () => {
  it("agendada → confirmada ✓", () => {
    expect(esTransicionValida("agendada", "confirmada")).toBe(true);
  });
  it("agendada → en_atencion ✓ (check-in directo)", () => {
    expect(esTransicionValida("agendada", "en_atencion")).toBe(true);
  });
  it("confirmada → en_atencion ✓", () => {
    expect(esTransicionValida("confirmada", "en_atencion")).toBe(true);
  });
  it("en_atencion → lista_entrega ✓", () => {
    expect(esTransicionValida("en_atencion", "lista_entrega")).toBe(true);
  });
  it("lista_entrega → entregada_cobrada ✓", () => {
    expect(esTransicionValida("lista_entrega", "entregada_cobrada")).toBe(true);
  });
  it("agendada → no_show ✓", () => {
    expect(esTransicionValida("agendada", "no_show")).toBe(true);
  });
  it("confirmada → no_show ✓", () => {
    expect(esTransicionValida("confirmada", "no_show")).toBe(true);
  });
  it("cualquier estado terminal → cancelada desde en_atencion ✓", () => {
    expect(esTransicionValida("en_atencion", "cancelada")).toBe(true);
  });
});

describe("Máquina de estados — transiciones inválidas", () => {
  it("agendada → entregada_cobrada ✗ (saltar estados)", () => {
    expect(esTransicionValida("agendada", "entregada_cobrada")).toBe(false);
  });
  it("entregada_cobrada → agendada ✗ (estado terminal)", () => {
    expect(esTransicionValida("entregada_cobrada", "agendada")).toBe(false);
  });
  it("no_show → confirmada ✗ (estado terminal)", () => {
    expect(esTransicionValida("no_show", "confirmada")).toBe(false);
  });
  it("cancelada → en_atencion ✗ (estado terminal)", () => {
    expect(esTransicionValida("cancelada", "en_atencion")).toBe(false);
  });
  it("en_atencion → no_show ✗ (ya inició, no puede ser no-show)", () => {
    expect(esTransicionValida("en_atencion", "no_show")).toBe(false);
  });
  it("lista_entrega → en_atencion ✗ (retroceso)", () => {
    expect(esTransicionValida("lista_entrega", "en_atencion")).toBe(false);
  });
});

describe("Máquina de estados — compatibilidad backward (estados legado)", () => {
  it("programada → agendada ✓", () => {
    expect(esTransicionValida("programada", "agendada")).toBe(true);
  });
  it("en_proceso → lista_entrega ✓", () => {
    expect(esTransicionValida("en_proceso", "lista_entrega")).toBe(true);
  });
  it("completada → agendada ✗ (terminal)", () => {
    expect(esTransicionValida("completada", "agendada")).toBe(false);
  });
});

describe("wa.me links — formato", () => {
  it("genera URL con número colombiano", () => {
    const url = waLink("3001234567", "Hola María, tu cita es mañana.");
    expect(url).toContain("https://wa.me/573001234567");
    expect(url).toContain(encodeURIComponent("Hola María, tu cita es mañana."));
  });

  it("normaliza número con guiones", () => {
    const url = waLink("300-123-4567", "Test");
    expect(url).toContain("https://wa.me/573001234567");
  });

  it("sin teléfono → URL sin número", () => {
    const url = waLink("", "Recordatorio");
    expect(url).toContain("https://wa.me/?text=");
    expect(url).not.toContain("5700");
  });

  it("codifica caracteres especiales en el mensaje", () => {
    const url = waLink("3109876543", "¡Rocky está listo! 🐾");
    expect(url).toContain("%C2%A1"); // ¡
    expect(url).toContain("3109876543");
  });
});

describe("Cálculo de tasa no-show", () => {
  it("10 citas, 2 no-shows → 20%", () => {
    expect(tasaNoShow(10, 2)).toBe(20);
  });

  it("0 citas → 0% (sin división por cero)", () => {
    expect(tasaNoShow(0, 0)).toBe(0);
  });

  it("redondeo: 1 de 3 → 33%", () => {
    expect(tasaNoShow(3, 1)).toBe(33);
  });

  it("alerta: ≥15% tasa alta", () => {
    const tasa = tasaNoShow(10, 2);
    expect(tasa).toBeGreaterThanOrEqual(15);
    // Con 1/10 = 10% — por debajo del umbral
    expect(tasaNoShow(10, 1)).toBeLessThan(15);
  });
});

describe("RBAC — requireNotContador", () => {
  it("bloquea a contadores con 403", () => {
    const req = makeReq("contador");
    const res = makeRes();
    const next = vi.fn();
    requireNotContador(req, res, next as unknown as NextFunction);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("permite a admin", () => {
    const req = makeReq("admin");
    const res = makeRes();
    const next = vi.fn();
    requireNotContador(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("permite a cajero", () => {
    const req = makeReq("cajero");
    const res = makeRes();
    const next = vi.fn();
    requireNotContador(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it("permite a vendedor", () => {
    const req = makeReq("vendedor");
    const res = makeRes();
    const next = vi.fn();
    requireNotContador(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("Nomenclatura de estados — resumen", () => {
  it("estados finalizados no permiten nuevas transiciones", () => {
    const terminales: EstadoCita[] = ["entregada_cobrada", "no_show", "cancelada"];
    for (const t of terminales) {
      expect(TRANSICIONES[t]).toEqual([]);
    }
  });

  it("todos los estados del ciclo feliz están cubiertos", () => {
    const cicloFeliz: EstadoCita[] = ["agendada", "confirmada", "en_atencion", "lista_entrega", "entregada_cobrada"];
    for (let i = 0; i < cicloFeliz.length - 1; i++) {
      expect(esTransicionValida(cicloFeliz[i], cicloFeliz[i + 1])).toBe(true);
    }
  });
});
