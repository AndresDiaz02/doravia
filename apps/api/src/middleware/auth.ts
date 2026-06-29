import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service.js";
import type { TenantWithPlan } from "../lib/tenant.js";
import { getTenantWithPlan } from "../lib/tenant.js";

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

  if (!req.tenant.activo) {
    return res.status(403).json({
      error: "La empresa está inactiva. Contacta a soporte.",
      code: "TENANT_INACTIVE",
    });
  }

  if (new Date(req.tenant.plan_ends_at) < new Date()) {
    return res.status(403).json({
      error: "Tu suscripción ha vencido. Renueva tu plan para continuar usando Doravia.",
      code: "SUBSCRIPTION_EXPIRED",
    });
  }

  // Bloqueo por onboarding incompleto después de 2 días de activación
  // Excluye rutas de onboarding y auth para no crear un loop
  const esRutaOnboarding = req.originalUrl.startsWith("/api/empresa") ||
    req.originalUrl.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/api/onboarding") ||
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
  if (req.userRole === "contador" && req.method !== "GET") {
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
    ];
    if (BLOQUEADO.some((p) => url.startsWith(p))) {
      return res.status(403).json({ error: "No tienes acceso a esta sección.", code: "FORBIDDEN" });
    }
    // Empresa y DIAN: solo lectura
    if (
      (url.startsWith("/api/empresa") || url.startsWith("/api/resoluciones-dian")) &&
      req.method !== "GET"
    ) {
      return res.status(403).json({ error: "No tienes permisos para modificar esta información.", code: "FORBIDDEN" });
    }
  }

  next();
}
