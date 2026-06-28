import { Router } from "express";
import { db, users, tenants, plans } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import {
  registrarTenant,
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
// Crea empresa + primer usuario admin. Solo para nuevos clientes.
router.post("/register", async (req, res) => {
  const { plan_slug, tenant_nombre, nit, usuario_nombre, email, password } = req.body;

  if (!plan_slug || !tenant_nombre || !nit || !usuario_nombre || !email || !password) {
    return res.status(400).json({
      error: "Campos requeridos: plan_slug, tenant_nombre, nit, usuario_nombre, email, password.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  try {
    const resultado = await registrarTenant({ plan_slug, tenant_nombre, nit, usuario_nombre, email, password });
    res.status(201).json(resultado);
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

export default router;
