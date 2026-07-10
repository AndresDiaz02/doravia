// ⚠️  ARCHIVO DE SEGURIDAD — requiere revisión manual antes de merge.
// Cambios en este archivo afectan el acceso de TODOS los tenants.
// Cambios en FASE 2 (2026-07-10):
//   - Reemplaza chequeo `activo` + `plan_ends_at` por `subscription_status`
//   - 'archived'   → bloquea toda request (incluso contador)
//   - 'suspended'  → read-only para admin/vendedor/operario;
//                    contador y cajero conservan su acceso actual sin bloqueo adicional
//   - 'grace'      → pasa + header X-Doravia-Grace: true
//   - 'trial'/'active' → flujo normal sin cambio

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service.js";
import { debeBloquearRequest } from "../services/subscription.service.js";
import type { TenantWithPlan } from "../lib/tenant.js";
import { getTenantWithPlan } from "../lib/tenant.js";
import type { SubscriptionStatus } from "../services/subscription.service.js";

declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      userId: string;
      userRole: string;
      userContable: boolean;
      tenant: TenantWithPlan;
    }
  }
}

// Paths donde el contador con permisos_contables puede escribir (PATCH/POST)
const CONTABLE_WRITE_OK: RegExp[] = [
  /^\/api\/contabilidad(\/|$)/,
  /^\/api\/gastos\//,
];

// Rutas que nunca se bloquean por subscription_status (admin, onboarding, salud)
const RUTAS_LIBRES_SUSPENSION: RegExp[] = [
  /^\/api\/auth\//,
  /^\/api\/empresa(\/|$)/,
  /^\/api\/onboarding(\/|$)/,
  /^\/api\/notificaciones(\/|$)/,
  /^\/health/,
];

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Se requiere autenticación." });
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.tenantId = payload.tenantId;
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.userContable = payload.permisos_contables ?? false;
    req.tenant = await getTenantWithPlan(payload.tenantId);
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }

  // ── Enforcement por subscription_status ──────────────────────────────────────
  const status = (req.tenant.subscription_status ?? "active") as SubscriptionStatus;

  // archived: bloqueo total — ningún rol accede
  if (status === "archived") {
    return res.status(403).json({
      error: "Esta empresa ha sido archivada y ya no está disponible.",
      code: "TENANT_ARCHIVED",
    });
  }

  // suspended: read-only para roles que no son contador ni cajero
  // contador y cajero tienen su propio perímetro (ver bloques más abajo) — no añadir restricción aquí
  if (status === "suspended") {
    const esRutaLibre = RUTAS_LIBRES_SUSPENSION.some((re) => re.test(req.originalUrl));
    if (!esRutaLibre && debeBloquearRequest(status, req.userRole, req.method)) {
      return res.status(403).json({
        error:
          "Tu empresa está suspendida. Solo tienes acceso de lectura hasta regularizar el pago.",
        code: "TENANT_SUSPENDED",
      });
    }
  }

  // grace: permitir todo, informar al cliente vía header
  if (status === "grace") {
    res.setHeader("X-Doravia-Grace", "true");
  }

  // Bloqueo por onboarding incompleto después de 2 días de activación
  // Excluye rutas de onboarding y auth para no crear un loop
  const esRutaOnboarding =
    req.originalUrl.startsWith("/api/empresa") ||
    req.originalUrl.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/api/onboarding") ||
    req.originalUrl.startsWith("/api/fundador") ||
    req.originalUrl.startsWith("/health");
  if (!esRutaOnboarding && !req.tenant.onboarding_completado && req.tenant.plan_starts_at) {
    const msDesdeActivacion = Date.now() - new Date(req.tenant.plan_starts_at).getTime();
    const DOS_DIAS_MS = 2 * 24 * 60 * 60 * 1000;
    if (msDesdeActivacion > DOS_DIAS_MS) {
      return res.status(403).json({
        error: "Debes completar la configuración inicial de tu empresa para continuar.",
        code: "SETUP_REQUIRED",
      });
    }
  }

  // Rol Contador
  // /api/auth/cambiar-empresa es una acción de sesión, no de datos — siempre permitida
  const esAuthPropia = req.originalUrl.startsWith("/api/auth/");
  if (req.userRole === "contador" && req.method !== "GET" && !esAuthPropia) {
    if (!req.userContable) {
      return res.status(403).json({
        error: "El rol Contador solo tiene permisos de lectura.",
        code: "CONTADOR_READ_ONLY",
      });
    }
    // Contador con permisos contables: puede escribir en contabilidad y gastos solamente
    // DELETE nunca está permitido para el contador
    const url = req.originalUrl;
    const contableOk = req.method !== "DELETE" && CONTABLE_WRITE_OK.some((re) => re.test(url));
    if (!contableOk) {
      return res.status(403).json({
        error: "El contador no tiene permisos para modificar este módulo.",
        code: "CONTADOR_READ_ONLY",
      });
    }
  }

  // Rol Vendedor: sin acceso a módulos de contabilidad/administración
  if (req.userRole === "vendedor") {
    const url = req.originalUrl;
    const BLOQUEADO = [
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
    if (BLOQUEADO.some((p) => url.startsWith(p))) {
      return res.status(403).json({ error: "No tienes acceso a esta sección.", code: "FORBIDDEN" });
    }
    // Empresa y DIAN: solo lectura
    if (
      (url.startsWith("/api/empresa") || url.startsWith("/api/resoluciones-dian")) &&
      req.method !== "GET"
    ) {
      return res.status(403).json({
        error: "No tienes permisos para modificar esta información.",
        code: "FORBIDDEN",
      });
    }
  }

  // Rol Cajero: POS + auth + lista blanca explícita de lo que la app POS consume fuera de /api/pos/
  // /api/clientes  — GET para cargar lista de clientes al registrar fiados (Venta.tsx)
  // /api/bodegas   — GET para cargar bodegas al seleccionar caja (SeleccionCaja.tsx)
  // /api/tutoriales — GET/POST para estado y completar/saltar el tutorial de onboarding
  // /api/notificaciones — GET/PATCH para campana in-app POS
  if (req.userRole === "cajero") {
    const url = req.originalUrl;
    const esPOS = url.startsWith("/api/pos");
    const esAuth = url.startsWith("/api/auth");
    const esTutorial = url.startsWith("/api/tutoriales");
    const esClientesGet = url.startsWith("/api/clientes") && req.method === "GET";
    const esBodegasGet = url.startsWith("/api/bodegas") && req.method === "GET";
    const esNotifCajero =
      url.startsWith("/api/notificaciones") &&
      (req.method === "GET" || req.method === "PATCH");

    if (!esPOS && !esAuth && !esTutorial && !esClientesGet && !esBodegasGet && !esNotifCajero) {
      return res.status(403).json({
        error: "El rol Cajero solo tiene acceso al módulo POS.",
        code: "FORBIDDEN",
      });
    }
  }

  // Rol Operario: mismo perímetro que vendedor (BUG-11C fix)
  if (req.userRole === "operario") {
    const url = req.originalUrl;
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
    if (BLOQUEADO_OPERARIO.some((p) => url.startsWith(p))) {
      return res.status(403).json({ error: "No tienes acceso a esta sección.", code: "FORBIDDEN" });
    }
    if (
      (url.startsWith("/api/empresa") || url.startsWith("/api/resoluciones-dian")) &&
      req.method !== "GET"
    ) {
      return res.status(403).json({
        error: "No tienes permisos para modificar esta información.",
        code: "FORBIDDEN",
      });
    }
  }

  next();
}
