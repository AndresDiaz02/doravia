import { createHash, createHmac } from "node:crypto";
import type {
  PagoProvider, CrearLinkInput, CrearLinkResult,
  VerificarEstadoResult, ProcesarWebhookResult, CredencialesTenant, BoldCredenciales,
} from "../types.js";
import { decrypt } from "../../encryption.js";

// Implementación Bold para pagos de tenants a sus clientes finales.
// NO modifica ni usa las credenciales de Doravia (BOLD_API_KEY/BOLD_SECRET_KEY).
// Esas viven en bold.service.ts y son para suscripciones Doravia.

function parseCreds(c: CredencialesTenant): BoldCredenciales {
  const raw = decrypt(c.raw);
  const parsed = JSON.parse(raw) as BoldCredenciales;
  if (!parsed.api_key || !parsed.secret_key) throw new Error("Credenciales Bold incompletas (api_key y secret_key requeridos).");
  return parsed;
}

async function boldFetch(apiKey: string, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`https://payments.api.bold.co${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `x-api-key ${apiKey}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = res.status === 204 ? {} : (await res.json()) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    throw new Error(`Error de red con Bold: ${err instanceof Error ? err.message : "desconocido"}`);
  }
}

export const boldProvider: PagoProvider = {
  nombre: "bold",

  async crearLinkPago(input: CrearLinkInput): Promise<CrearLinkResult> {
    const creds = parseCreds(input.credenciales);

    // Bold Payment Link API:
    // POST /v1/payment-links → devuelve { id, url, ... }
    // ref: https://docs.bold.co/docs/payment-links
    const res = await boldFetch(creds.api_key, "POST", "/v1/payment-links", {
      name: input.descripcion,
      description: input.descripcion,
      amount: {
        currency: input.moneda,
        total_amount: Math.round(input.monto),
      },
      metadata: { referencia_externa: input.referencia_externa },
      success_url: input.url_redirect_exito,
      failure_url: input.url_redirect_fallo,
    });

    if (!res.ok) {
      throw new Error(`Bold API error ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const linkId = res.data.id as string | undefined;
    const linkUrl = res.data.url as string | undefined;
    if (!linkId || !linkUrl) throw new Error("Bold no devolvió id ni url del link de pago.");

    return { url_link_pago: linkUrl, referencia_proveedor: linkId };
  },

  async verificarEstado(referencia_externa: string, credenciales: CredencialesTenant): Promise<VerificarEstadoResult> {
    const creds = parseCreds(credenciales);
    const res = await boldFetch(creds.api_key, "GET", `/v2/payment-voucher/${referencia_externa}`);
    if (!res.ok) return { estado: "pendiente" };

    const raw = (res.data.payment_status ?? res.data.status) as string | undefined;
    const estado = mapBoldStatus(raw);
    const pagado_en = raw === "APPROVED" ? new Date() : undefined;
    return { estado, pagado_en, metadata: res.data };
  },

  async procesarWebhook(payload: Record<string, unknown>, headers: Record<string, string>): Promise<ProcesarWebhookResult> {
    // Extraemos tenant_id de la referencia para poder cargar su credencial y verificar firma
    const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
    const reference = (data.reference_id ?? data.reference ?? payload.reference_id) as string | undefined;
    if (!reference) throw new Error("Webhook Bold sin referencia.");

    // El reference tiene formato: COT-{tenantIdParcial}-{cotizacionId}-{ts}
    // tenant_id completo se resuelve en el route handler (que tiene acceso a la BD)
    const transaction_id = (data.transaction_id ?? payload.transaction_id) as string | undefined;
    const rawStatus = (data.payment_status ?? data.status ?? payload.payment_status) as string | undefined;
    const nuevo_estado = mapBoldStatus(rawStatus);

    return {
      tenant_id: "", // el route handler lo rellena después de lookup por reference
      referencia_externa: reference,
      nuevo_estado,
      pagado_en: nuevo_estado === "pagado" ? new Date() : undefined,
      metadata: payload,
    };
  },
};

// Verificación de firma HMAC para webhooks Bold
// Bold firma con HMAC-SHA256(payload_raw, event_secret)
// y lo pone en el header "bold-signature" o "x-bold-signature"
export function verificarFirmaBold(
  payloadRaw: Buffer,
  headers: Record<string, string>,
  eventSecret: string,
): boolean {
  const firma = headers["bold-signature"] ?? headers["x-bold-signature"] ?? "";
  if (!firma) return false;
  const expected = createHmac("sha256", eventSecret).update(payloadRaw).digest("hex");
  // Comparación segura contra timing attacks
  try {
    return firma.length === expected.length &&
      createHash("sha256").update(firma).digest().equals(createHash("sha256").update(expected).digest());
  } catch {
    return false;
  }
}

function mapBoldStatus(raw: string | undefined): "pendiente" | "pagado" | "expirado" | "fallido" | "reembolsado" {
  switch (raw?.toUpperCase()) {
    case "APPROVED": return "pagado";
    case "REJECTED":
    case "FAILED": return "fallido";
    case "EXPIRED": return "expirado";
    case "REFUNDED": return "reembolsado";
    default: return "pendiente";
  }
}
