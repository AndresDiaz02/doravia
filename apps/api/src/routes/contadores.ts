import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, contador_registrations, users, tenants, plans, user_accesos, comisiones_contador } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { signAccessToken, createRefreshToken } from "../services/auth.service.js";
import { enviarConfirmacionContador } from "../services/email.service.js";

const router = Router();

const HUB_NIT = "0000000001";

async function getHubTenantId(): Promise<string> {
  const [hub] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.nit, HUB_NIT)).limit(1);
  if (!hub) throw new Error("Hub de contadores no configurado. Ejecuta las migraciones.");
  return hub.id;
}

// ── POST /api/contadores/registro (público) ────────────────────────────────
router.post("/registro", async (req, res) => {
  try {
    const { nombre, email, password, celular, firma_contable } = req.body as {
      nombre?: string; email?: string; password?: string; celular?: string; firma_contable?: string;
    };
    if (!nombre?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Campos requeridos: nombre, email, contraseña." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const emailNorm = email.trim().toLowerCase();

    // Si ya existe un registro, reenviar confirmación
    const [existente] = await db
      .select()
      .from(contador_registrations)
      .where(eq(contador_registrations.email, emailNorm))
      .limit(1);

    if (existente?.confirmado) {
      return res.status(422).json({ error: "Este correo ya está registrado y confirmado. Inicia sesión directamente." });
    }

    const token = randomBytes(32).toString("hex");
    const password_hash = await bcrypt.hash(password, 12);

    if (existente) {
      await db.update(contador_registrations)
        .set({ token_confirmacion: token, password_hash, nombre: nombre.trim(), celular: celular?.trim(), firma_contable: firma_contable?.trim() })
        .where(eq(contador_registrations.id, existente.id));
    } else {
      await db.insert(contador_registrations).values({
        nombre: nombre.trim(),
        email: emailNorm,
        password_hash,
        celular: celular?.trim(),
        firma_contable: firma_contable?.trim(),
        token_confirmacion: token,
      });
    }

    await enviarConfirmacionContador(emailNorm, nombre.trim(), token).catch((e) =>
      console.error("[EMAIL] Error enviando confirmación contador:", e),
    );

    return res.status(201).json({ ok: true, mensaje: "Revisa tu correo para confirmar tu cuenta." });
  } catch (err) {
    console.error("Error en POST /contadores/registro:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /api/contadores/confirmar?token=... (público) ─────────────────────
router.get("/confirmar", async (req, res) => {
  try {
    const { token } = req.query as { token?: string };
    if (!token) return res.status(400).json({ error: "Token requerido." });

    const [reg] = await db
      .select()
      .from(contador_registrations)
      .where(eq(contador_registrations.token_confirmacion, token))
      .limit(1);

    if (!reg) return res.status(404).json({ error: "Token inválido o expirado." });
    if (reg.confirmado) return res.status(422).json({ error: "Este token ya fue usado." });

    const hubTenantId = await getHubTenantId();

    const [user] = await db.insert(users).values({
      tenant_id: hubTenantId,
      email: reg.email,
      nombre: reg.nombre,
      role: "contador",
      password_hash: reg.password_hash,
    }).returning();

    await db.update(contador_registrations).set({
      confirmado: true,
      confirmado_at: new Date(),
      user_id: user.id,
    }).where(eq(contador_registrations.id, reg.id));

    const accessToken = signAccessToken(user, hubTenantId);
    const refreshToken = await createRefreshToken(user.id, hubTenantId);

    return res.json({ ok: true, accessToken, refreshToken, nombre: user.nombre });
  } catch (err) {
    console.error("Error en GET /contadores/confirmar:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /api/contadores/mis-empresas (autenticado) ───────────────────────
router.get("/mis-empresas", authenticate, async (req, res) => {
  try {
    const accesos = await db
      .select({
        acceso_id: user_accesos.id,
        tenant_id: user_accesos.tenant_id,
        nombre: tenants.nombre,
        nit: tenants.nit,
        plan_nombre: plans.nombre,
        plan_slug: plans.slug,
        activo: tenants.activo,
        plan_ends_at: tenants.plan_ends_at,
        role: user_accesos.role,
        permisos_contables: user_accesos.permisos_contables,
      })
      .from(user_accesos)
      .innerJoin(tenants, eq(tenants.id, user_accesos.tenant_id))
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .where(and(
        eq(user_accesos.user_id, req.userId),
        eq(user_accesos.role, "contador"),
      ))
      .orderBy(tenants.nombre);

    return res.json(accesos);
  } catch (err) {
    console.error("Error en GET /contadores/mis-empresas:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /api/contadores/mis-comisiones (autenticado) ─────────────────────
router.get("/mis-comisiones", authenticate, async (req, res) => {
  try {
    const comisiones = await db
      .select({
        id: comisiones_contador.id,
        tenant_nombre: tenants.nombre,
        tipo: comisiones_contador.tipo,
        base_cop: comisiones_contador.base_cop,
        valor_cop: comisiones_contador.valor_cop,
        porcentaje: comisiones_contador.porcentaje,
        pagada: comisiones_contador.pagada,
        fecha_pago: comisiones_contador.fecha_pago,
        created_at: comisiones_contador.created_at,
      })
      .from(comisiones_contador)
      .innerJoin(tenants, eq(tenants.id, comisiones_contador.tenant_id))
      .where(eq(comisiones_contador.contador_user_id, req.userId))
      .orderBy(desc(comisiones_contador.created_at));

    const pendiente = comisiones.filter((c) => !c.pagada).reduce((s, c) => s + c.valor_cop, 0);
    const pagada_total = comisiones.filter((c) => c.pagada).reduce((s, c) => s + c.valor_cop, 0);

    return res.json({ comisiones, pendiente, pagada_total });
  } catch (err) {
    console.error("Error en GET /contadores/mis-comisiones:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

export { router as contadoresRouter };
export default router;
