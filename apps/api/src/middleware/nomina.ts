import type { Request, Response, NextFunction } from "express";
import { db, pool_documentos_nomina_tenant } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      nominaPool?: typeof pool_documentos_nomina_tenant.$inferSelect;
    }
  }
}

/**
 * Payroll is an independent product from the ERP/POS plan. A tenant may use the
 * internal test workflow only when it has an active payroll allocation. Actual
 * electronic issuance remains protected by NOMINA_MODO in the payroll routes.
 */
export async function requireNominaActivo(req: Request, res: Response, next: NextFunction) {
  try {
    const [pool] = await db
      .select()
      .from(pool_documentos_nomina_tenant)
      .where(eq(pool_documentos_nomina_tenant.tenant_id, req.tenantId))
      .limit(1);

    if (!pool) {
      return res.status(403).json({
        error: "Tu empresa no tiene nomina electronica activa. Contacta a soporte para habilitar el modulo.",
        code: "NOMINA_NOT_ACTIVE",
      });
    }

    req.nominaPool = pool;
    next();
  } catch (err) {
    next(err);
  }
}
