import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt } from "./encryption.js";

export class PlemsiNotConfiguredError extends Error {
  readonly code = "PLEMSI_NOT_CONFIGURED" as const;
  constructor(motivo: string) {
    super(`Aún no has completado tu habilitación DIAN — ${motivo}. Completa la configuración en Ajustes → Facturación electrónica antes de emitir facturas.`);
    this.name = "PlemsiNotConfiguredError";
  }
}

export async function getPlemsiCredentials(tenantId: string): Promise<{ apiKey: string; ambiente: string }> {
  const [row] = await db
    .select({
      plemsi_api_key_encrypted: tenants.plemsi_api_key_encrypted,
      plemsi_ambiente: tenants.plemsi_ambiente,
      plemsi_habilitado: tenants.plemsi_habilitado,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) throw new PlemsiNotConfiguredError("empresa no encontrada");
  if (!row.plemsi_habilitado) throw new PlemsiNotConfiguredError("la empresa no está habilitada para facturación electrónica DIAN");
  if (!row.plemsi_api_key_encrypted) throw new PlemsiNotConfiguredError("falta la API Key de Plemsi — configúrala en Ajustes → Facturación electrónica");

  const apiKey = decrypt(row.plemsi_api_key_encrypted);
  const ambiente = row.plemsi_ambiente ?? "pruebas";
  return { apiKey, ambiente };
}
