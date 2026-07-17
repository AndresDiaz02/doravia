import { db, parametros_nomina_anuales } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export class ParametrosNominaValidationError extends Error {
  constructor(
    public readonly code: "DUPLICADO",
    message: string,
  ) {
    super(message);
    this.name = "ParametrosNominaValidationError";
  }
}

export class ParametrosNominaNotFoundError extends Error {
  constructor(ano: number) {
    super(`No hay parámetros de nómina cargados para el año ${ano}.`);
    this.name = "ParametrosNominaNotFoundError";
  }
}

/**
 * Parámetros de nómina vigentes para un año. Nunca devuelve null — lanza
 * ParametrosNominaNotFoundError si ese año no se ha cargado (mismo principio que tax_parameters).
 */
export async function getParametrosNominaAnio(
  ano: number,
): Promise<typeof parametros_nomina_anuales.$inferSelect> {
  const [row] = await db
    .select()
    .from(parametros_nomina_anuales)
    .where(eq(parametros_nomina_anuales.ano, ano))
    .limit(1);

  if (!row) throw new ParametrosNominaNotFoundError(ano);
  return row;
}

/**
 * Inserta los parámetros de un año nuevo. INMUTABLE — un año ya cargado no se puede
 * sobreescribir aquí (regla R7 de tax_parameters.ts aplica igual: nunca sobreescribir).
 */
export async function insertParametrosNominaAnio(
  input: typeof parametros_nomina_anuales.$inferInsert,
): Promise<typeof parametros_nomina_anuales.$inferSelect> {
  const existente = await db
    .select({ id: parametros_nomina_anuales.id })
    .from(parametros_nomina_anuales)
    .where(eq(parametros_nomina_anuales.ano, input.ano))
    .limit(1);

  if (existente.length > 0) {
    throw new ParametrosNominaValidationError(
      "DUPLICADO",
      `Ya existen parámetros de nómina cargados para el año ${input.ano}.`,
    );
  }

  const [inserted] = await db.insert(parametros_nomina_anuales).values(input).returning();
  return inserted;
}

/** Todos los años cargados, más reciente primero. */
export async function getAllParametrosNomina(): Promise<(typeof parametros_nomina_anuales.$inferSelect)[]> {
  return db.select().from(parametros_nomina_anuales).orderBy(desc(parametros_nomina_anuales.ano));
}
