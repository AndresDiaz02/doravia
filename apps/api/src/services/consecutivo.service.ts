import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Obtiene el siguiente consecutivo para una entidad del tenant,
 * usando una transacción con bloqueo (pg_advisory_xact_lock) para evitar
 * duplicados en inserciones concurrentes.
 *
 * El advisory lock es por (tabla, tenant_id): dos requests del mismo tenant
 * sobre la misma tabla se serializan; requests de tenants distintos o tablas
 * distintas corren en paralelo sin bloquearse entre sí.
 *
 * @param tabla - nombre de la tabla SQL (ej: "ventas_pos")
 * @param campoConsecutivo - nombre de la columna (ej: "consecutivo")
 * @param tenantId - UUID del tenant
 * @returns el siguiente número consecutivo (entero >= 1)
 */
export async function siguienteConsecutivo(
  tabla: string,
  campoConsecutivo: string,
  tenantId: string,
): Promise<number> {
  const resultado = await db.transaction(async (tx) => {
    // Adquiere un advisory lock exclusivo a nivel de transacción.
    // hashtext() produce un int4 estable para el par (tabla, tenantId).
    // El lock se libera automáticamente al final de la transacción.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${tabla}_${tenantId}`}))`,
    );

    // Ahora leemos el máximo con seguridad: ningún otro proceso puede
    // entrar aquí con el mismo (tabla, tenant) hasta que terminemos.
    const rows = await tx.execute(
      sql.raw(`
        SELECT COALESCE(MAX(${campoConsecutivo}), 0) + 1 AS siguiente
        FROM ${tabla}
        WHERE tenant_id = '${tenantId}'
      `),
    );

    // postgres-js driver devuelve un array directamente (no { rows: [] })
    const arr = rows as unknown as Array<{ siguiente: number | string }>;
    const row = arr[0];
    return Number(row?.siguiente ?? 1);
  });

  return resultado;
}
