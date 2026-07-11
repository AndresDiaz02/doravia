import { db } from "@workspace/db";
import { configuracion_pagos_tenant } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt } from "../encryption.js";
import { PagosNotConfiguredError } from "./types.js";
import type { PagoProvider, CredencialesTenant } from "./types.js";
import { boldProvider } from "./providers/bold.js";
import { stubProvider } from "./providers/stub.js";

export * from "./types.js";

// Registro de providers disponibles.
// Agregar un nuevo provider = crear providers/{nombre}.ts e incluirlo aquí.
const PROVIDERS: Record<string, PagoProvider> = {
  bold: boldProvider,
  stub: stubProvider,
  // wompi: wompiProvider,   // slot documentado — pendiente implementación
  // payu: payuProvider,     // slot documentado — pendiente implementación
  // mercadopago: mpProvider, // slot documentado — pendiente implementación
};

export interface TenantPagosConfig {
  proveedor: string;
  provider: PagoProvider;
  credenciales: CredencialesTenant;
}

// Carga la configuración de pagos del tenant y retorna el provider activo.
// Lanza PagosNotConfiguredError si no hay configuración válida.
export async function getTenantPagosConfig(tenantId: string): Promise<TenantPagosConfig> {
  const [config] = await db
    .select()
    .from(configuracion_pagos_tenant)
    .where(eq(configuracion_pagos_tenant.tenant_id, tenantId))
    .limit(1);

  if (!config || !config.habilitado) throw new PagosNotConfiguredError();

  const provider = PROVIDERS[config.proveedor];
  if (!provider) throw new PagosNotConfiguredError(`Proveedor desconocido: ${config.proveedor}`);

  return {
    proveedor: config.proveedor,
    provider,
    credenciales: { raw: config.credenciales_encriptadas },
  };
}

// Prueba la conexión con el proveedor configurado.
// Intenta desencriptar y parsear las credenciales. No hace llamada de red real.
export function probarConexion(credencialesEncriptadas: string, proveedor: string): { ok: boolean; error?: string } {
  try {
    const raw = decrypt(credencialesEncriptadas);
    JSON.parse(raw);
    if (!PROVIDERS[proveedor]) return { ok: false, error: `Proveedor desconocido: ${proveedor}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Credenciales inválidas" };
  }
}

export { boldProvider, stubProvider };
