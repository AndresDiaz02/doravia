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
//
// Rutas de escritura autenticadas en /api/auth/ que el contador puede usar:
//   PATCH /api/auth/password    — cambiar su propia contraseña
//   PATCH /api/auth/preferencias — dark_mode y preferencias de UI
//   POST  /api/auth/cambiar-empresa — switch de empresa sin re-login
//   POST  /api/auth/verify-fundador-pin — bloqueado por lógica interna (FUNDADOR_EMAILS)
//
// Las demás rutas de /api/auth/ son públicas (no requieren authenticate).

const BLOQUEADO_VENDEDOR = [
  "/api/gastos",
  "/api/contabilidad",
  "/api/retenciones",
  "/api/centros-costos",
  "/api/recurrentes",
  "/api/ensamble",
  "/api/usuarios",
  "/api/cartera",
  "/api/activos-fijos",
  "/api/documentos-soporte",
  "/api/retenciones-proveedor",
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
  "/api/activos-fijos",
  "/api/documentos-soporte",
  "/api/retenciones-proveedor",
];

const CONTABLE_WRITE_OK = [
  /^\/api\/contabilidad(\/|$)/,
  /^\/api\/gastos\//,
];

function applyRbacRules(
  req: Partial<Request>,
  res: Response,
  next: NextFunction,
): void {
  const role = req.userRole;
  const url = req.originalUrl ?? "";
  const method = req.method ?? "GET";

  // Contador: /api/auth/* siempre permitido (cambiar-empresa, password, preferencias)
  const esAuthPropia = url.startsWith("/api/auth/");

  // Contador sin permisos_contables: solo GET (excepto rutas /api/auth/)
  if (role === "contador" && method !== "GET" && !esAuthPropia) {
    if (!req.userContable) {
      (res.status as Mock)(403).json({ error: "El rol Contador solo tiene permisos de lectura.", code: "CONTADOR_READ_ONLY" });
      return;
    }
    // Con permisos_contables: solo contabilidad y gastos, nunca DELETE
    const contableOk = method !== "DELETE" && CONTABLE_WRITE_OK.some((re) => re.test(url));
    if (!contableOk) {
      (res.status as Mock)(403).json({ error: "El contador no tiene permisos para modificar este módulo.", code: "CONTADOR_READ_ONLY" });
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

  // Cajero: POS + auth + lista blanca explícita (debe mantenerse sincronizada con auth.ts)
  if (role === "cajero") {
    const esPOS         = url.startsWith("/api/pos");
    const esAuth        = url.startsWith("/api/auth");
    const esTutorial    = url.startsWith("/api/tutoriales");
    const esClientesGet = url.startsWith("/api/clientes") && method === "GET";
    const esBodegasGet  = url.startsWith("/api/bodegas")  && method === "GET";

    if (!esPOS && !esAuth && !esTutorial && !esClientesGet && !esBodegasGet) {
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
    // ── Rutas permitidas ─────────────────────────────────────────────────────
    it("permite POST /api/pos/ventas", () => {
      const req = makeReq("cajero", "/api/pos/ventas", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite POST /api/auth/login", () => {
      const req = makeReq("cajero", "/api/auth/login", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite GET /api/clientes para cargar lista de fiados", () => {
      // Venta.tsx carga GET /api/clientes?limit=500 al montar el componente
      const req = makeReq("cajero", "/api/clientes?limit=500", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite GET /api/bodegas para selección de caja", () => {
      // SeleccionCaja.tsx carga GET /api/bodegas al iniciar turno
      const req = makeReq("cajero", "/api/bodegas", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite GET /api/tutoriales/estado", () => {
      const req = makeReq("cajero", "/api/tutoriales/estado", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite POST /api/tutoriales/pos/completar", () => {
      const req = makeReq("cajero", "/api/tutoriales/pos/completar", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    // ── Rutas bloqueadas ─────────────────────────────────────────────────────
    it("bloquea POST /api/facturas → 403", () => {
      const req = makeReq("cajero", "/api/facturas", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea GET /api/contabilidad → 403", () => {
      const req = makeReq("cajero", "/api/contabilidad", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea POST /api/clientes (escritura) → 403", () => {
      // El cajero puede LEER clientes pero no crearlos
      const req = makeReq("cajero", "/api/clientes", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea PATCH /api/clientes/:id (escritura) → 403", () => {
      const req = makeReq("cajero", "/api/clientes/abc-123", "PATCH");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea POST /api/bodegas (escritura) → 403", () => {
      const req = makeReq("cajero", "/api/bodegas", "POST");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea GET /api/usuarios → 403", () => {
      const req = makeReq("cajero", "/api/usuarios", "GET");
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

    it("bloquea POST /api/facturas sin permisos_contables → 403", () => {
      const req = makeReq("contador", "/api/facturas", "POST");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea PATCH /api/clientes/:id sin permisos_contables → 403", () => {
      const req = makeReq("contador", "/api/clientes/abc-123", "PATCH");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea POST /api/gastos sin permisos_contables → 403", () => {
      const req = makeReq("contador", "/api/gastos", "POST");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    // Fix Fase 3B: rutas /api/auth/ siempre permitidas para contador (cambiar-empresa, password, logout)
    it("permite POST /api/auth/cambiar-empresa → pasa (acción de sesión)", () => {
      const req = makeReq("contador", "/api/auth/cambiar-empresa", "POST");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite PATCH /api/auth/password → pasa (cambiar contraseña propia)", () => {
      const req = makeReq("contador", "/api/auth/password", "PATCH");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite POST /api/auth/logout → pasa (cierre de sesión)", () => {
      const req = makeReq("contador", "/api/auth/logout", "POST");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite PATCH /api/auth/preferencias → pasa (preferencias UI)", () => {
      const req = makeReq("contador", "/api/auth/preferencias", "PATCH");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("bloquea escrituras fuera de /api/auth/ incluso si empieza similar → 403", () => {
      // Asegura que /api/auth-fake/ no pasa por la excepción
      const req = makeReq("contador", "/api/auth-tokens/crear", "POST");
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

    it("permite GET /api/activos-fijos al admin", () => {
      const req = makeReq("admin", "/api/activos-fijos", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("permite GET /api/retenciones-proveedor al admin", () => {
      const req = makeReq("admin", "/api/retenciones-proveedor", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("Módulos nuevos — RBAC en auth.ts", () => {
    it("bloquea vendedor en GET /api/activos-fijos → 403", () => {
      const req = makeReq("vendedor", "/api/activos-fijos", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea vendedor en GET /api/documentos-soporte → 403", () => {
      const req = makeReq("vendedor", "/api/documentos-soporte", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea vendedor en GET /api/retenciones-proveedor → 403", () => {
      const req = makeReq("vendedor", "/api/retenciones-proveedor", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea operario en GET /api/activos-fijos → 403", () => {
      const req = makeReq("operario", "/api/activos-fijos", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea operario en GET /api/retenciones-proveedor → 403", () => {
      const req = makeReq("operario", "/api/retenciones-proveedor", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea cajero en GET /api/activos-fijos → 403", () => {
      const req = makeReq("cajero", "/api/activos-fijos", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("bloquea cajero en GET /api/retenciones-proveedor → 403", () => {
      const req = makeReq("cajero", "/api/retenciones-proveedor", "GET");
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("contador puede GET /api/activos-fijos (solo lectura)", () => {
      const req = makeReq("contador", "/api/activos-fijos", "GET");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("contador sin permisos_contables bloqueado en POST /api/activos-fijos → 403", () => {
      const req = makeReq("contador", "/api/activos-fijos", "POST");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("contador puede GET /api/retenciones-proveedor (solo lectura)", () => {
      const req = makeReq("contador", "/api/retenciones-proveedor", "GET");
      req.userContable = false;
      const res = makeRes();
      const next = makeNext();
      applyRbacRules(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
