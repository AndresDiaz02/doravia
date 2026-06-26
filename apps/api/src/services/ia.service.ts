import Anthropic from "@anthropic-ai/sdk";
import { db, uso_ia } from "@workspace/db";
import type { CategoriaGasto } from "@workspace/db";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ResultadoAnalisisDocumento {
  descripcion: string;
  monto: number;
  iva: number;
  fecha: string | null;
  categoria: CategoriaGasto;
  proveedor_nombre: string | null;
  proveedor_nit: string | null;
  observaciones: string | null;
  confianza: "alta" | "media" | "baja";
}

const SYSTEM_PROMPT = `Eres un asistente contable colombiano especializado en analizar documentos de gasto (facturas, recibos, tiquetes).

Extrae los datos del documento y responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "descripcion": "descripción breve del gasto",
  "monto": número sin IVA,
  "iva": monto de IVA (0 si no aplica),
  "fecha": "YYYY-MM-DD" o null,
  "categoria": una de: arrendamiento|nomina|servicios_publicos|transporte|publicidad|papeleria|tecnologia|mantenimiento|impuestos|honorarios|compra_mercancia|otros,
  "proveedor_nombre": "nombre del emisor" o null,
  "proveedor_nit": "NIT del emisor sin DV" o null,
  "observaciones": "notas relevantes" o null,
  "confianza": "alta"|"media"|"baja"
}

Reglas:
- monto = valor sin impuestos
- iva = valor del IVA (puede ser 0)
- fecha en formato ISO YYYY-MM-DD
- confianza: alta = documento legible y completo, media = parcialmente legible, baja = datos incompletos
- Si no puedes identificar un campo con certeza, usa null o 0
- Responde SOLO el JSON, sin explicaciones adicionales`;

export async function analizarDocumentoGasto(
  tenantId: string,
  imagenBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<ResultadoAnalisisDocumento> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imagenBase64,
            },
          },
          {
            type: "text",
            text: "Analiza este documento de gasto y extrae los datos en el formato JSON especificado.",
          },
        ],
      },
    ],
  });

  // Registrar uso
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  await db.insert(uso_ia).values({
    tenant_id: tenantId,
    tipo: "analizar_documento",
    tokens_entrada: inputTokens,
    tokens_salida: outputTokens,
  });

  const textContent = message.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("El modelo no devolvió una respuesta de texto.");
  }

  // Extraer JSON de la respuesta (puede venir con ```json ... ```)
  const raw = textContent.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No se pudo extraer datos del documento. Intenta con una imagen más clara.");
  }

  const data = JSON.parse(jsonMatch[0]) as ResultadoAnalisisDocumento;
  return data;
}
