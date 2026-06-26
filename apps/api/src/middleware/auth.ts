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
      tenant: TenantWithPlan;
    }
  }
}

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

  next();
}
