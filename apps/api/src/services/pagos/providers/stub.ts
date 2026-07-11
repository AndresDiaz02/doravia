import type {
  PagoProvider, CrearLinkInput, CrearLinkResult,
  VerificarEstadoResult, ProcesarWebhookResult, CredencialesTenant,
} from "../types.js";

// Provider stub para desarrollo y testing.
// No hace llamadas de red. Genera links ficticios.
// El endpoint POST /api/pagos/cotizaciones/stub/marcar-pagado simula el webhook.

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export const stubProvider: PagoProvider = {
  nombre: "stub",

  async crearLinkPago(input: CrearLinkInput): Promise<CrearLinkResult> {
    // Valida que haya alguna credencial configurada (aunque sea ficticia)
    if (!input.credenciales.raw?.trim()) {
      throw new Error("Stub provider requiere alguna credencial configurada (puede ser cualquier string).");
    }
    const ref = input.referencia_externa;
    const url = `${APP_URL}/pago-stub?ref=${ref}&monto=${input.monto}&moneda=${input.moneda}`;
    return { url_link_pago: url, referencia_proveedor: `STUB-${ref}` };
  },

  async verificarEstado(referencia_externa: string, _credenciales: CredencialesTenant): Promise<VerificarEstadoResult> {
    // El stub no tiene estado persistente; el estado real vive en pagos_cotizacion
    return { estado: "pendiente" };
  },

  async procesarWebhook(payload: Record<string, unknown>, _headers: Record<string, string>): Promise<ProcesarWebhookResult> {
    const referencia_externa = payload.referencia_externa as string | undefined;
    const tenant_id = payload.tenant_id as string | undefined;
    if (!referencia_externa || !tenant_id) throw new Error("Payload stub incompleto.");
    return {
      tenant_id,
      referencia_externa,
      nuevo_estado: "pagado",
      pagado_en: new Date(),
      metadata: payload,
    };
  },
};
