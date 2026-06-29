import { Router } from "express";
import { db, users, tenants, plans, pending_registrations, password_reset_tokens } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { authenticate } from "../middleware/auth.js";
import { enviarResetPassword } from "../services/email.service.js";
import {
  registrarTenant,
  completarRegistroPendiente,
  signAccessToken,
  createRefreshToken,
  login,
  refreshAccessToken,
  logout,
  cambiarPassword,
  selectEmpresa,
  cambiarEmpresa,
  getEmpresasUsuario,
} from "../services/auth.service.js";

const router = Router();

// POST /api/auth/register
// Plan gratuito ("origen"): crea empresa + usuario inmediatamente.
// Plan de pago: guarda registro pendiente y retorna parámetros de checkout Wompi.
router.post("/register", async (req, res) => {
  const { plan_slug, tenant_nombre, nit, usuario_nombre, email, password } = req.body;

  if (!plan_slug || !tenant_nombre || !nit || !usuario_nombre || !email || !password) {
    return res.status(400).json({
      error: "Campos requeridos: plan_slug, tenant_nombre, nit, usuario_nombre, email, password.",
    });
  }

  if ((password as string).length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  try {
    const resultado = await registrarTenant({ plan_slug, tenant_nombre, nit, usuario_nombre, email, password });

    if (resultado.payment_required) {
      // Plan de pago: retornar datos de checkout (sin crear cuenta todavía)
      return res.status(202).json(resultado);
    }

    // Plan gratuito: cuenta lista
    return res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof Error) return res.status(422).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/verificar-registro
// Verifica si un registro pendiente ya fue completado (para usar en ResultadoPago).
// Si está completo, devuelve tokens para auto-login.
router.post("/verificar-registro", async (req, res) => {
  const { wompi_reference } = req.body as { wompi_reference?: string };
  if (!wompi_reference) return res.status(400).json({ error: "wompi_reference es requerido." });

  try {
    const [pending] = await db
      .select()
      .from(pending_registrations)
      .where(eq(pending_registrations.wompi_reference, wompi_reference))
      .limit(1);

    if (!pending) return res.status(404).json({ error: "Registro no encontrado." });

    if (!pending.completed_at) {
      return res.status(202).json({ completed: false, message: "Pago aún en proceso." });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, pending.email))
      .limit(1);

    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

    const accessToken = signAccessToken(user, user.tenant_id);
    const refreshToken = await createRefreshToken(user.id, user.tenant_id);

    return res.json({ completed: true, accessToken, refreshToken });
  } catch (err) {
    if (err instanceof Error) return res.status(422).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Campos requeridos: email, password." });
  }

  try {
    const resultado = await login(email, password);
    res.json(resultado);
  } catch (err) {
    if (err instanceof Error) return res.status(401).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/refresh
// Body: { refresh_token: "<uuid>" }
router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: "Campo requerido: refresh_token." });
  }

  try {
    const tokens = await refreshAccessToken(refresh_token);
    res.json(tokens);
  } catch (err) {
    if (err instanceof Error) return res.status(401).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/logout
// Revoca el refresh token. El access token expira solo (1h).
router.post("/logout", async (req, res) => {
  const { refresh_token } = req.body;

  if (refresh_token) {
    await logout(refresh_token).catch(() => {}); // silencioso si ya estaba revocado
  }

  res.json({ ok: true });
});

// PATCH /api/auth/password — cambia la contraseña del usuario autenticado
router.patch("/password", authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: "Campos requeridos: current_password, new_password." });
  }

  if ((new_password as string).length < 8) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
  }

  try {
    await cambiarPassword(req.userId, current_password, new_password);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) return res.status(401).json({ error: err.message });
    throw err;
  }
});

// GET /api/auth/me — requiere access token válido
router.get("/me", authenticate, async (req, res) => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      nombre: users.nombre,
      role: users.role,
      activo: users.activo,
      dark_mode: users.dark_mode,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.id, req.userId))
    .limit(1);

  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

  const plan = req.tenant.plan;

  // Lista de todas las empresas a las que el usuario tiene acceso
  const empresas = await getEmpresasUsuario(req.userId, req.tenantId);

  const fundadorList = (process.env.FUNDADOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  res.json({
    user: { ...user, role: req.userRole, is_fundador: fundadorList.includes(user.email.toLowerCase()) },
    tenant: {
      id: req.tenant.id,
      nombre: req.tenant.nombre,
      nit: req.tenant.nit,
      plan_ends_at: req.tenant.plan_ends_at,
      plan_starts_at: req.tenant.plan_starts_at ?? null,
      activo: req.tenant.activo,
      ultimo_pago_confirmado_at: req.tenant.ultimo_pago_confirmado_at ?? null,
      onboarding_completado: req.tenant.onboarding_completado,
      pos_config: req.tenant.pos_config ?? {},
    },
    plan: {
      slug: plan.slug,
      nombre: plan.nombre,
      features: plan.features,
      max_usuarios: plan.max_usuarios,
      max_bodegas: plan.max_bodegas,
      max_facturas_mes: plan.max_facturas_mes,
      accounting_level: plan.accounting_level,
    },
    empresas,
  });
});

// PATCH /api/auth/preferencias — guarda preferencias del usuario (ej. dark_mode)
router.patch("/preferencias", authenticate, async (req, res) => {
  const { dark_mode } = req.body as { dark_mode?: boolean };
  if (typeof dark_mode !== "boolean") {
    return res.status(400).json({ error: "Campo requerido: dark_mode (boolean)." });
  }
  await db.update(users).set({ dark_mode }).where(eq(users.id, req.userId));
  return res.json({ ok: true });
});

// POST /api/auth/select-empresa — elige empresa tras login multi-empresa
router.post("/select-empresa", async (req, res) => {
  const { selectionToken, tenantId } = req.body as { selectionToken?: string; tenantId?: string };
  if (!selectionToken || !tenantId) {
    return res.status(400).json({ error: "Campos requeridos: selectionToken, tenantId." });
  }
  try {
    const resultado = await selectEmpresa(selectionToken, tenantId);
    res.json(resultado);
  } catch (err) {
    if (err instanceof Error) return res.status(401).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/cambiar-empresa — cambia de empresa estando autenticado
router.post("/cambiar-empresa", authenticate, async (req, res) => {
  const { tenantId } = req.body as { tenantId?: string };
  if (!tenantId) return res.status(400).json({ error: "Campo requerido: tenantId." });
  try {
    const resultado = await cambiarEmpresa(req.userId, tenantId);
    res.json(resultado);
  } catch (err) {
    if (err instanceof Error) return res.status(403).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/solicitar-reset
// Envía email con enlace de reset. Siempre responde 200 para no revelar si el email existe.
router.post("/solicitar-reset", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: "Campo requerido: email." });

  try {
    const [user] = await db
      .select({ id: users.id, nombre: users.nombre, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (user) {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await db.insert(password_reset_tokens).values({
        user_id:    user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      void enviarResetPassword(user.email, user.nombre, rawToken).catch(
        (e) => console.error("Error enviando email de reset:", e),
      );
    }

    res.json({ ok: true, message: "Si el correo existe, recibirás un enlace en los próximos minutos." });
  } catch (err) {
    if (err instanceof Error) return res.status(422).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/resetear-password
router.post("/resetear-password", async (req, res) => {
  const { token, new_password } = req.body as { token?: string; new_password?: string };
  if (!token || !new_password) {
    return res.status(400).json({ error: "Campos requeridos: token, new_password." });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [resetToken] = await db
      .select()
      .from(password_reset_tokens)
      .where(eq(password_reset_tokens.token_hash, tokenHash))
      .limit(1);

    if (!resetToken || resetToken.used || resetToken.expires_at < new Date()) {
      return res.status(400).json({ error: "El enlace es inválido o ha expirado. Solicita uno nuevo." });
    }

    const password_hash = await bcrypt.hash(new_password, 12);

    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({ password_hash })
        .where(eq(users.id, resetToken.user_id));

      await tx.update(password_reset_tokens)
        .set({ used: true })
        .where(eq(password_reset_tokens.id, resetToken.id));
    });

    res.json({ ok: true, message: "Contraseña actualizada correctamente." });
  } catch (err) {
    if (err instanceof Error) return res.status(422).json({ error: err.message });
    throw err;
  }
});

// POST /api/auth/verify-fundador-pin — verifica PIN del panel fundadores (solo requiere auth, no requireFundador)
router.post("/verify-fundador-pin", authenticate, (req, res) => {
  const { pin } = req.body as { pin?: string };
  const fundadorPin = process.env.FUNDADOR_PIN;
  if (!fundadorPin) return res.json({ ok: true });
  if (pin === fundadorPin) return res.json({ ok: true });
  return res.status(403).json({ error: "PIN incorrecto." });
});

// POST /api/auth/register-fundador
// Crea el tenant interno de Doravia + el usuario fundador, sin pasar por el flujo de compra.
// Protegido por FUNDADOR_PIN y FUNDADOR_EMAILS.
router.post("/register-fundador", async (req, res) => {
  const { pin, nombre, email, password } = req.body as {
    pin?: string; nombre?: string; email?: string; password?: string;
  };

  // Validar PIN
  const fundadorPin = process.env.FUNDADOR_PIN;
  if (fundadorPin && pin !== fundadorPin) {
    return res.status(403).json({ error: "PIN incorrecto." });
  }

  // Validar que el correo esté autorizado
  const fundadorEmails = (process.env.FUNDADOR_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!email || !fundadorEmails.includes(email.toLowerCase())) {
    return res.status(403).json({ error: "Este correo no está autorizado como fundador." });
  }

  if (!nombre || !password || password.length < 8) {
    return res.status(400).json({ error: "Campos requeridos: nombre, password (mínimo 8 caracteres)." });
  }

  try {
    // Si el usuario ya existe, no lo crea de nuevo
    const [existingUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      return res.status(422).json({ error: "Ya existe un usuario con ese correo. Inicia sesión normalmente." });
    }

    // Buscar o crear el tenant interno de Doravia
    const DORAVIA_NIT = "000000000";
    let [doraviaTenant] = await db.select({ id: tenants.id })
      .from(tenants).where(eq(tenants.nit, DORAVIA_NIT)).limit(1);

    if (!doraviaTenant) {
      const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
      if (!plan) return res.status(500).json({ error: "No hay planes configurados en el sistema." });

      const now = new Date();
      const planEnd = new Date(now);
      planEnd.setFullYear(planEnd.getFullYear() + 100);

      [doraviaTenant] = await db.insert(tenants).values({
        nombre: "Doravia (Interno)",
        nit: DORAVIA_NIT,
        plan_id: plan.id,
        plan_starts_at: now,
        plan_ends_at: planEnd,
      }).returning({ id: tenants.id });
    }

    const password_hash = await bcrypt.hash(password, 12);
    await db.insert(users).values({
      tenant_id: doraviaTenant.id,
      email,
      nombre,
      role: "admin",
      password_hash,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en POST /auth/register-fundador:", err);
    if (err instanceof Error) return res.status(500).json({ error: err.message });
    throw err;
  }
});

export default router;
