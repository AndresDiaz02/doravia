import { db, idempotency_keys } from "@workspace/db";
import { and, eq } from "drizzle-orm";

type Reserva =
  | { estado: "nueva"; clave: string }
  | { estado: "completada"; respuesta: Record<string, unknown> }
  | { estado: "procesando" };

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

/** La cabecera es opcional para no romper integraciones anteriores. */
export async function reservarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: unknown,
  executor: DbExecutor = db,
): Promise<Reserva | null> {
  if (typeof clave !== "string" || clave.length < 8 || clave.length > 200) return null;

  const [creada] = await executor.insert(idempotency_keys).values({
    tenant_id: tenantId,
    operacion,
    clave,
  }).onConflictDoNothing().returning();
  if (creada) return { estado: "nueva", clave };

  const [existente] = await executor.select().from(idempotency_keys).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
  )).limit(1);

  if (existente?.estado === "completada" && existente.respuesta && typeof existente.respuesta === "object") {
    return { estado: "completada", respuesta: existente.respuesta as Record<string, unknown> };
  }
  // Una operación que revirtió íntegramente puede reintentarse con la misma
  // llave. No se revive una operación aún en curso ni una ya completada.
  if (existente?.estado === "fallida") {
    const [recuperada] = await executor.update(idempotency_keys)
      .set({ estado: "procesando", respuesta: null, completed_at: null })
      .where(and(
        eq(idempotency_keys.id, existente.id),
        eq(idempotency_keys.estado, "fallida"),
      ))
      .returning({ id: idempotency_keys.id });
    if (recuperada) return { estado: "nueva", clave };
  }
  return { estado: "procesando" };
}

export async function completarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string | undefined,
  respuesta: Record<string, unknown>,
  executor: DbExecutor = db,
) {
  if (!clave) return;
  await executor.update(idempotency_keys).set({
    estado: "completada",
    respuesta,
    completed_at: new Date(),
  }).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
  ));
}

/** Libera una reserva cuyo trabajo local revirtió para permitir un reintento seguro. */
export async function fallarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string | undefined,
) {
  if (!clave) return;
  await db.update(idempotency_keys).set({ estado: "fallida", respuesta: null, completed_at: null }).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
    eq(idempotency_keys.estado, "procesando"),
  ));
}
