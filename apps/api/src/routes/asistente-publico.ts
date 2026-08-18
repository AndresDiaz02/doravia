import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "anon"),
  message: { error: "Has enviado muchas consultas. Intenta de nuevo en unos minutos." },
});

const SYSTEM = `Eres el asistente comercial de Doravia, software colombiano de gestión empresarial. Responde en español, con empatía y claridad. Máximo 110 palabras.

Catálogo y precios vigentes:
- Origen: facturación electrónica independiente. Origen gratis incluye 10 documentos/año. Origen 24: $99.900/año; 60: $169.900/año; 120: $249.900/año; 300: $329.900/año.
- ERP Semilla: $590.000/año. Incluye facturación electrónica, inventario, compras, gastos, contabilidad automática y reportes. Raíz $790.000/año añade más usuarios/bodegas. Brote $1.190.000/año añade automatizaciones y reportes avanzados. Cosecha $1.590.000/año es para operación compleja/multisucursal.
- Punto: $360.000/año, una caja, dos usuarios y una bodega. Punto Plus: $630.000/año, multicaja, usuarios ilimitados y tres bodegas.
- Nómina: tiene planes desde Nómina Semilla ($99.000/año, hasta 3 empleados), pero la emisión electrónica se encuentra en etapa de lanzamiento y se debe validar con Ventas antes de activar.

No inventes descuentos, integraciones, plazos ni cumplimiento fiscal. No pidas datos personales, contraseñas ni información bancaria. Si la duda requiere una revisión comercial o técnica, dilo y sugiere hablar con Ventas.`;

router.post("/chat", limiter, async (req, res) => {
  const { pregunta, contexto } = req.body as { pregunta?: unknown; contexto?: unknown };
  if (typeof pregunta !== "string" || pregunta.trim().length < 3 || pregunta.length > 500) {
    return res.status(400).json({ error: "La consulta debe tener entre 3 y 500 caracteres." });
  }

  const contextText = typeof contexto === "string" ? contexto.slice(0, 800) : "";
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ respuesta: "Recibí tu duda. Un asesor puede orientarte con la configuración y el plan más adecuado para tu empresa." });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 15_000 });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 240,
      system: SYSTEM,
      messages: [{ role: "user", content: `Contexto de la empresa: ${contextText || "Aún no definido"}\n\nDuda: ${pregunta.trim()}` }],
    });
    const answer = message.content.find((block) => block.type === "text");
    return res.json({ respuesta: answer?.type === "text" ? answer.text : "No pude generar una respuesta en este momento." });
  } catch (error) {
    console.error("Error en asistente público:", error);
    return res.status(502).json({ error: "El asistente no está disponible en este momento. Puedes hablar con Ventas para recibir orientación." });
  }
});

router.post("/evento", limiter, (req, res) => {
  const { evento, producto } = req.body as { evento?: unknown; producto?: unknown };
  const eventosValidos = ["recomendacion_generada", "activar_plan", "hablar_ventas"];
  if (typeof evento !== "string" || !eventosValidos.includes(evento) || typeof producto !== "string" || producto.length > 40) {
    return res.status(400).json({ error: "Evento inválido." });
  }
  console.info(JSON.stringify({ tipo: "asistente_publico", evento, producto, at: new Date().toISOString() }));
  return res.status(204).end();
});

export default router;
