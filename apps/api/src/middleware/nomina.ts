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
 * Nómina es una línea de producto independiente del plan ERP/POS/Origen del tenant
 * (req.tenant.plan). El estado de suscripción vive en pool_documentos_nomina_tenant,
 * asignado desde el Panel Fundador. Sin fila en esa tabla, el tenant no tiene nómina activa.
 */
export async function requireNominaActivo(req: Request, res: Response, next: NextFunction) {
  // Nómina electrónica aún no se comercializa ni se opera en producción. El
  // proveedor no ha confirmado el contrato de emisión y habilitarla a un tenant
  // por accidente tendría impacto laboral/fiscal. Conservamos el código para el
  // roadmap, pero cerramos toda la superficie operativa hasta su lanzamiento.
  return res.status(503).json({
    error: "Nómina electrónica estará disponible próximamente. Aún no está habilitada para operación.",
    code: "NOMINA_COMING_SOON",
  });

  /* c8 ignore next -- flujo reservado para la activación comercial futura
  try {
    const [pool] = await db
      .select()
      .from(pool_documentos_nomina_tenant)
      .where(eq(pool_documentos_nomina_tenant.tenant_id, req.tenantId))
      .limit(1);

    if (!pool) {
      return res.status(403).json({
        error: "Tu empresa no tiene nómina electrónica activa. Contacta a soporte para contratar un plan de nómina.",
        code: "NOMINA_NOT_ACTIVE",
      });
    }

    req.nominaPool = pool;
    next();
  } catch (err) {
    next(err);
  } */
}
