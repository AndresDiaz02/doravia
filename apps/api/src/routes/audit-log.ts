import { Router } from "express";
import { db, audit_log, users } from "@workspace/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden ver el registro de auditoría." });
  }
  next();
}

router.use(requireAdmin);

// GET /api/audit-log?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&accion=&page=1&limit=50
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;
    const accionFiltro = req.query.accion as string | undefined;

    const condiciones = [eq(audit_log.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(audit_log.created_at, new Date(desde)));
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59, 999);
      condiciones.push(lte(audit_log.created_at, h));
    }
    if (accionFiltro) condiciones.push(eq(audit_log.accion, accionFiltro));

    const rows = await db
      .select({
        id: audit_log.id,
        accion: audit_log.accion,
        entidad_tipo: audit_log.entidad_tipo,
        entidad_id: audit_log.entidad_id,
        detalle: audit_log.detalle,
        ip: audit_log.ip,
        created_at: audit_log.created_at,
        usuario_nombre: users.nombre,
        usuario_email: users.email,
      })
      .from(audit_log)
      .leftJoin(users, eq(audit_log.user_id, users.id))
      .where(and(...condiciones))
      .orderBy(desc(audit_log.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ data: rows, page, limit });
  } catch (err) {
    console.error("Error en GET /audit-log:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
