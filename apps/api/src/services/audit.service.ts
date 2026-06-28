import { db, audit_log } from "@workspace/db";

export interface AuditParams {
  tenantId: string | null;
  userId: string | null;
  accion: string;
  entidadTipo?: string;
  entidadId?: string;
  detalle?: Record<string, unknown>;
  ip?: string;
}

export async function audit(params: AuditParams): Promise<void> {
  try {
    await db.insert(audit_log).values({
      tenant_id: params.tenantId ?? undefined,
      user_id: params.userId ?? undefined,
      accion: params.accion,
      entidad_tipo: params.entidadTipo,
      entidad_id: params.entidadId,
      detalle: params.detalle,
      ip: params.ip,
    });
  } catch {
    // best-effort: no bloquear la operación principal si falla el log
  }
}
