import { createHash } from "node:crypto";

/**
 * Calcula el CUFE (Código Único de Factura Electrónica) según la
 * Resolución DIAN 000042 de 2020, Anexo técnico versión 2.1.
 *
 * Fórmula: SHA-384( NumFac + FecFac + HorFac + ValFac + CodImp1 + ValImp1 +
 *                   CodImp2 + ValImp2 + CodImp3 + ValImp3 + ValTot +
 *                   NitOFE + NumAdq + ClaveTs )
 */
export interface CufeParams {
  /** Número de la factura, ej: "FV-0001" */
  numero: string;
  /** Fecha de emisión, ej: "2025-07-01" */
  fecha: string;
  /** Hora de emisión local Colombia, ej: "14:30:00" (sin timezone) */
  hora: string;
  /** Subtotal sin impuestos, 2 decimales */
  subtotal: number;
  /** IVA total (impuesto 01), 2 decimales */
  iva: number;
  /** Impuesto al consumo (04), 2 decimales — generalmente 0 */
  impConsumo: number;
  /** ICA (03), 2 decimales — generalmente 0 */
  ica: number;
  /** Total de la factura, 2 decimales */
  total: number;
  /** NIT del emisor sin guión, ej: "900123456" */
  nitEmisor: string;
  /** Número de documento del adquirente, ej: "800987654" */
  docAdquirente: string;
  /** Clave técnica de la resolución DIAN */
  claveTecnica: string;
}

function fmt(value: number): string {
  return value.toFixed(2);
}

export function calcularCufe(p: CufeParams): string {
  const cadena =
    p.numero +
    p.fecha +
    p.hora +
    fmt(p.subtotal) +
    "01" + fmt(p.iva) +
    "04" + fmt(p.impConsumo) +
    "03" + fmt(p.ica) +
    fmt(p.total) +
    p.nitEmisor +
    p.docAdquirente +
    p.claveTecnica;

  return createHash("sha384").update(cadena, "utf8").digest("hex");
}

/**
 * Extrae los parámetros para el CUFE desde los objetos de dominio.
 * Retorna null si falta la clave técnica (modo stub/sin configurar).
 */
export function buildCufeParams(
  factura: { numero: string; fecha_emision: Date | string; subtotal: string; iva_total: string; total: string },
  cliente: { numero_documento: string },
  tenant: { nit: string },
  claveTecnica: string | null | undefined,
): CufeParams | null {
  if (!claveTecnica) return null;

  const fechaEmision = new Date(factura.fecha_emision);
  const fecha = fechaEmision.toISOString().slice(0, 10);
  const hora = fechaEmision.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Bogota",
  });

  return {
    numero:        factura.numero,
    fecha,
    hora,
    subtotal:      Number(factura.subtotal),
    iva:           Number(factura.iva_total),
    impConsumo:    0,
    ica:           0,
    total:         Number(factura.total),
    nitEmisor:     tenant.nit.replace(/-/g, "").split("-")[0],
    docAdquirente: cliente.numero_documento.replace(/-/g, ""),
    claveTecnica,
  };
}
