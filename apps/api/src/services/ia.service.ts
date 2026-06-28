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

export interface ItemCompraIA {
  nombre: string;
  codigo: string | null;
  cantidad: number;
  precio_costo: number;
}

export interface ResultadoAnalisisCompra {
  proveedor_nombre: string | null;
  proveedor_nit: string | null;
  fecha: string | null;
  confianza: "alta" | "media" | "baja";
  items: ItemCompraIA[];
}

const SYSTEM_PROMPT_COMPRA = `Eres un asistente contable colombiano especializado en leer facturas de compra a proveedores.

Extrae los datos y responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "proveedor_nombre": "nombre del proveedor emisor" o null,
  "proveedor_nit": "NIT del proveedor sin DV" o null,
  "fecha": "YYYY-MM-DD" o null,
  "confianza": "alta"|"media"|"baja",
  "items": [
    {
      "nombre": "nombre del producto o servicio",
      "codigo": "código o referencia del ítem" o null,
      "cantidad": número (unidades recibidas),
      "precio_costo": número (precio unitario sin IVA)
    }
  ]
}

Reglas:
- Extrae TODOS los ítems de la factura, uno por fila
- precio_costo = precio unitario neto sin impuestos
- cantidad debe ser positiva
- confianza: alta = documento claro y completo, media = parcialmente legible, baja = incompleto
- Responde SOLO el JSON, sin explicaciones`;

export async function analizarCompraProveedor(
  tenantId: string,
  imagenBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<ResultadoAnalisisCompra> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT_COMPRA,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imagenBase64 },
          },
          { type: "text", text: "Analiza esta factura de compra y extrae todos los ítems en el formato JSON especificado." },
        ],
      },
    ],
  });

  await db.insert(uso_ia).values({
    tenant_id: tenantId,
    tipo: "analizar_documento",
    tokens_entrada: message.usage.input_tokens,
    tokens_salida: message.usage.output_tokens,
  });

  const textContent = message.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("El modelo no devolvió respuesta.");

  const raw = textContent.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se pudo extraer datos. Intenta con una imagen más clara.");

  return JSON.parse(jsonMatch[0]) as ResultadoAnalisisCompra;
}

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
