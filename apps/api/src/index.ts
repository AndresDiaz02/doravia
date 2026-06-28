import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "./middleware/auth.js";
import { requirePlanFeature, requireAccountingLevel } from "./middleware/require-plan-feature.js";
import { PlanLimitError, PlanFeatureError } from "@workspace/shared";

import authRouter from "./routes/auth.js";
import clientesRouter from "./routes/clientes.js";
import facturasRouter from "./routes/facturas.js";
import contabilidadRouter from "./routes/contabilidad.js";
import reportesRouter from "./routes/reportes.js";
import resolucionesDianRouter from "./routes/resoluciones-dian.js";
import productosRouter from "./routes/productos.js";
import usuariosRouter from "./routes/usuarios.js";
import bodegasRouter from "./routes/bodegas.js";
import inventarioRouter from "./routes/inventario.js";
import alertasRouter from "./routes/alertas.js";
import recurrentesRouter from "./routes/recurrentes.js";
import cotizacionesRouter from "./routes/cotizaciones.js";
import gastosRouter from "./routes/gastos.js";
import iaRouter from "./routes/ia.js";
import pagosRouter from "./routes/pagos.js";
import retencionesRouter from "./routes/retenciones.js";
import notasCreditoRouter from "./routes/notas-credito.js";
import exportarRouter from "./routes/exportar.js";
import empresaRouter from "./routes/empresa.js";
import centrosCostosRouter from "./routes/centros-costos.js";
import ensambleRouter from "./routes/ensamble.js";
import carteraRouter from "./routes/cartera.js";
import documentosRouter from "./routes/documentos.js";
import posRouter from "./routes/pos.js";
import { iniciarCronRecurrentes } from "./jobs/recurrentes.js";
import { iniciarCronAlertasCobro } from "./jobs/alertas-cobro.js";

const app = express();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((o) => o.trim());

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`Origin ${origin} no permitido por CORS`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de acceso. Intenta de nuevo en 15 minutos." },
});

// ── Sin auth ────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth/login", loginRateLimit);
app.use("/api/auth", authRouter);

// ── Fase 1 — Semilla (todos los planes) ─────────────────────────────────────
app.use("/api/clientes",           authenticate, clientesRouter);
app.use("/api/facturas",           authenticate, facturasRouter);
app.use("/api/contabilidad",       authenticate, contabilidadRouter);
app.use("/api/reportes",           authenticate, reportesRouter);
app.use("/api/resoluciones-dian",  authenticate, resolucionesDianRouter);
app.use("/api/productos",          authenticate, productosRouter);
app.use("/api/usuarios",           authenticate, usuariosRouter);

// ── Fase 2 — Raíz (requiere módulo de inventario) ───────────────────────────
app.use("/api/bodegas",       authenticate, requirePlanFeature("inventario"),            bodegasRouter);
app.use("/api/inventario",    authenticate, requirePlanFeature("inventario"),            inventarioRouter);
app.use("/api/alertas",       authenticate,                                              alertasRouter);

// ── Fase 3 — Brote ──────────────────────────────────────────────────────────
app.use("/api/recurrentes",    authenticate, requirePlanFeature("facturacion_recurrente"), recurrentesRouter);
app.use("/api/cotizaciones",  authenticate, requirePlanFeature("cotizaciones"),            cotizacionesRouter);
app.use("/api/gastos",        authenticate, requirePlanFeature("gastos"),                  gastosRouter);
app.use("/api/ia",            authenticate, requirePlanFeature("ia_asistente"),            iaRouter);
app.use("/api/pagos",         pagosRouter); // checkout usa authenticate internamente; webhook es público

// ── Fase 4 — Cosecha ────────────────────────────────────────────────────────
app.use("/api/retenciones",    authenticate, retencionesRouter);
app.use("/api/notas-credito",  authenticate, notasCreditoRouter);
app.use("/api/exportar",       authenticate, exportarRouter);
app.use("/api/empresa",        authenticate, empresaRouter);
app.use("/api/centros-costos", authenticate, requirePlanFeature("centros_costos"),  centrosCostosRouter);
app.use("/api/ensamble",       authenticate, requirePlanFeature("ensamble"),        ensambleRouter);
app.use("/api/cartera",        authenticate, requirePlanFeature("cartera_avanzada"), carteraRouter);
app.use("/api/documentos",     authenticate, documentosRouter);
app.use("/api/pos",            authenticate, requirePlanFeature("pos"), posRouter);

// ── Manejo de errores ────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof PlanLimitError || err.name === "PlanLimitError") {
    return res.status(403).json({ error: err.message, code: "PLAN_LIMIT_EXCEEDED" });
  }
  if (err instanceof PlanFeatureError || err.name === "PlanFeatureError") {
    return res.status(403).json({ error: err.message, code: "PLAN_FEATURE_NOT_INCLUDED" });
  }
  console.error("[API Error]", err);
  res.status(500).json({ error: "Error interno del servidor." });
});

// Capturar promesas rechazadas no manejadas para evitar crash del proceso
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`API Doravia corriendo en http://localhost:${PORT}`);
  iniciarCronRecurrentes();
  iniciarCronAlertasCobro();
});
