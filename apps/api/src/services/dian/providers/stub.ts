import type { DianProvider, FacturaDianInput, RespuestaDian } from "../types.js";

/**
 * Proveedor stub — simula la DIAN localmente para desarrollo y pruebas.
 * NUNCA usar en producción. Las facturas generadas en este modo no son
 * reconocidas por la DIAN y no tienen validez fiscal.
 */
export const stubProvider: DianProvider = {
  nombre: "stub",

  async enviarFactura(input: FacturaDianInput): Promise<RespuestaDian> {
    const { factura } = input;

    // CUFE ficticio — inequívocamente marcado como stub
    const cufe = `STUB-${factura.id}-NO-VALIDO-DIAN`;
    const qrUrl = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=STUB-${factura.id}`;

    console.warn(
      `[DIAN STUB] Factura ${factura.numero} procesada en modo STUB. ` +
      `CUFE ficticio asignado. Esta factura NO tiene validez fiscal.`,
    );

    return {
      cufe,
      qr_code:     qrUrl,
      xml_firmado: "<stub-xml/>",
      aceptada:    true,
      mensaje:     "Modo STUB — factura aceptada localmente, sin conexión real a la DIAN.",
    };
  },
};
