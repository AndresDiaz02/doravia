import * as Sentry from "@sentry/node";
import { db, tax_parameters } from "@workspace/db";
import { eq, and, lte, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

export class TaxParamValidationError extends Error {
  constructor(
    public readonly code: "TRASLAPE" | "FECHAS_INVALIDAS",
    message: string,
  ) {
    super(message);
    this.name = "TaxParamValidationError";
  }
}

export class TaxParamNotFoundError extends Error {
  constructor(parametro: string, fecha: string) {
    super(`No existe vigencia para el parámetro "${parametro}" en la fecha ${fecha}.`);
    this.name = "TaxParamNotFoundError";
  }
}

/**
 * Busca el valor vigente de un parámetro tributario a una fecha dada.
 * fecha: 'YYYY-MM-DD' (default: hoy en Bogotá)
 * Lanza TaxParamNotFoundError si ninguna vigencia cubre la fecha — nunca devuelve null.
 */
export async function getTaxParameter(
  parametro: string,
  fecha?: string,
): Promise<{ valor: string; unidad: string; fuente_normativa: string | null }> {
  const fechaQuery = fecha ?? new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select({
      valor: tax_parameters.valor,
      unidad: tax_parameters.unidad,
      fuente_normativa: tax_parameters.fuente_normativa,
    })
    .from(tax_parameters)
    .where(
      and(
        eq(tax_parameters.parametro, parametro),
        lte(tax_parameters.valido_desde, fechaQuery),
        gte(tax_parameters.valido_hasta, fechaQuery),
      ),
    )
    .limit(1);

  if (!row) {
    const err = new TaxParamNotFoundError(parametro, fechaQuery);
    Sentry.captureException(err, { level: "error", tags: { parametro, fecha: fechaQuery } });
    throw err;
  }

  return row;
}

/**
 * Valida e inserta un nuevo parámetro tributario.
 * Reglas R7:
 *   1. valido_hasta >= valido_desde
 *   2. No puede existir otra fila del mismo parámetro cuya vigencia se traslape con la nueva
 */
export async function insertTaxParameter(input: {
  parametro: string;
  descripcion: string;
  valor: string;
  unidad: string;
  valido_desde: string;
  valido_hasta: string;
  fuente_normativa?: string;
  creado_por?: string;
}): Promise<typeof tax_parameters.$inferSelect> {
  const { parametro, valido_desde, valido_hasta } = input;

  // Regla 1: fechas coherentes
  if (valido_hasta < valido_desde) {
    throw new TaxParamValidationError(
      "FECHAS_INVALIDAS",
      `valido_hasta (${valido_hasta}) no puede ser anterior a valido_desde (${valido_desde}).`,
    );
  }

  // Regla 2: sin traslape con vigencias existentes del mismo parámetro
  // Dos intervalos [a,b] y [c,d] se traslapan si a<=d AND c<=b
  const conflictos = await db
    .select({ id: tax_parameters.id, valido_desde: tax_parameters.valido_desde, valido_hasta: tax_parameters.valido_hasta })
    .from(tax_parameters)
    .where(
      and(
        eq(tax_parameters.parametro, parametro),
        lte(tax_parameters.valido_desde, valido_hasta),
        gte(tax_parameters.valido_hasta, valido_desde),
      ),
    );

  if (conflictos.length > 0) {
    const c = conflictos[0];
    throw new TaxParamValidationError(
      "TRASLAPE",
      `La vigencia [${valido_desde}, ${valido_hasta}] se traslapa con la existente [${c.valido_desde}, ${c.valido_hasta}] para el parámetro "${parametro}".`,
    );
  }

  const [inserted] = await db.insert(tax_parameters).values(input).returning();
  return inserted;
}

/** Devuelve todos los parámetros vigentes a una fecha dada (una fila por parámetro). */
export async function getAllTaxParameters(fecha?: string): Promise<(typeof tax_parameters.$inferSelect)[]> {
  const fechaQuery = fecha ?? new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(tax_parameters)
    .where(
      and(
        lte(tax_parameters.valido_desde, fechaQuery),
        gte(tax_parameters.valido_hasta, fechaQuery),
      ),
    )
    .orderBy(tax_parameters.parametro);
}

/** Devuelve el historial completo de un parámetro, ordenado por vigencia ascendente. */
export async function getHistorialParametro(parametro: string): Promise<(typeof tax_parameters.$inferSelect)[]> {
  return db
    .select()
    .from(tax_parameters)
    .where(eq(tax_parameters.parametro, parametro))
    .orderBy(tax_parameters.valido_desde);
}
