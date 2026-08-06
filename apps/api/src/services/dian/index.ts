import type { DianProvider } from "./types.js";
import { stubProvider }   from "./providers/stub.js";
import { aliaddoProvider } from "./providers/aliaddo.js";
import { matiasProvider }  from "./providers/matias.js";

export type { DianProvider, FacturaDianInput, RespuestaDian } from "./types.js";
export { calcularCufe, buildCufeParams } from "./cufe.js";

const PROVEEDORES_REALES = ["plemsi"] as const;
const PROVEEDORES_VALIDOS = ["stub", ...PROVEEDORES_REALES] as const;

export type DianModo = "stub" | "produccion" | "invalido";

export class DianConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DianConfigurationError";
  }
}

function proveedorConfigurado(): string {
  return (process.env.DIAN_PROVEEDOR ?? "stub").trim().toLowerCase();
}

function esDespliegueProduccion(): boolean {
  return process.env.NODE_ENV === "production"
    || process.env.RAILWAY_ENVIRONMENT === "production"
    || process.env.DIAN_AMBIENTE === "1";
}

/** Estado seguro para health checks y la interfaz; no expone credenciales. */
export function getDianConfigurationStatus(): { modo: DianModo; proveedor: string } {
  const proveedor = proveedorConfigurado();
  if (proveedor === "stub") return { modo: "stub", proveedor };
  if ((PROVEEDORES_REALES as readonly string[]).includes(proveedor)) {
    return { modo: "produccion", proveedor };
  }
  return { modo: "invalido", proveedor };
}

/**
 * Evita que una API desplegada para producción facture silenciosamente con el
 * proveedor stub. Debe ejecutarse antes de aceptar tráfico HTTP.
 */
export function assertDianConfiguration(): void {
  if (!esDespliegueProduccion()) return;

  const { modo, proveedor } = getDianConfigurationStatus();
  if (modo === "produccion") return;

  const valor = proveedor || "(vacío)";
  throw new DianConfigurationError(
    `Configuración DIAN insegura para producción: DIAN_PROVEEDOR=${valor}. ` +
    `Configura uno de: ${PROVEEDORES_REALES.join(", ")}. El proveedor stub no tiene validez fiscal.`,
  );
}
export { generarXmlUbl } from "./xml-ubl.js";

/**
 * Devuelve el proveedor DIAN activo según la variable de entorno DIAN_PROVEEDOR.
 *
 * Valores válidos:
 *   stub    — desarrollo local, sin conexión a la DIAN (default local)
 *   plemsi  — proveedor tecnológico de Doravia en producción
 */
export function getDianProvider(): DianProvider {
  const proveedor = proveedorConfigurado();

  switch (proveedor) {
    // Plemsi se invoca directamente desde factura.service.ts para usar las
    // credenciales cifradas de cada tenant. No debe degradarse a stub.
    case "plemsi":
      throw new DianConfigurationError("Plemsi debe invocarse mediante la integración por tenant.");
    case "aliaddo": return aliaddoProvider;
    case "matias":  return matiasProvider;
    case "stub":    return stubProvider;
    default:
      throw new DianConfigurationError(
        `DIAN_PROVEEDOR="${proveedor || "(vacío)"}" no es válido. ` +
        `Valores permitidos: ${PROVEEDORES_VALIDOS.join(", ")}.`,
      );
  }
}

export function isDianEnProduccion(): boolean {
  return getDianConfigurationStatus().modo === "produccion";
}
