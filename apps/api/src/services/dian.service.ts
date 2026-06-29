/**
 * Punto de entrada de la integración DIAN para el resto de la API.
 * El proveedor activo se elige con la variable de entorno DIAN_PROVEEDOR:
 *   stub    — desarrollo local (default)
 *   aliaddo — Aliaddo como PT habilitado
 *   matias  — MATIAS API como PT habilitado
 *
 * Ver apps/api/src/services/dian/ para la implementación completa.
 * Ver README_INTEGRACION_DIAN.md en la raíz del proyecto para guía de activación.
 */
import type { Factura, Cliente, ItemFactura, Tenant, ResolucionDian } from "@workspace/db";
import { getDianProvider, isDianEnProduccion } from "./dian/index.js";

export type { RespuestaDian } from "./dian/index.js";

export interface FacturaParaDian {
  factura: Factura;
  cliente: Cliente;
  items: ItemFactura[];
  tenant: Tenant;
  resolucion: ResolucionDian;
}

export async function enviarFacturaDian(data: FacturaParaDian) {
  const provider = getDianProvider();
  return provider.enviarFactura({
    factura:    data.factura,
    items:      data.items,
    cliente:    data.cliente,
    tenant:     data.tenant,
    resolucion: data.resolucion,
  });
}

export { isDianEnProduccion };
