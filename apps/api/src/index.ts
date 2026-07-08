import * as Sentry from "@sentry/node";

// Inicializar Sentry antes de todo lo demás (opcional: si SENTRY_DSN no está, no hace nada)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.DIAN_AMBIENTE === "1" ? "production" : "staging",
    tracesSampleRate: 0.1,
  });
}

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
import tutorialesRouter from "./routes/tutoriales.js";
import pagosRouter from "./routes/pagos.js";
import { boldRouter } from "./routes/bold.js";
import retencionesRouter from "./routes/retenciones.js";
import notasCreditoRouter from "./routes/notas-credito.js";
import notasDebitoRouter  from "./routes/notas-debito.js";
import exportarRouter from "./routes/exportar.js";
import empresaRouter from "./routes/empresa.js";
import centrosCostosRouter from "./routes/centros-costos.js";
import ensambleRouter from "./routes/ensamble.js";
import carteraRouter from "./routes/cartera.js";
import documentosRouter from "./routes/documentos.js";
import posRouter from "./routes/pos.js";
import auditLogRouter from "./routes/audit-log.js";
import fundadorRouter from "./routes/fundador.js";
import miPlanRouter from "./routes/mi-plan.js";
import soporteRouter from "./routes/soporte.js";
import { contadoresRouter } from "./routes/contadores.js";
import remisionesRouter from "./routes/remisiones.js";
import notificacionesRouter from "./routes/notificaciones.js";
import { requireFundador } from "./middleware/fundador.js";
import { iniciarCronRecurrentes } from "./jobs/recurrentes.js";
import { iniciarCronAlertasCobro } from "./jobs/alertas-cobro.js";
import { iniciarCronTrialExpiry } from "./jobs/trial-expiry.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isDianEnProduccion } from "./services/dian.service.js";

const app = express();
app.set("trust proxy", 1);

// Structured request logging (skip health checks)
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    const tenantId = (req as { tenantId?: string }).tenantId;
    const line: Record<string, unknown> = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
    };
    if (tenantId) line.tenant = tenantId;
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(line));
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify(line));
    } else {
      console.log(JSON.stringify(line));
    }
  });
  next();
});

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

app.use("/api/ia", express.json({ limit: "10mb" })); // imágenes y PDFs
app.use(express.json({ limit: "1mb" }));

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de acceso. Intenta de nuevo en 15 minutos." },
});

// Rate limit para endpoints de escritura — configurable por WRITE_RATE_LIMIT_PER_MIN (default 60)
// Usa el tenantId como clave para usuarios autenticados, IP como fallback
const WRITE_RL_LIMIT = parseInt(process.env.WRITE_RATE_LIMIT_PER_MIN ?? "60", 10);
const writeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: WRITE_RL_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
  keyGenerator: (req) => (req as { tenantId?: string }).tenantId ?? req.ip ?? "anon",
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
});

// Rate limit para registro de nuevas empresas
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de registro. Intenta de nuevo en una hora." },
});

// ── Sin auth ────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    res.json({
      ok: true,
      db: "connected",
      db_ms: Date.now() - start,
      dian: isDianEnProduccion() ? "produccion" : "stub",
      uptime_s: Math.floor(process.uptime()),
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      db: "error",
      error: e instanceof Error ? e.message : "DB unreachable",
    });
  }
});
app.use("/api/auth/login", loginRateLimit);
app.use("/api/auth/register", registerRateLimit);
app.use("/api/auth", authRouter);

// ── Fase 1 — Semilla (todos los planes) ─────────────────────────────────────
app.use(writeRateLimit);
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
app.use("/api/tutoriales",   authenticate, tutorialesRouter);
app.use("/api/pagos/bold",    boldRouter);  // primero: más específico
app.use("/api/pagos",         pagosRouter); // después: más general (Wompi/otros)

// ── Fase 4 — Cosecha ────────────────────────────────────────────────────────
app.use("/api/retenciones",    authenticate, retencionesRouter);
app.use("/api/notas-credito",  authenticate, notasCreditoRouter);
app.use("/api/notas-debito",   authenticate, notasDebitoRouter);
app.use("/api/exportar",       authenticate, exportarRouter);
app.use("/api/empresa",        authenticate, empresaRouter);
app.use("/api/centros-costos", authenticate, requirePlanFeature("centros_costos"),  centrosCostosRouter);
app.use("/api/ensamble",       authenticate, requirePlanFeature("ensamble"),        ensambleRouter);
app.use("/api/cartera",        authenticate, requirePlanFeature("cartera_avanzada"), carteraRouter);
app.use("/api/documentos",     authenticate, documentosRouter);
app.use("/api/pos",            authenticate, requirePlanFeature("pos"), posRouter);
app.use("/api/audit-log",      authenticate, auditLogRouter);
app.use("/api/mi-plan",        authenticate, miPlanRouter);
app.use("/api/soporte",        authenticate, soporteRouter);
app.use("/api/remisiones",     authenticate, remisionesRouter);
app.use("/api/contadores",     contadoresRouter); // registro público + rutas autenticadas internas
app.use("/api/fundador",       requireFundador, fundadorRouter);
app.use("/api/notificaciones", authenticate, notificacionesRouter);

// ── Manejo de errores ────────────────────────────────────────────────────────
// El handler de Sentry debe ir ANTES del handler personalizado
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

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
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`API Doravia corriendo en http://localhost:${PORT}`);
  iniciarCronRecurrentes();
  iniciarCronAlertasCobro();
  iniciarCronTrialExpiry();
});
