import { Router } from "express";
import { db, users, user_accesos, USER_ROLES } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { assertCanAddUsuario } from "../guards/plan-limits.js";
import { PlanLimitError } from "@workspace/shared";
import { audit } from "../services/audit.service.js";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden gestionar usuarios." });
  }
  next();
}

router.use(requireAdmin);

// GET /api/usuarios
router.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      nombre: users.nombre,
      role: users.role,
      activo: users.activo,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.tenant_id, req.tenantId))
    .orderBy(users.nombre);

  res.json(rows);
});

// POST /api/usuarios
router.post("/", async (req, res) => {
  const { email, nombre, password, role } = req.body;

  if (!email || !nombre || !password) {
    return res.status(400).json({ error: "Campos requeridos: email, nombre, password." });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }

  const roleValido = role && (USER_ROLES as readonly string[]).includes(role) ? role : "operario";

  try {
    await assertCanAddUsuario(req.tenant);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }

  const [existente] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existente) return res.status(422).json({ error: "Ya existe un usuario con ese correo electrónico." });

  const password_hash = await bcrypt.hash(password, 12);

  const [nuevo] = await db
    .insert(users)
    .values({
      tenant_id: req.tenantId,
      email,
      nombre,
      role: roleValido,
      password_hash,
    })
    .returning();

  const { password_hash: _, ...sinHash } = nuevo;
  void audit({ tenantId: req.tenantId, userId: req.userId, accion: "usuario.creado", entidadTipo: "usuario", entidadId: nuevo.id, detalle: { email: nuevo.email, role: nuevo.role }, ip: req.ip });
  res.status(201).json(sinHash);
});

// PATCH /api/usuarios/:id
router.patch("/:id", async (req, res) => {
  const [usuario] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, req.params.id), eq(users.tenant_id, req.tenantId)))
    .limit(1);

  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });

  if (req.params.id === req.userId && req.body.activo === false) {
    return res.status(422).json({ error: "No puedes desactivar tu propia cuenta." });
  }

  const { nombre, role, activo } = req.body;

  if (role !== undefined && !(USER_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ error: `Rol inválido. Opciones: ${USER_ROLES.join(", ")}.` });
  }

  const [actualizado] = await db
    .update(users)
    .set({
      ...(nombre !== undefined && { nombre }),
      ...(role !== undefined && { role }),
      ...(activo !== undefined && { activo }),
    })
    .where(eq(users.id, usuario.id))
    .returning();

  const { password_hash: _, ...sinHash } = actualizado;
  void audit({ tenantId: req.tenantId, userId: req.userId, accion: "usuario.modificado", entidadTipo: "usuario", entidadId: usuario.id, detalle: { campo: req.body }, ip: req.ip });
  res.json(sinHash);
});

// GET /api/usuarios/externos — lista de contadores externos vinculados a esta empresa
router.get("/externos", async (req, res) => {
  const accesos = await db
    .select({
      id: user_accesos.id,
      user_id: user_accesos.user_id,
      role: user_accesos.role,
      created_at: user_accesos.created_at,
      nombre: users.nombre,
      email: users.email,
      activo: users.activo,
    })
    .from(user_accesos)
    .innerJoin(users, eq(user_accesos.user_id, users.id))
    .where(eq(user_accesos.tenant_id, req.tenantId));

  res.json(accesos);
});

// POST /api/usuarios/vincular-externo — vincula un usuario existente como contador/rol externo
router.post("/vincular-externo", async (req, res) => {
  const { email, role = "contador" } = req.body as { email?: string; role?: string };

  if (!email) return res.status(400).json({ error: "Campo requerido: email." });

  if (!(USER_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ error: `Rol inválido. Opciones: ${USER_ROLES.join(", ")}.` });
  }

  // Buscar usuario por email (en cualquier tenant)
  const [usuarioExterno] = await db
    .select({ id: users.id, nombre: users.nombre, email: users.email, tenant_id: users.tenant_id, activo: users.activo })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!usuarioExterno) {
    return res.status(404).json({
      error: "No existe un usuario con ese correo en Doravia. Pídele que se registre primero, o créalo como usuario interno.",
      code: "USER_NOT_FOUND",
    });
  }

  if (!usuarioExterno.activo) {
    return res.status(422).json({ error: "Ese usuario está inactivo." });
  }

  if (usuarioExterno.tenant_id === req.tenantId) {
    return res.status(422).json({ error: "Ese usuario ya pertenece a esta empresa." });
  }

  // Verificar que no esté ya vinculado
  const [yaVinculado] = await db
    .select({ id: user_accesos.id })
    .from(user_accesos)
    .where(and(eq(user_accesos.user_id, usuarioExterno.id), eq(user_accesos.tenant_id, req.tenantId)))
    .limit(1);

  if (yaVinculado) {
    return res.status(422).json({ error: "Este usuario ya tiene acceso a esta empresa." });
  }

  const [nuevo] = await db
    .insert(user_accesos)
    .values({
      user_id: usuarioExterno.id,
      tenant_id: req.tenantId,
      role: role as "admin" | "contador" | "vendedor" | "operario",
      invitado_por: req.userId,
    })
    .returning();

  res.status(201).json({
    id: nuevo.id,
    user_id: usuarioExterno.id,
    nombre: usuarioExterno.nombre,
    email: usuarioExterno.email,
    role: nuevo.role,
    created_at: nuevo.created_at,
  });
});

// DELETE /api/usuarios/externo/:accesoId — revoca el acceso externo
router.delete("/externo/:accesoId", async (req, res) => {
  const [acceso] = await db
    .select({ id: user_accesos.id })
    .from(user_accesos)
    .where(and(eq(user_accesos.id, req.params.accesoId), eq(user_accesos.tenant_id, req.tenantId)))
    .limit(1);

  if (!acceso) return res.status(404).json({ error: "Acceso no encontrado." });

  await db.delete(user_accesos).where(eq(user_accesos.id, acceso.id));
  res.json({ ok: true });
});

export default router;
