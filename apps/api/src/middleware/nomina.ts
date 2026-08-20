import type { Request, Response, NextFunction } from "express";
import { db, pool_documentos_nomina_tenant, product_subscriptions } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";

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
    const ahora = new Date();
    const [pool, subscription] = await Promise.all([
      db.select()
        .from(pool_documentos_nomina_tenant)
        .where(eq(pool_documentos_nomina_tenant.tenant_id, req.tenantId))
        .limit(1)
        .then((rows) => rows[0]),
      db.select({ id: product_subscriptions.id })
        .from(product_subscriptions)
        .where(and(
          eq(product_subscriptions.tenant_id, req.tenantId),
          eq(product_subscriptions.product, "nomina"),
          eq(product_subscriptions.status, "active"),
          gte(product_subscriptions.ends_at, ahora),
        ))
        .limit(1)
        .then((rows) => rows[0]),
    ]);

    if (!pool || !subscription) {
      return res.status(403).json({
        error: "Tu suscripción de nómina electrónica no está activa. Renueva o activa el producto para continuar.",
        code: "NOMINA_NOT_ACTIVE",
      });
    }

    req.nominaPool = pool;
    next();
  } catch (err) {
    next(err);
  }
}
