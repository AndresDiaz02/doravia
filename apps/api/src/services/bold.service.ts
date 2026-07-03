const BOLD_URL = process.env.BOLD_URL ?? "https://api.online.payments.bold.co";
const BOLD_API_KEY = process.env.BOLD_API_KEY ?? "GIRThfc6OjPURJowcK2o3YGAk-rS-VnW1wzmWizzbFc";

function headers() {
  return {
    "Content-Type": "application/json",
    "x-api-key": BOLD_API_KEY,
  };
}

export interface BoldPaymentIntent {
  reference_id: string;
  amount: { currency: "COP"; total_amount: number };
  description: string;
  callback_url: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
}

export interface BoldPaymentAttempt {
  reference_id: string;
  payer: {
    person_type: "NATURAL_PERSON" | "LEGAL_PERSON";
    name: string;
    email: string;
    phone: string;
    document_type: string;
    document_number: string;
    billing_address: {
      street1: string;
      city: string;
      zip_code: string;
      province: string;
      country: string;
      phone: string;
    };
  };
  payment_method: Record<string, unknown>;
  device_fingerprint: Record<string, unknown>;
}

export interface BoldResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  status?: number;
}

async function boldFetch(method: string, path: string, body?: unknown): Promise<BoldResult> {
  try {
    const res = await fetch(`${BOLD_URL}${path}`, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 204) return { ok: true };
    const json = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        (json.errors as Array<{ description?: string }> | undefined)?.[0]?.description ??
        (json.message as string) ??
        `Error Bold ${res.status}`;
      return { ok: false, error: msg, status: res.status };
    }
    return { ok: true, data: (json.payload ?? json) as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de conexión con Bold" };
  }
}

export const bold = {
  crearIntencion: (body: BoldPaymentIntent) => boldFetch("POST", "/v1/payment-intent", body),
  obtenerIntencion: (reference_id: string) => boldFetch("GET", `/v1/payment-intent/${reference_id}`),
  ejecutarPago: (body: BoldPaymentAttempt) => boldFetch("POST", "/v1/payment", body),
  estadoPago: (reference_id: string) => boldFetch("GET", `/v1/payment/${reference_id}`),
  bancosPSE: () => boldFetch("GET", "/v1/payment/pse/banks"),
  anular: (transaction_id: string) => boldFetch("POST", "/v1/payment/void", { transaction_id }),
  reembolsar: (data: { reference_id: string; transaction_id: string; reason: string }) =>
    boldFetch("POST", "/v1/payment/refund", data),
  estadoReembolso: (transaction_id: string) => boldFetch("GET", `/v1/payment/refund/${transaction_id}`),
};
