import { createHash, randomUUID } from "node:crypto";
import { db, idempotency_keys } from "@workspace/db";
import { and, eq, isNull, lt, or } from "drizzle-orm";

const LEASE_MS = 2 * 60 * 1000;

type Reserva =
  | { estado: "nueva"; clave: string; leaseToken: string }
  | { estado: "completada"; respuesta: Record<string, unknown> }
  | { estado: "reconciliar"; referenciaId: string }
  | { estado: "procesando" }
  | { estado: "conflicto"; mensaje: string };

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function normalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, normalizar(value)]));
  }
  return valor;
}

/** Hash estable: el orden de propiedades no cambia la identidad de la solicitud. */
export function hashIdempotencyPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalizar(payload))).digest("hex");
}

function nuevoLease() {
  return { token: randomUUID(), expiresAt: new Date(Date.now() + LEASE_MS) };
}

/**
 * Reserva una operación de escritura. Una fila histórica sin hash nunca se
 * reutiliza: no es posible demostrar que el payload sea el mismo.
 */
export async function reservarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: unknown,
  requestHash?: string,
  executor: DbExecutor = db,
): Promise<Reserva | null> {
  if (typeof clave !== "string" || clave.length < 8 || clave.length > 200) return null;

  const lease = nuevoLease();
  // Compatibilidad temporal para operaciones ajenas a POS: preserva el
  // contrato existente. POS siempre entrega el hash de su payload real.
  const hashPersistido = requestHash ?? hashIdempotencyPayload({ operacion, clave });
  const [creada] = await executor.insert(idempotency_keys).values({
    tenant_id: tenantId,
    operacion,
    clave,
    request_hash: hashPersistido,
    lease_token: lease.token,
    lease_expires_at: lease.expiresAt,
  }).onConflictDoNothing().returning();
  if (creada) return { estado: "nueva", clave, leaseToken: lease.token };

  const [existente] = await executor.select().from(idempotency_keys).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
  )).limit(1);

  if (!existente?.request_hash && requestHash) {
    return { estado: "conflicto", mensaje: "La llave de idempotencia pertenece a una operación histórica que no puede verificarse. Usa una llave nueva." };
  }
  if (requestHash && existente.request_hash !== requestHash) {
    return { estado: "conflicto", mensaje: "La llave de idempotencia ya fue usada con una solicitud diferente." };
  }
  if (existente.estado === "completada" && existente.respuesta && typeof existente.respuesta === "object") {
    return { estado: "completada", respuesta: existente.respuesta as Record<string, unknown> };
  }

  // Una referencia persistida nunca se repite. El llamador debe verificar el
  // recurso y completar la reconciliación antes de devolver o reintentar.
  if (existente.referencia_id) return { estado: "reconciliar", referenciaId: existente.referencia_id };

  const expirado = !existente.lease_expires_at || existente.lease_expires_at < new Date();
  if (existente.estado === "fallida" || (existente.estado === "procesando" && expirado)) {
    const leaseRecuperado = nuevoLease();
    const condiciones = existente.estado === "fallida"
      ? and(eq(idempotency_keys.id, existente.id), eq(idempotency_keys.estado, "fallida"))
      : and(
          eq(idempotency_keys.id, existente.id),
          eq(idempotency_keys.estado, "procesando"),
          or(isNull(idempotency_keys.lease_expires_at), lt(idempotency_keys.lease_expires_at, new Date())),
        );
    const [recuperada] = await executor.update(idempotency_keys)
      .set({
        estado: "procesando",
        respuesta: null,
        completed_at: null,
        lease_token: leaseRecuperado.token,
        lease_expires_at: leaseRecuperado.expiresAt,
      })
      .where(condiciones)
      .returning({ id: idempotency_keys.id });
    if (recuperada) return { estado: "nueva", clave, leaseToken: leaseRecuperado.token };
  }

  return { estado: "procesando" };
}

export async function completarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string | undefined,
  respuesta: Record<string, unknown>,
  executor?: DbExecutor,
): Promise<void>;
export async function completarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string | undefined,
  leaseToken: string | undefined,
  respuesta: Record<string, unknown>,
  referenciaId: string,
  executor?: DbExecutor,
): Promise<void>;
export async function completarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string | undefined,
  leaseTokenOrRespuesta: string | Record<string, unknown> | undefined,
  respuestaOrExecutor?: Record<string, unknown> | DbExecutor,
  referenciaId?: string,
  executor: DbExecutor = db,
) {
  // Contrato antiguo, conservado para flujos no POS fuera del alcance P0.
  if (typeof leaseTokenOrRespuesta !== "string") {
    if (!clave || !leaseTokenOrRespuesta) return;
    const legacyExecutor = (respuestaOrExecutor && "update" in respuestaOrExecutor)
      ? respuestaOrExecutor as DbExecutor
      : executor;
    await legacyExecutor.update(idempotency_keys).set({
      estado: "completada",
      respuesta: leaseTokenOrRespuesta,
      completed_at: new Date(),
    }).where(and(
      eq(idempotency_keys.tenant_id, tenantId),
      eq(idempotency_keys.operacion, operacion),
      eq(idempotency_keys.clave, clave),
    ));
    return;
  }

  const leaseToken = leaseTokenOrRespuesta;
  const respuesta = respuestaOrExecutor as Record<string, unknown>;
  if (!clave || !leaseToken) return;
  const [completada] = await executor.update(idempotency_keys).set({
    estado: "completada",
    respuesta,
    referencia_id: referenciaId ?? null,
    lease_token: null,
    lease_expires_at: null,
    completed_at: new Date(),
  }).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
    eq(idempotency_keys.estado, "procesando"),
    eq(idempotency_keys.lease_token, leaseToken),
  )).returning({ id: idempotency_keys.id });
  if (!completada) throw new Error("La reserva de idempotencia ya no pertenece a esta operación.");
}

/** Completa una reserva que ya apunta a una venta persistida, sin crear otra. */
export async function reconciliarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string,
  referenciaId: string,
  respuesta: Record<string, unknown>,
) {
  const [reconciliada] = await db.update(idempotency_keys).set({
    estado: "completada",
    respuesta,
    lease_token: null,
    lease_expires_at: null,
    completed_at: new Date(),
  }).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
    eq(idempotency_keys.referencia_id, referenciaId),
  )).returning({ id: idempotency_keys.id });
  return Boolean(reconciliada);
}

/** Libera solamente el lease que pertenece a la operación que falló. */
export async function fallarIdempotencia(
  tenantId: string,
  operacion: string,
  clave: string | undefined,
  leaseToken: string | undefined,
) {
  if (!clave || !leaseToken) return;
  await db.update(idempotency_keys).set({
    estado: "fallida",
    respuesta: null,
    lease_token: null,
    lease_expires_at: null,
    completed_at: null,
  }).where(and(
    eq(idempotency_keys.tenant_id, tenantId),
    eq(idempotency_keys.operacion, operacion),
    eq(idempotency_keys.clave, clave),
    eq(idempotency_keys.estado, "procesando"),
    eq(idempotency_keys.lease_token, leaseToken),
  ));
}
