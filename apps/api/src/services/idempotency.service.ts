import { db, idempotency_keys } from "@workspace/db";
import { and, eq } from "drizzle-orm";

type Reserva =
  | { estado: "nueva"; clave: string }
  | { estado: "completada"; respuesta: Record<string, unknown> }
  | { estado: "procesando" };

/** La cabecera es opcional para no romper integraciones anteriores. */
export async function reservarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: unknown,
): Promise<Reserva | null> {
  if (typeof clave !== "string" || clave.length < 8 || clave.length > 200) return null;

  const [creada] = await db.insert(idempotency_keys).values({
    tenant_id: tenantId,
    operacion,
    clave,
  }).onConflictDoNothing().returning();
  if (creada) return { estado: "nueva", clave };

  const [existente] = await db.select().from(idempotency_keys).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
  )).limit(1);

  if (existente?.estado === "completada" && existente.respuesta && typeof existente.respuesta === "object") {
    return { estado: "completada", respuesta: existente.respuesta as Record<string, unknown> };
  }
  return { estado: "procesando" };
}

export async function completarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string | undefined,
  respuesta: Record<string, unknown>,
) {
  if (!clave) return;
  await db.update(idempotency_keys).set({
    estado: "completada",
    respuesta,
    completed_at: new Date(),
  }).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
  ));
}
