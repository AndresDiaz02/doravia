import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { db, users, tenants, plans, refresh_tokens, user_accesos, pending_registrations } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import type { User } from "@workspace/db";

const ACCESS_TTL_SECONDS = 60 * 60;   // 1 hora
const REFRESH_TTL_DAYS = 30;
const SELECTION_TTL_SECONDS = 60 * 5; // 5 minutos para elegir empresa

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET no está definida");
  return s;
}

// ── Tipos de payload ─────────────────────────────────────────────────────────

export interface AccessPayload {
  sub: string;       // userId
  tenantId: string;
  role: string;
  permisos_contables: boolean;
  type: "access";
}

export interface SelectionPayload {
  sub: string;
  type: "selection";
}

// ── Helpers JWT ──────────────────────────────────────────────────────────────

export function signAccessToken(user: User, tenantId: string, role?: string, permisos_contables?: boolean): string {
  const payload: AccessPayload = {
    sub: user.id,
    tenantId,
    role: role ?? user.role,
    permisos_contables: permisos_contables ?? user.permisos_contables,
    type: "access",
  };
  return jwt.sign(payload, jwtSecret(), { expiresIn: ACCESS_TTL_SECONDS });
}

function signSelectionToken(userId: string): string {
  const payload: SelectionPayload = { sub: userId, type: "selection" };
  return jwt.sign(payload, jwtSecret(), { expiresIn: SELECTION_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, jwtSecret()) as AccessPayload;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createRefreshToken(userId: string, tenantId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

  await db
    .insert(refresh_tokens)
    .values({ user_id: userId, tenant_id: tenantId, token_hash: hashToken(raw), expires_at: expiresAt });

  return raw;
}

// ── Registro ─────────────────────────────────────────────────────────────────

export interface RegistrarTenantInput {
  plan_slug: string;
  tenant_nombre: string;
  nit: string;
  usuario_nombre: string;
  email: string;
  password: string;
}

export type RegistrarTenantResult =
  | { payment_required: false; tenant: object; user: object; accessToken: string; refreshToken: string }
  | { payment_required: true; wompi_reference: string; checkout: WompiCheckoutParams };

export interface WompiCheckoutParams {
  public_key: string;
  currency: string;
  amount_in_cents: number;
  reference: string;
  signature: { integrity: string };
  redirect_url: string;
  plan_slug: string;
  plan_nombre: string;
  plan_precio_cop: number;
}

export async function registrarTenant(input: RegistrarTenantInput): Promise<RegistrarTenantResult> {
  const [plan] = await db.select().from(plans).where(eq(plans.slug, input.plan_slug)).limit(1);
  if (!plan) throw new Error(`Plan no encontrado: ${input.plan_slug}.`);

  // Validaciones de unicidad
  const [nitExistente] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.nit, input.nit)).limit(1);
  if (nitExistente) throw new Error("Ya existe una empresa registrada con ese NIT.");

  const [emailExistente] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (emailExistente) throw new Error("Ya existe un usuario con ese correo electrónico.");

  // ── Plan gratuito (Origen): activar inmediatamente, permanente ────────────
  if (plan.precio_anual_cop === 0) {
    const ahora = new Date();
    const planFin = new Date(ahora);
    planFin.setFullYear(planFin.getFullYear() + 100);
    const password_hash = await bcrypt.hash(input.password, 12);

    const { tenant, user } = await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({
        nombre: input.tenant_nombre,
        nit: input.nit,
        plan_id: plan.id,
        plan_starts_at: ahora,
        plan_ends_at: planFin,
      }).returning();

      const [user] = await tx.insert(users).values({
        tenant_id: tenant.id,
        email: input.email,
        nombre: input.usuario_nombre,
        role: "admin",
        password_hash,
      }).returning();

      return { tenant, user };
    });

    const accessToken = signAccessToken(user, tenant.id);
    const refreshToken = await createRefreshToken(user.id, tenant.id);
    return { payment_required: false, tenant, user: sinHash(user), accessToken, refreshToken };
  }

  // ── Plan de pago: crear registro pendiente y checkout ───────────────────
  const password_hash = await bcrypt.hash(input.password, 12);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  // Eliminar registro pendiente anterior para este email (si existe y no fue completado)
  await db.delete(pending_registrations)
    .where(eq(pending_registrations.email, input.email));

  const wompiRef = `DOR-REG-${Date.now()}-${plan.slug}`;

  await db.insert(pending_registrations).values({
    plan_slug: plan.slug,
    tenant_nombre: input.tenant_nombre,
    nit: input.nit,
    usuario_nombre: input.usuario_nombre,
    email: input.email,
    password_hash,
    wompi_reference: wompiRef,
    expires_at: expiresAt,
  });

  // Generar firma de integridad Wompi
  const WOMPI_PRV_KEY = process.env.WOMPI_PRV_KEY ?? "";
  const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
  const monto_centavos = plan.precio_anual_cop * 100;
  const cadena = `${wompiRef}${monto_centavos}COP${WOMPI_PRV_KEY}`;
  const firma = crypto.createHash("sha256").update(cadena).digest("hex");

  return {
    payment_required: true,
    wompi_reference: wompiRef,
    checkout: {
      public_key: process.env.WOMPI_PUB_KEY ?? "",
      currency: "COP",
      amount_in_cents: monto_centavos,
      reference: wompiRef,
      signature: { integrity: firma },
      redirect_url: `${APP_URL}/pago/resultado`,
      plan_slug: plan.slug,
      plan_nombre: plan.nombre,
      plan_precio_cop: plan.precio_anual_cop,
    },
  };
}

// Llamado desde el webhook de Wompi cuando se aprueba el pago de un registro pendiente
export async function completarRegistroPendiente(wompiReference: string) {
  const [pending] = await db
    .select()
    .from(pending_registrations)
    .where(eq(pending_registrations.wompi_reference, wompiReference))
    .limit(1);

  if (!pending) throw new Error("Registro pendiente no encontrado.");
  if (pending.completed_at) return null; // idempotente: ya fue procesado

  const expiresAt = new Date(pending.expires_at);
  if (expiresAt < new Date()) throw new Error("El enlace de registro expiró. Intenta registrarte de nuevo.");

  const [plan] = await db.select().from(plans).where(eq(plans.slug, pending.plan_slug)).limit(1);
  if (!plan) throw new Error("Plan no encontrado.");

  // Verificar que NIT y email siguen disponibles
  const [nitExistente] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.nit, pending.nit)).limit(1);
  if (nitExistente) throw new Error("Ya existe una empresa con ese NIT.");

  const [emailExistente] = await db.select({ id: users.id }).from(users).where(eq(users.email, pending.email)).limit(1);
  if (emailExistente) throw new Error("Ya existe un usuario con ese correo.");

  const ahora = new Date();
  const planFin = new Date(ahora);
  planFin.setFullYear(planFin.getFullYear() + 1);

  let nuevoTenantId: string | undefined;

  await db.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenants).values({
      nombre: pending.tenant_nombre,
      nit: pending.nit,
      plan_id: plan.id,
      plan_starts_at: ahora,
      plan_ends_at: planFin,
      activo: true,
    }).returning();

    nuevoTenantId = tenant.id;

    await tx.insert(users).values({
      tenant_id: tenant.id,
      email: pending.email,
      nombre: pending.usuario_nombre,
      role: "admin",
      password_hash: pending.password_hash,
    });

    await tx.update(pending_registrations)
      .set({ completed_at: ahora })
      .where(eq(pending_registrations.id, pending.id));
  });

  return { tenantId: nuevoTenantId!, planPrecio: plan.precio_anual_cop };
}

// ── Login ────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.activo, true)))
    .limit(1);

  const hashParaComparar = user?.password_hash ?? "$2a$12$placeholder.hash.to.prevent.timing.attacks.xxxxxxxxxx";
  const valida = await bcrypt.compare(password, hashParaComparar);

  if (!user || !valida) {
    throw new Error("Correo electrónico o contraseña incorrectos.");
  }

  // Buscar accesos adicionales a otras empresas
  const accesosExtra = await db
    .select({ tenant_id: user_accesos.tenant_id, role: user_accesos.role })
    .from(user_accesos)
    .where(eq(user_accesos.user_id, user.id));

  const todasLasEntradas = [
    { tenant_id: user.tenant_id, role: user.role as string },
    ...accesosExtra.map((a) => ({ tenant_id: a.tenant_id, role: a.role as string })),
  ];

  if (todasLasEntradas.length === 1) {
    // Una sola empresa — flujo normal
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, user.tenant_id), eq(tenants.activo, true)))
      .limit(1);
    if (!tenant) throw new Error("La empresa está inactiva. Contacta a soporte.");

    const accessToken = signAccessToken(user, tenant.id);
    const refreshToken = await createRefreshToken(user.id, tenant.id);
    return { user: sinHash(user), tenant, accessToken, refreshToken };
  }

  // Múltiples empresas — devolver lista para selección
  const tenantRows = await db
    .select({ id: tenants.id, nombre: tenants.nombre, nit: tenants.nit, activo: tenants.activo })
    .from(tenants)
    .where(inArray(tenants.id, todasLasEntradas.map((e) => e.tenant_id)));

  const empresas = tenantRows
    .filter((t) => t.activo)
    .map((t) => ({
      tenant_id: t.id,
      tenant_nombre: t.nombre,
      nit: t.nit,
      role: todasLasEntradas.find((e) => e.tenant_id === t.id)?.role ?? user.role,
    }));

  return {
    requiresEmpresaSelect: true as const,
    selectionToken: signSelectionToken(user.id),
    empresas,
  };
}

// ── Seleccionar empresa (paso 2 del login multi-empresa) ─────────────────────

export async function selectEmpresa(selectionToken: string, tenantId: string) {
  let payload: SelectionPayload;
  try {
    payload = jwt.verify(selectionToken, jwtSecret()) as SelectionPayload;
  } catch {
    throw new Error("El tiempo para seleccionar empresa expiró. Vuelve a iniciar sesión.");
  }
  if (payload.type !== "selection") throw new Error("Token inválido.");

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.sub), eq(users.activo, true)))
    .limit(1);
  if (!user) throw new Error("Usuario no encontrado.");

  let role = user.role as string;
  let permisos_contables = user.permisos_contables;
  if (user.tenant_id !== tenantId) {
    const [acceso] = await db
      .select({ role: user_accesos.role, permisos_contables: user_accesos.permisos_contables })
      .from(user_accesos)
      .where(and(eq(user_accesos.user_id, user.id), eq(user_accesos.tenant_id, tenantId)))
      .limit(1);
    if (!acceso) throw new Error("No tienes acceso a esa empresa.");
    role = acceso.role;
    permisos_contables = acceso.permisos_contables;
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.activo, true)))
    .limit(1);
  if (!tenant) throw new Error("Empresa inactiva o no encontrada.");

  const accessToken = signAccessToken(user, tenant.id, role, permisos_contables);
  const refreshToken = await createRefreshToken(user.id, tenant.id);

  return { user: sinHash(user), tenant, accessToken, refreshToken };
}

// ── Cambiar empresa (usuario ya autenticado) ──────────────────────────────────

export async function cambiarEmpresa(userId: string, tenantId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.activo, true)))
    .limit(1);
  if (!user) throw new Error("Usuario no encontrado.");

  let role = user.role as string;
  let permisos_contables = user.permisos_contables;
  if (user.tenant_id !== tenantId) {
    const [acceso] = await db
      .select({ role: user_accesos.role, permisos_contables: user_accesos.permisos_contables })
      .from(user_accesos)
      .where(and(eq(user_accesos.user_id, user.id), eq(user_accesos.tenant_id, tenantId)))
      .limit(1);
    if (!acceso) throw new Error("No tienes acceso a esa empresa.");
    role = acceso.role;
    permisos_contables = acceso.permisos_contables;
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.activo, true)))
    .limit(1);
  if (!tenant) throw new Error("Empresa no encontrada o inactiva.");

  const accessToken = signAccessToken(user, tenant.id, role, permisos_contables);
  const refreshToken = await createRefreshToken(user.id, tenant.id);

  return { user: sinHash(user), tenant, accessToken, refreshToken };
}

// ── Listar todas las empresas accesibles ─────────────────────────────────────

export async function getEmpresasUsuario(userId: string, currentTenantId: string) {
  const [user] = await db
    .select({ id: users.id, tenant_id: users.tenant_id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return [];

  const accesosExtra = await db
    .select({ tenant_id: user_accesos.tenant_id, role: user_accesos.role })
    .from(user_accesos)
    .where(eq(user_accesos.user_id, userId));

  const todasLasEntradas = [
    { tenant_id: user.tenant_id, role: user.role as string },
    ...accesosExtra.map((a) => ({ tenant_id: a.tenant_id, role: a.role as string })),
  ];

  const tenantRows = await db
    .select({ id: tenants.id, nombre: tenants.nombre, nit: tenants.nit })
    .from(tenants)
    .where(inArray(tenants.id, todasLasEntradas.map((e) => e.tenant_id)));

  return tenantRows.map((t) => ({
    tenant_id: t.id,
    tenant_nombre: t.nombre,
    nit: t.nit,
    role: todasLasEntradas.find((e) => e.tenant_id === t.id)?.role ?? user.role,
    es_activa: t.id === currentTenantId,
  }));
}

// ── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshAccessToken(rawToken: string) {
  const [token] = await db
    .select()
    .from(refresh_tokens)
    .where(eq(refresh_tokens.token_hash, hashToken(rawToken)))
    .limit(1);

  if (!token) throw new Error("Refresh token inválido.");
  if (token.revoked_at) throw new Error("Refresh token revocado.");
  if (new Date(token.expires_at) < new Date()) throw new Error("Refresh token expirado.");

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, token.user_id), eq(users.activo, true)))
    .limit(1);
  if (!user) throw new Error("Usuario no encontrado o inactivo.");

  // Preservar el rol y permisos correctos para el tenant del token
  let role = user.role as string;
  let permisos_contables = user.permisos_contables;
  if (user.tenant_id !== token.tenant_id) {
    const [acceso] = await db
      .select({ role: user_accesos.role, permisos_contables: user_accesos.permisos_contables })
      .from(user_accesos)
      .where(and(eq(user_accesos.user_id, user.id), eq(user_accesos.tenant_id, token.tenant_id)))
      .limit(1);
    if (acceso) {
      role = acceso.role;
      permisos_contables = acceso.permisos_contables;
    }
  }

  await db
    .update(refresh_tokens)
    .set({ revoked_at: new Date() })
    .where(eq(refresh_tokens.id, token.id));

  const accessToken = signAccessToken(user, token.tenant_id, role, permisos_contables);
  const newRefreshToken = await createRefreshToken(user.id, token.tenant_id);

  return { accessToken, refreshToken: newRefreshToken };
}

// ── Logout ───────────────────────────────────────────────────────────────────

export async function logout(rawToken: string) {
  await db
    .update(refresh_tokens)
    .set({ revoked_at: new Date() })
    .where(eq(refresh_tokens.token_hash, hashToken(rawToken)));
}

// ── Cambio de contraseña ─────────────────────────────────────────────────────

export async function cambiarPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Usuario no encontrado.");

  const valida = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valida) throw new Error("La contraseña actual es incorrecta.");

  const password_hash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ password_hash }).where(eq(users.id, user.id));
}

// ── Helper ───────────────────────────────────────────────────────────────────

function sinHash(user: User) {
  const { password_hash: _, ...resto } = user;
  return resto;
}
