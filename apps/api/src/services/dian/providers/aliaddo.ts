import type { DianProvider, FacturaDianInput, RespuestaDian } from "../types.js";
import { buildCufeParams, calcularCufe } from "../cufe.js";
import { generarXmlUbl } from "../xml-ubl.js";

/**
 * Proveedor Aliaddo — PT (Proveedor Tecnológico) habilitado por la DIAN.
 *
 * Variables de entorno requeridas:
 *   DIAN_PROVEEDOR=aliaddo
 *   ALIADDO_API_URL        Base URL de la API (ej: https://api.aliaddo.com)
 *   ALIADDO_CLIENT_ID      Client ID del software registrado
 *   ALIADDO_CLIENT_SECRET  Client Secret
 *   DIAN_AMBIENTE          "1" = producción, "2" = habilitación/pruebas
 *
 * Documentación Aliaddo: https://developers.aliaddo.com
 *
 * Flujo:
 *   1. Autenticar con OAuth2 (client_credentials) → access_token
 *   2. POST /v1/invoices con el JSON de la factura
 *   3. Aliaddo genera el XML, lo firma con el certificado digital del emisor,
 *      lo envía a la DIAN y devuelve el CUFE + estado
 */

const API_URL    = process.env.ALIADDO_API_URL    ?? "https://apiv2.aliaddo.com";
const CLIENT_ID  = process.env.ALIADDO_CLIENT_ID  ?? "";
const CLIENT_SEC = process.env.ALIADDO_CLIENT_SECRET ?? "";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${API_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "client_credentials",
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SEC,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Aliaddo auth error ${res.status}: ${body}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export const aliaddoProvider: DianProvider = {
  nombre: "aliaddo",

  async enviarFactura(input: FacturaDianInput): Promise<RespuestaDian> {
    const { factura, items, cliente, tenant, resolucion } = input;

    // Calcular CUFE si hay clave técnica disponible
    const cufeParams = buildCufeParams(factura, cliente, tenant, (resolucion as { clave_tecnica?: string }).clave_tecnica);
    const cufe = cufeParams ? calcularCufe(cufeParams) : "";

    // Generar XML UBL 2.1 (Aliaddo puede recibirlo directamente o recomputarlo)
    const xml = generarXmlUbl(input, { cufe });

    const token = await getToken();

    // Payload para la API de Aliaddo
    // Ajustar campos según la documentación específica de la versión que uses
    const payload = {
      invoice: {
        number:       factura.numero,
        prefix:       factura.prefijo,
        consecutive:  factura.consecutivo,
        issueDate:    new Date(factura.fecha_emision).toISOString().slice(0, 10),
        dueDate:      factura.fecha_vencimiento
                        ? new Date(factura.fecha_vencimiento).toISOString().slice(0, 10)
                        : null,
        currency:     "COP",
        paymentMeans: factura.forma_pago,
        notes:        factura.observaciones ?? "",
      },
      supplier: {
        nit:    tenant.nit.split("-")[0].trim(),
        name:   tenant.nombre,
        email:  tenant.correo ?? "",
      },
      customer: {
        documentType: cliente.tipo_documento,
        document:     cliente.numero_documento,
        name:         cliente.nombre,
        email:        cliente.correo ?? "",
        phone:        cliente.telefono ?? "",
        address:      cliente.direccion ?? "",
        city:         cliente.municipio ?? "",
      },
      lines: items.map((item, idx) => ({
        lineNumber:    idx + 1,
        description:   item.descripcion,
        quantity:      Number(item.cantidad),
        unitPrice:     Number(item.precio_unitario),
        discountPct:   Number(item.descuento_pct ?? 0),
        taxPct:        Number(item.iva_pct ?? 19),
        unitMeasure:   item.unidad_medida ?? "UN",
      })),
      cufe,
      xmlUbl: xml,
    };

    const res = await fetch(`${API_URL}/v1/invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json() as {
      cufe?: string;
      qrCode?: string;
      xmlSigned?: string;
      status?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(`Aliaddo error ${res.status}: ${data.error ?? data.message ?? "Error desconocido"}`);
    }

    const aceptada = data.status === "ACCEPTED" || data.status === "VALID" || !!data.cufe;

    return {
      cufe:        data.cufe ?? cufe,
      qr_code:     data.qrCode ?? "",
      xml_firmado: data.xmlSigned ?? xml,
      aceptada,
      mensaje:     data.message,
    };
  },
};
