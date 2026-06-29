import type { DianProvider } from "./types.js";
import { stubProvider }   from "./providers/stub.js";
import { aliaddoProvider } from "./providers/aliaddo.js";
import { matiasProvider }  from "./providers/matias.js";

export type { DianProvider, FacturaDianInput, RespuestaDian } from "./types.js";
export { calcularCufe, buildCufeParams } from "./cufe.js";
export { generarXmlUbl } from "./xml-ubl.js";

/**
 * Devuelve el proveedor DIAN activo según la variable de entorno DIAN_PROVEEDOR.
 *
 * Valores válidos:
 *   stub    — desarrollo local, sin conexión a la DIAN (default si no está configurada)
 *   aliaddo — Aliaddo como PT habilitado
 *   matias  — MATIAS API como PT habilitado
 */
export function getDianProvider(): DianProvider {
  const proveedor = (process.env.DIAN_PROVEEDOR ?? "stub").toLowerCase();

  switch (proveedor) {
    case "aliaddo": return aliaddoProvider;
    case "matias":  return matiasProvider;
    case "stub":    return stubProvider;
    default:
      console.warn(`[DIAN] Proveedor desconocido "${proveedor}", usando stub.`);
      return stubProvider;
  }
}

export function isDianEnProduccion(): boolean {
  const proveedor = (process.env.DIAN_PROVEEDOR ?? "stub").toLowerCase();
  return proveedor !== "stub";
}
