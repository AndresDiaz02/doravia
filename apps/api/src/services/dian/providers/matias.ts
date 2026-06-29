import type { DianProvider, FacturaDianInput, RespuestaDian } from "../types.js";
import { buildCufeParams, calcularCufe } from "../cufe.js";
import { generarXmlUbl } from "../xml-ubl.js";

/**
 * Proveedor MATIAS API — PT (Proveedor Tecnológico) habilitado por la DIAN.
 *
 * Variables de entorno requeridas:
 *   DIAN_PROVEEDOR=matias
 *   MATIAS_API_URL     Base URL de la API (ej: https://api.matiasapi.com)
 *   MATIAS_API_KEY     API Key proporcionada por MATIAS
 *   MATIAS_COMPANY_ID  ID de empresa en MATIAS (asignado al registrar el NIT)
 *   DIAN_AMBIENTE      "1" = producción, "2" = habilitación/pruebas
 *
 * Documentación MATIAS: https://docs.matiasapi.com
 *
 * Flujo:
 *   1. Enviar POST /api/facturas con Bearer token (MATIAS_API_KEY)
 *   2. MATIAS procesa, firma con el certificado del emisor y envía a la DIAN
 *   3. Devuelve el CUFE + XML firmado
 *
 * Nota: actualizar los nombres de campos del payload según la documentación
 * oficial de MATIAS una vez se confirmen las credenciales.
 */

const API_URL    = process.env.MATIAS_API_URL    ?? "https://api.matiasapi.com";
const API_KEY    = process.env.MATIAS_API_KEY    ?? "";
const COMPANY_ID = process.env.MATIAS_COMPANY_ID ?? "";

export const matiasProvider: DianProvider = {
  nombre: "matias",

  async enviarFactura(input: FacturaDianInput): Promise<RespuestaDian> {
    const { factura, items, cliente, tenant, resolucion } = input;

    const cufeParams = buildCufeParams(factura, cliente, tenant, (resolucion as { clave_tecnica?: string }).clave_tecnica);
    const cufe = cufeParams ? calcularCufe(cufeParams) : "";

    const xml = generarXmlUbl(input, { cufe });

    const payload = {
      companyId:   COMPANY_ID,
      ambiente:    process.env.DIAN_AMBIENTE ?? "2",
      invoice: {
        numero:           factura.numero,
        prefijo:          factura.prefijo,
        consecutivo:      factura.consecutivo,
        fecha_emision:    new Date(factura.fecha_emision).toISOString().slice(0, 10),
        fecha_vencimiento: factura.fecha_vencimiento
                            ? new Date(factura.fecha_vencimiento).toISOString().slice(0, 10)
                            : null,
        observaciones:    factura.observaciones ?? "",
        forma_pago:       factura.forma_pago,
        condicion_pago:   factura.condicion_pago,
        subtotal:         Number(factura.subtotal),
        iva_total:        Number(factura.iva_total),
        total:            Number(factura.total),
        neto_a_pagar:     Number(factura.neto_a_pagar),
      },
      emisor: {
        nit:    tenant.nit.split("-")[0].trim(),
        nombre: tenant.nombre,
        correo: tenant.correo ?? "",
      },
      receptor: {
        tipo_documento:  cliente.tipo_documento,
        numero_documento: cliente.numero_documento,
        nombre:          cliente.nombre,
        correo:          cliente.correo ?? "",
        telefono:        cliente.telefono ?? "",
        direccion:       cliente.direccion ?? "",
        municipio:       cliente.municipio ?? "",
      },
      items: items.map((item, idx) => ({
        numero:          idx + 1,
        descripcion:     item.descripcion,
        cantidad:        Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario),
        descuento_pct:   Number(item.descuento_pct ?? 0),
        iva_pct:         Number(item.iva_pct ?? 19),
        unidad_medida:   item.unidad_medida ?? "UN",
        subtotal:        Number(item.subtotal),
        iva_valor:       Number(item.iva_valor),
        total:           Number(item.total),
      })),
      cufe,
      xml_ubl: xml,
    };

    const res = await fetch(`${API_URL}/api/facturas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json() as {
      cufe?: string;
      qr_code?: string;
      xml_firmado?: string;
      estado?: string;
      mensaje?: string;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(`MATIAS error ${res.status}: ${data.error ?? data.mensaje ?? "Error desconocido"}`);
    }

    const aceptada = data.estado === "ACEPTADA" || data.estado === "ACCEPTED" || !!data.cufe;

    return {
      cufe:        data.cufe ?? cufe,
      qr_code:     data.qr_code ?? "",
      xml_firmado: data.xml_firmado ?? xml,
      aceptada,
      mensaje:     data.mensaje,
    };
  },
};
