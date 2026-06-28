import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, users, tenants, plans, refresh_tokens } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import type { User, Tenant, Plan } from "@workspace/db";

const ACCESS_TTL_SECONDS = 60 * 60;          // 1 hora
const REFRESH_TTL_DAYS = 30;

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
  type: "access";
}

// ── Helpers JWT ──────────────────────────────────────────────────────────────

function signAccessToken(user: User, tenantId: string): string {
  const payload: AccessPayload = {
    sub: user.id,
    tenantId,
    role: user.role,
    type: "access",
  };
  return jwt.sign(payload, jwtSecret(), { expiresIn: ACCESS_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, jwtSecret()) as AccessPayload;
}

async function createRefreshToken(userId: string, tenantId: string): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

  const [row] = await db
    .insert(refresh_tokens)
    .values({ user_id: userId, tenant_id: tenantId, expires_at: expiresAt })
    .returning();

  return row.id; // el UUID del refresh token es el token en sí
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

export async function registrarTenant(input: RegistrarTenantInput) {
  // Validar plan
  const [plan] = await db.select().from(plans).where(eq(plans.slug, input.plan_slug)).limit(1);
  if (!plan) throw new Error(`Plan no encontrado: ${input.plan_slug}.`);

  // NIT único
  const [nitExistente] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.nit, input.nit)).limit(1);
  if (nitExistente) throw new Error("Ya existe una empresa registrada con ese NIT.");

  // Email único
  const [emailExistente] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (emailExistente) throw new Error("Ya existe un usuario con ese correo electrónico.");

  const ahora = new Date();
  const planFin = new Date(ahora);
  planFin.setFullYear(planFin.getFullYear() + 1); // suscripción anual

  const pruebaFin = new Date(ahora);
  pruebaFin.setDate(pruebaFin.getDate() + 15); // 15 días de prueba gratuita

  const password_hash = await bcrypt.hash(input.password, 12);

  const esPlanGratis = input.plan_slug === "origen"; // Origen no necesita prueba, es gratis permanente

  const { tenant, user } = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        nombre: input.tenant_nombre,
        nit: input.nit,
        plan_id: plan.id,
        plan_starts_at: ahora,
        plan_ends_at: planFin,
      })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        tenant_id: tenant.id,
        email: input.email,
        nombre: input.usuario_nombre,
        role: "admin",
        password_hash,
      })
      .returning();

    return { tenant, user };
  });

  const accessToken = signAccessToken(user, tenant.id);
  const refreshToken = await createRefreshToken(user.id, tenant.id);

  return { tenant, user: sinHash(user), accessToken, refreshToken };
}

// ── Login ────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.activo, true)))
    .limit(1);

  // Comparación en tiempo constante — siempre hacer hash aunque el user no exista
  const hashParaComparar = user?.password_hash ?? "$2a$12$placeholder.hash.to.prevent.timing.attacks.xxxxxxxxxx";
  const valida = await bcrypt.compare(password, hashParaComparar);

  if (!user || !valida) {
    throw new Error("Correo electrónico o contraseña incorrectos.");
  }

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

// ── Refresh ──────────────────────────────────────────────────────────────────

export async function refreshAccessToken(tokenId: string) {
  const [token] = await db
    .select()
    .from(refresh_tokens)
    .where(eq(refresh_tokens.id, tokenId))
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

  // Rotar: revocar el token usado y emitir uno nuevo (previene reutilización)
  await db
    .update(refresh_tokens)
    .set({ revoked_at: new Date() })
    .where(eq(refresh_tokens.id, token.id));

  const accessToken = signAccessToken(user, token.tenant_id);
  const newRefreshToken = await createRefreshToken(user.id, token.tenant_id);

  return { accessToken, refreshToken: newRefreshToken };
}

// ── Logout ───────────────────────────────────────────────────────────────────

export async function logout(tokenId: string) {
  await db
    .update(refresh_tokens)
    .set({ revoked_at: new Date() })
    .where(eq(refresh_tokens.id, tokenId));
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
