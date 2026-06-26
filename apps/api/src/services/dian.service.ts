import type { Factura, Cliente, ItemFactura, Tenant } from "@workspace/db";

// Interfaz del Proveedor Tecnológico (PT) DIAN.
// Implementar con el PT elegido (ej. Bizagi, eFact, Alegra API).
// El PT recibe el XML UBL 2.1 firmado y devuelve el CUFE y QR.

export interface RespuestaDian {
  cufe: string;
  qr_code: string;
  xml_firmado: string;
  aceptada: boolean;
  mensaje?: string;
}

export interface FacturaParaDian {
  factura: Factura;
  cliente: Cliente;
  items: ItemFactura[];
  tenant: Tenant;
}

/**
 * Envía la factura al PT DIAN y devuelve CUFE + QR.
 *
 * STUB — reemplazar con la integración real del PT elegido.
 *
 * El flujo real es:
 *   1. Generar XML UBL 2.1 con los datos de la factura
 *   2. Firmar el XML con el certificado digital del tenant (PKCS#12)
 *   3. Enviar al endpoint del PT
 *   4. Recibir ApplicationResponse con CUFE y estado
 *   5. Guardar CUFE + QR en la factura
 *
 * Variables de entorno requeridas para el PT real:
 *   DIAN_PT_URL, DIAN_PT_API_KEY, DIAN_AMBIENTE (1=produccion, 2=pruebas)
 */
export async function enviarFacturaDian(data: FacturaParaDian): Promise<RespuestaDian> {
  if (process.env.DIAN_MODO === "pruebas_stub") {
    // Modo stub: devuelve datos ficticios para desarrollo
    return {
      cufe: `stub-cufe-${data.factura.id}`,
      qr_code: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=stub-${data.factura.id}`,
      xml_firmado: "<stub/>",
      aceptada: true,
      mensaje: "Factura aceptada en modo stub",
    };
  }

  // TODO: implementar con el PT elegido
  // Ejemplo con eFact:
  //   const xml = generarXmlUbl(data);
  //   const xmlFirmado = await firmarXml(xml, process.env.CERT_PATH!, process.env.CERT_PASS!);
  //   const respuesta = await fetch(`${process.env.DIAN_PT_URL}/invoice`, {
  //     method: "POST",
  //     headers: { Authorization: `Bearer ${process.env.DIAN_PT_API_KEY}` },
  //     body: xmlFirmado,
  //   });
  //   return parsearRespuestaPT(await respuesta.json());

  throw new Error("Integración DIAN no configurada. Establecer DIAN_MODO=pruebas_stub para desarrollo.");
}
