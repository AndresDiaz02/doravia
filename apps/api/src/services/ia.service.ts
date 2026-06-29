import Anthropic from "@anthropic-ai/sdk";
import { db, uso_ia } from "@workspace/db";
import type { CategoriaGasto } from "@workspace/db";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30_000,
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

// ─────────────────────────────────────────────────────────
// Parseo de descripción libre para pre-llenar facturas
// ─────────────────────────────────────────────────────────

export interface ResultadoParseoDescripcion {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_porcentaje: 0 | 5 | 19;
  confianza: "alta" | "media" | "baja";
  campos_ambiguos: string[];
}

const SYSTEM_PROMPT_DESCRIPCION = `Eres un asistente de facturación colombiano. El usuario te describe un ítem que quiere incluir en una factura.
Extrae los campos necesarios y responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "descripcion": "descripción corta del producto o servicio",
  "cantidad": número positivo,
  "precio_unitario": precio por unidad (en pesos colombianos, sin IVA),
  "iva_porcentaje": 0, 5 o 19,
  "confianza": "alta"|"media"|"baja",
  "campos_ambiguos": ["lista de nombres de campos que no quedaron claros"]
}

Reglas:
- Si el usuario dice "sin IVA", "no aplica IVA" o es un servicio exento → iva_porcentaje: 0
- Si no menciona IVA y el contexto sugiere bienes físicos → usa 19
- precio_unitario siempre por unidad, nunca el total
- Si el usuario da un precio total y cantidad, calcula precio_unitario = total / cantidad
- confianza alta: todos los campos claros; media: falta algún dato pero se puede inferir; baja: datos muy incompletos
- campos_ambiguos: nombres exactos de los campos que no se pudieron determinar con certeza
- Responde SOLO el JSON, sin texto adicional`;

export async function parsearDescripcionFactura(
  tenantId: string,
  texto: string,
): Promise<ResultadoParseoDescripcion> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT_DESCRIPCION,
    messages: [
      { role: "user", content: texto },
    ],
  });

  await db.insert(uso_ia).values({
    tenant_id: tenantId,
    tipo: "analizar_documento",
    tokens_entrada: message.usage.input_tokens,
    tokens_salida: message.usage.output_tokens,
  });

  const textContent = message.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("El modelo no devolvió respuesta.");
  }

  const raw = textContent.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se pudo interpretar la descripción. Inténtalo de nuevo.");

  return JSON.parse(jsonMatch[0]) as ResultadoParseoDescripcion;
}

// ─────────────────────────────────────────────────────────
// Análisis de imagen/PDF para pre-llenar líneas de factura de venta
// ─────────────────────────────────────────────────────────

export interface ItemFacturaIA {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_porcentaje: 0 | 5 | 19;
  confianza: "alta" | "media" | "baja";
  campos_ambiguos: string[];
}

export interface ResultadoAnalisisImagenFactura {
  items: ItemFacturaIA[];
  confianza_global: "alta" | "media" | "baja";
}

const SYSTEM_PROMPT_IMAGEN_FACTURA = `Eres un asistente de facturación colombiano. Analizas imágenes o PDFs que pueden contener:
- Listas de productos/servicios a facturar
- Pedidos de clientes
- Cotizaciones o proformas
- Notas de venta manuscritas o digitales

Extrae los ítems y responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "items": [
    {
      "descripcion": "nombre del producto o servicio",
      "cantidad": número positivo,
      "precio_unitario": precio por unidad en pesos colombianos (sin IVA),
      "iva_porcentaje": 0, 5 o 19,
      "confianza": "alta"|"media"|"baja",
      "campos_ambiguos": ["campos inciertos"]
    }
  ],
  "confianza_global": "alta"|"media"|"baja"
}

Reglas:
- Extrae TODOS los ítems visibles, uno por elemento
- precio_unitario siempre por unidad, nunca el total
- Si el documento muestra precio total y cantidad, calcula precio_unitario = total / cantidad
- Si no hay IVA explícito en bienes físicos, usa 19; servicios o exentos → 0
- confianza_global: alta = documento claro; media = algunas partes ilegibles; baja = muy incompleto
- Responde SOLO el JSON, sin texto adicional`;

export async function analizarImagenFactura(
  tenantId: string,
  imagenBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
): Promise<ResultadoAnalisisImagenFactura> {
  const userContent: Anthropic.MessageParam["content"] =
    mediaType === "application/pdf"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: imagenBase64 },
          } as unknown as Anthropic.TextBlockParam,
          { type: "text", text: "Extrae todos los ítems para facturar en el formato JSON especificado." },
        ]
      : [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imagenBase64 },
          },
          { type: "text", text: "Extrae todos los ítems para facturar en el formato JSON especificado." },
        ];

  const createParams = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT_IMAGEN_FACTURA,
    messages: [{ role: "user" as const, content: userContent }],
  };
  const createOptions = mediaType === "application/pdf"
    ? { headers: { "anthropic-beta": "pdfs-2024-09-25" } }
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = await (client.messages.create as any)(createParams, createOptions);

  await db.insert(uso_ia).values({
    tenant_id: tenantId,
    tipo: "analizar_documento",
    tokens_entrada: message.usage.input_tokens,
    tokens_salida: message.usage.output_tokens,
  });

  const textContent = (message.content as Anthropic.ContentBlock[]).find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("El modelo no devolvió respuesta.");

  const raw = textContent.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se pudo extraer ítems del documento. Intenta con una imagen más clara.");

  return JSON.parse(jsonMatch[0]) as ResultadoAnalisisImagenFactura;
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
