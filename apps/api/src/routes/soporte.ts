import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, uso_ia } from "@workspace/db";

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000 });

const SYSTEM_SOPORTE = `Eres el asistente de soporte de Doravia, un software colombiano de facturación electrónica, contabilidad y gestión empresarial.

Tu rol es ayudar a los usuarios con dudas sobre:
- Cómo usar el sistema (facturas, gastos, inventario, contabilidad, cotizaciones, reportes, POS)
- Preguntas sobre DIAN (resoluciones, numeración, factura electrónica en Colombia)
- Configuración de la empresa, usuarios, planes y suscripción
- Errores comunes y cómo resolverlos

Reglas:
- Responde siempre en español, de forma concisa y amigable
- Si no sabes la respuesta, di "Escríbenos a soporte@doraviasoft.com o al WhatsApp +57 312 558 7055"
- No inventes funcionalidades que no existen
- Para temas de factura electrónica DIAN, recuerda que la empresa debe tener resolución de numeración vigente
- Máximo 3 párrafos por respuesta — sé directo

Módulos disponibles en Doravia:
- Facturas (emisión, DIAN, notas crédito, reenvío)
- Gastos y compras a proveedores
- Inventario, bodegas, kardex, ensamble
- Contabilidad, libro mayor, balance de prueba
- Cartera (C×C y C×P), cobros automáticos
- Cotizaciones y conversión a factura
- Retenciones (reteICA, reteIVA, retefuente)
- Centros de costos
- POS (punto de venta con turnos y cierre de caja)
- Reportes y exportación a Excel
- Usuarios, roles, contadores externos
- IA para dictado de ítems y análisis de imágenes`;

interface Mensaje {
  role: "user" | "assistant";
  content: string;
}

// POST /api/soporte/chat
router.post("/chat", async (req, res) => {
  const { mensajes } = req.body as { mensajes?: Mensaje[] };
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return res.status(400).json({ error: "mensajes es requerido." });
  }

  // Limitar historial a las últimas 20 interacciones para no superar el contexto
  const historial = mensajes.slice(-20);

  // Validar estructura básica
  for (const m of historial) {
    if (!["user", "assistant"].includes(m.role) || typeof m.content !== "string") {
      return res.status(400).json({ error: "Formato de mensajes inválido." });
    }
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_SOPORTE,
      messages: historial.map((m) => ({ role: m.role, content: m.content })),
    });

    // Registrar uso (fire-and-forget — no bloqueamos la respuesta)
    void db.insert(uso_ia).values({
      tenant_id: req.tenantId,
      tipo: "soporte_chat",
      tokens_entrada: message.usage.input_tokens,
      tokens_salida: message.usage.output_tokens,
    }).catch(() => {});

    const respuesta = message.content.find((c) => c.type === "text");
    return res.json({ respuesta: respuesta?.type === "text" ? respuesta.text : "" });
  } catch (err) {
    console.error("Error en soporte chat:", err);
    return res.status(500).json({ error: "Error al procesar tu consulta. Intenta de nuevo." });
  }
});

export { router as soporteRouter };
export default router;
