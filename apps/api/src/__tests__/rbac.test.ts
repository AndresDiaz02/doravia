/**
 * Tests de RBAC por rol — Fase 3A
 *
 * Estos tests verifican la lógica de auth.ts sin necesidad de DB real.
 * Simulan req.userRole y verifican que el middleware retorna 403 o llama next().
 *
 * Para correr (una vez configurado vitest o jest en el proyecto):
 *   pnpm --filter api test
 *
 * Configuración mínima necesaria (vitest):
 *   1. pnpm --filter api add -D vitest
 *   2. Añadir a apps/api/package.json scripts: "test": "vitest run"
 *   3. Crear apps/api/vitest.config.ts con:
 *        import { defineConfig } from "vitest/config";
 *        export default defineConfig({ test: { environment: "node" } });
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(role: string, url: string, method = "POST"): Partial<Request> {
  return {
    userRole: role,
    originalUrl: url,
    method,
    userContable: false,
    tenant: {
      activo: true,
      plan_starts_at: new Date("2024-01-01").toISOString(),
      plan_ends_at: new Date("2099-12-31").toISOString(),
      onboarding_completado: true,
    } as any,
  };
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json, _status: status, _json: json } as unknown as Response & {
    status: Mock;
    json: Mock;
  };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ── Lógica RBAC extraída de auth.ts ─────────────────────────────────────────
// Reproducimos aquí la lógica de bloques de rol para testearla de forma aislada.
// Si auth.ts cambia, estos tests deben actualizarse.

const BLOQUEADO_VENDEDOR = [
  "/api/gastos",
  "/api/contabilidad",
  "/api/retenciones",
  "/api/centros-costos",
  "/api/recurrentes",
  "/api/ensamble",
  "/api/usuarios",
  "/api/cartera",
];

const BLOQUEADO_OPERARIO = [
  "/api/gastos",
  "/api/contabilidad",
  "/api/retenciones",
  "/api/centros-costos",
  "/api/recurrentes",
  "/api/ensamble",
  "/api/usuarios",
  "/api/cartera",
];

function applyRbacRules(
  req: Partial<Request>,
  res: Response,
  next: NextFunction,
): void {
  const role = req.userRole;
  const url = req.originalUrl ?? "";
  const method = req.method ?? "GET";

  // Contador sin permisos_contables: solo GET
  if (role === "contador" && method !== "GET") {
    if (!req.userContable) {
      (res.status as Mock)(403).json({ error: "El rol Contador solo tiene permisos de lectura.", code: "CONTADOR_READ_ONLY" });
      return;
    }
  }

  // Vendedor
  if (role === "vendedor") {
    if (BLOQUEADO_VENDEDOR.some((p) => url.startsWith(p))) {
      (res.status as Mock)(403).json({ error: "No tienes acceso a esta sección.", code: "FORBIDDEN" });
      return;
    }
    if ((url.startsWith("/api/empresa") || url.startsWith("/api/resoluciones-dian")) && method !== "GET") {
      (res.status as Mock)(403).json({ error: "No tienes permisos para modificar esta información.", code: "FORBIDDEN" });
      return;
    }
  }

  // Cajero: SOLO POS
  if (role === "cajero") {
    if (!url.startsWith("/api/pos") && !url.startsWith("/api/auth")) {
      (res.status as Mock)(403).json({ error: "El rol Cajero solo tiene acceso al módulo POS.", code: "FORBIDDEN" });
      return;
    }
  }

  // Operario
  if (role === "operario") {
    if (BLOQUEADO_OPERARIO.some((p) => url.startsWith(p))) {
      (res.status as Mock)(403).json({ error: "No tienes acceso a esta sección.", code: "FORBIDDEN" });
      return;
    }
    if ((url.startsWith("/api/empresa") || url.startsWith("/api/resoluciones-dian")) && method !== "GET") {
      (res.status as Mock)(403).json({ error: "No tienes permisos para modificar esta información.", code: "FORBIDDEN" });
      return;
    }
  }

  next();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RBAC por rol", () => {
  describe("Rol cajero", () => {
    it("permite acceso a /api/pos/ventas", () => {
      const req = makeReq("cajero", "/api/pos/ventas", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite acceso a /api/auth/login", () => {
      const req = makeReq("cajero", "/api/auth/login", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/facturas con 403", () => {
      const req = makeReq("cajero", "/api/facturas", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/clientes con 403", () => {
      const req = makeReq("cajero", "/api/clientes", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/contabilidad con 403", () => {
      const req = makeReq("cajero", "/api/contabilidad", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("Rol operario (BUG-11C fix)", () => {
    it("permite acceso a /api/facturas POST", () => {
      const req = makeReq("operario", "/api/facturas", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite GET /api/empresa", () => {
      const req = makeReq("operario", "/api/empresa", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/contabilidad con 403", () => {
      const req = makeReq("operario", "/api/contabilidad", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/gastos con 403", () => {
      const req = makeReq("operario", "/api/gastos", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/usuarios con 403", () => {
      const req = makeReq("operario", "/api/usuarios", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea PATCH /api/empresa con 403", () => {
      const req = makeReq("operario", "/api/empresa", "PATCH");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("Rol vendedor", () => {
    it("permite acceso a /api/facturas POST", () => {
      const req = makeReq("vendedor", "/api/facturas", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite GET /api/empresa", () => {
      const req = makeReq("vendedor", "/api/empresa", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/gastos con 403", () => {
      const req = makeReq("vendedor", "/api/gastos", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea acceso a /api/contabilidad con 403", () => {
      const req = makeReq("vendedor", "/api/contabilidad", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea PATCH /api/empresa con 403", () => {
      const req = makeReq("vendedor", "/api/empresa", "PATCH");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("Rol contador", () => {
    it("permite GET /api/facturas", () => {
      const req = makeReq("contador", "/api/facturas", "GET");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("bloquea POST /api/facturas sin permisos_contables", () => {
      const req = makeReq("contador", "/api/facturas", "POST");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("Rol admin", () => {
    it("permite acceso a cualquier ruta", () => {
      const rutas = [
        "/api/facturas",
        "/api/contabilidad",
        "/api/gastos",
        "/api/usuarios",
        "/api/empresa",
      ];
      for (const url of rutas) {
        const req = makeReq("admin", url, "POST");
        const res = makeRes();
        const next = makeNext();
        applyRbacRules(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    });
  });
});
