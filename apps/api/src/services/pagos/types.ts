// ── Tipos compartidos del sistema de pagos de cotizaciones ──────────────────

export type EstadoPago = "pendiente" | "pagado" | "expirado" | "fallido" | "reembolsado";

export type ProveedorPago = "bold" | "stub";

export interface CrearLinkInput {
  monto: number;
  moneda: string;
  referencia_externa: string;
  descripcion: string;
  url_redirect_exito: string;
  url_redirect_fallo: string;
  credenciales: CredencialesTenant;
}

export interface CrearLinkResult {
  url_link_pago: string;
  referencia_proveedor: string;
}

export interface VerificarEstadoResult {
  estado: EstadoPago;
  pagado_en?: Date;
  metadata?: Record<string, unknown>;
}

export interface ProcesarWebhookResult {
  tenant_id: string;
  referencia_externa: string;
  nuevo_estado: EstadoPago;
  pagado_en?: Date;
  metadata: Record<string, unknown>;
}

// Credenciales que cada tenant guarda cifradas en BD.
// Para Bold: api_key (identity key, pública) + secret_key (firma integridad)
// Para Stub: cualquier string no vacío (p.ej. "test")
export interface CredencialesTenant {
  raw: string; // JSON cifrado ya deserializado
}

export interface BoldCredenciales {
  api_key: string;
  secret_key: string;
  event_secret?: string; // para verificar webhooks Bold
}

// Error tipado cuando el tenant no tiene proveedor configurado o activo
export class PagosNotConfiguredError extends Error {
  readonly code = "PAGOS_NOT_CONFIGURED";
  constructor(msg = "El tenant no tiene un proveedor de pagos configurado o activo.") {
    super(msg);
    this.name = "PagosNotConfiguredError";
  }
}

// Interfaz que todo provider debe implementar
export interface PagoProvider {
  readonly nombre: ProveedorPago;
  crearLinkPago(input: CrearLinkInput): Promise<CrearLinkResult>;
  verificarEstado(referencia_externa: string, credenciales: CredencialesTenant): Promise<VerificarEstadoResult>;
  procesarWebhook(payload: Record<string, unknown>, headers: Record<string, string>): Promise<ProcesarWebhookResult>;
}
