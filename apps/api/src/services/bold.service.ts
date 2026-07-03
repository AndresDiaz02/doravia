import { createHash } from "crypto";

const BOLD_API_KEY = process.env.BOLD_API_KEY ?? "";
// La llave secreta se usa para calcular la firma de integridad del botón de pagos
const BOLD_SECRET_KEY = process.env.BOLD_SECRET_KEY ?? "";

export interface BoldResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  status?: number;
}

async function boldFetch(method: string, path: string): Promise<BoldResult> {
  try {
    const res = await fetch(`https://payments.api.bold.co${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `x-api-key ${BOLD_API_KEY}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204) return { ok: true };
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error(`[Bold] ${method} ${path} → ${res.status}:`, JSON.stringify(json));
      return { ok: false, error: `Error Bold ${res.status}`, status: res.status, data: json };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de conexión con Bold" };
  }
}

/**
 * Genera la firma de integridad para el botón de pagos Bold.
 * Fórmula: SHA256(reference_id + amount + currency + secret_key)
 */
export function generarFirma(reference_id: string, amount: number, currency = "COP"): string {
  const raw = `${reference_id}${amount}${currency}${BOLD_SECRET_KEY}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

// La llave de identidad (API key) es pública — se embebe en el botón JS del cliente
export const BOLD_IDENTITY_KEY = BOLD_API_KEY;

export const bold = {
  // Consultar estado de una transacción via la API del botón de pagos Bold
  estadoPago: (reference_id: string) => boldFetch("GET", `/v2/payment-voucher/${reference_id}`),
};
