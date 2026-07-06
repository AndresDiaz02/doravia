import { Router } from "express";
import { db, users, user_accesos, USER_ROLES } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
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
      permisos_contables: users.permisos_contables,
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

  const { nombre, role, activo, permisos_contables } = req.body;

  if (role !== undefined && !(USER_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ error: `Rol inválido. Opciones: ${USER_ROLES.join(", ")}.` });
  }

  const rolFinal = role !== undefined ? role : usuario.role;
  if (permisos_contables === true && rolFinal !== "contador") {
    return res.status(422).json({ error: "Los permisos contables solo aplican al rol Contador." });
  }

  const [actualizado] = await db
    .update(users)
    .set({
      ...(nombre !== undefined && { nombre }),
      ...(role !== undefined && { role }),
      ...(activo !== undefined && { activo }),
      ...(permisos_contables !== undefined && { permisos_contables }),
    })
    .where(eq(users.id, usuario.id))
    .returning();

  const { password_hash: _, ...sinHash } = actualizado;
  void audit({ tenantId: req.tenantId, userId: req.userId, accion: "usuario.modificado", entidadTipo: "usuario", entidadId: usuario.id, detalle: { campo: req.body }, ip: req.ip });
  res.json(sinHash);
});

// ─── Cajeros POS (usuarios sin email visible, solo usuario_pos) ──────────────

// GET /api/usuarios/cajeros — lista cajeros POS del tenant
router.get("/cajeros", async (req, res) => {
  try {
    const cajeros = await db
      .select({
        id: users.id,
        nombre: users.nombre,
        usuario_pos: users.usuario_pos,
        activo: users.activo,
        created_at: users.created_at,
      })
      .from(users)
      .where(and(eq(users.tenant_id, req.tenantId), isNotNull(users.usuario_pos)))
      .orderBy(users.nombre);

    res.json(cajeros);
  } catch (err) {
    console.error("Error en GET /usuarios/cajeros:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/usuarios/cajeros — crea un cajero POS
router.post("/cajeros", async (req, res) => {
  try {
    const { nombre, usuario_pos, password } = req.body as {
      nombre?: string;
      usuario_pos?: string;
      password?: string;
    };

    if (!nombre || !usuario_pos) {
      return res.status(400).json({ error: "Campos requeridos: nombre, usuario_pos." });
    }
    if (!password || (password as string).length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }
    if (/\s|@/.test(usuario_pos)) {
      return res.status(400).json({ error: "El usuario POS no puede contener espacios ni el carácter @." });
    }

    // El email se genera internamente y nunca se muestra al usuario
    const emailInterno = `${usuario_pos.toLowerCase()}@cajero.pos`;

    // Verificar que el email interno no exista
    const [existente] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emailInterno))
      .limit(1);

    if (existente) {
      return res.status(422).json({ error: "Ya existe un cajero con ese nombre de usuario en esta empresa." });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const [nuevo] = await db
      .insert(users)
      .values({
        tenant_id: req.tenantId,
        email: emailInterno,
        nombre,
        role: "operario",
        password_hash,
        usuario_pos: usuario_pos.toLowerCase(),
      })
      .returning();

    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "cajero.creado", entidadTipo: "usuario", entidadId: nuevo.id, detalle: { usuario_pos: nuevo.usuario_pos }, ip: req.ip });
    res.status(201).json({ id: nuevo.id, nombre: nuevo.nombre, usuario_pos: nuevo.usuario_pos, activo: nuevo.activo });
  } catch (err) {
    console.error("Error en POST /usuarios/cajeros:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/usuarios/cajeros/:id/reset-password — restablece contraseña sin validar la actual
router.patch("/cajeros/:id/reset-password", async (req, res) => {
  try {
    const [cajero] = await db
      .select({ id: users.id, usuario_pos: users.usuario_pos })
      .from(users)
      .where(and(eq(users.id, req.params.id), eq(users.tenant_id, req.tenantId), isNotNull(users.usuario_pos)))
      .limit(1);

    if (!cajero) return res.status(404).json({ error: "Cajero no encontrado." });

    const { nueva_password } = req.body as { nueva_password?: string };
    if (!nueva_password || (nueva_password as string).length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }

    const password_hash = await bcrypt.hash(nueva_password, 12);
    await db.update(users).set({ password_hash }).where(eq(users.id, cajero.id));

    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "cajero.password_reseteada", entidadTipo: "usuario", entidadId: cajero.id, ip: req.ip });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en PATCH /usuarios/cajeros/:id/reset-password:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/usuarios/cajeros/:id — actualiza nombre o estado del cajero
router.patch("/cajeros/:id", async (req, res) => {
  try {
    const [cajero] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, req.params.id), eq(users.tenant_id, req.tenantId), isNotNull(users.usuario_pos)))
      .limit(1);

    if (!cajero) return res.status(404).json({ error: "Cajero no encontrado." });

    const { nombre, activo } = req.body as { nombre?: string; activo?: boolean };

    const [actualizado] = await db
      .update(users)
      .set({
        ...(nombre !== undefined && { nombre }),
        ...(activo !== undefined && { activo }),
      })
      .where(eq(users.id, cajero.id))
      .returning();

    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "cajero.modificado", entidadTipo: "usuario", entidadId: cajero.id, detalle: req.body, ip: req.ip });
    res.json({ id: actualizado.id, nombre: actualizado.nombre, usuario_pos: actualizado.usuario_pos, activo: actualizado.activo });
  } catch (err) {
    console.error("Error en PATCH /usuarios/cajeros/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/usuarios/externos
router.get("/externos", async (req, res) => {
  const accesos = await db
    .select({
      id: user_accesos.id,
      user_id: user_accesos.user_id,
      role: user_accesos.role,
      permisos_contables: user_accesos.permisos_contables,
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

// POST /api/usuarios/vincular-externo
router.post("/vincular-externo", async (req, res) => {
  const { email, role = "contador" } = req.body as { email?: string; role?: string };

  if (!email) return res.status(400).json({ error: "Campo requerido: email." });

  if (!(USER_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ error: `Rol inválido. Opciones: ${USER_ROLES.join(", ")}.` });
  }

  const [usuarioExterno] = await db
    .select({ id: users.id, nombre: users.nombre, email: users.email, tenant_id: users.tenant_id, activo: users.activo })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!usuarioExterno) {
    return res.status(404).json({
      error: "No existe un usuario con ese correo en Doravia. Si es un contador, pídele que se registre en doraviasoft.com/registro-contador.",
      code: "USER_NOT_FOUND",
    });
  }

  if (!usuarioExterno.activo) {
    return res.status(422).json({ error: "Ese usuario está inactivo." });
  }

  if (usuarioExterno.tenant_id === req.tenantId) {
    return res.status(422).json({ error: "Ese usuario ya pertenece a esta empresa." });
  }

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

  void audit({ tenantId: req.tenantId, userId: req.userId, accion: "acceso_externo.vinculado", entidadTipo: "user_acceso", entidadId: nuevo.id, detalle: { email: usuarioExterno.email, role: nuevo.role }, ip: req.ip });
  res.status(201).json({
    id: nuevo.id,
    user_id: usuarioExterno.id,
    nombre: usuarioExterno.nombre,
    email: usuarioExterno.email,
    role: nuevo.role,
    permisos_contables: nuevo.permisos_contables,
    created_at: nuevo.created_at,
  });
});

// PATCH /api/usuarios/externo/:accesoId — actualiza permisos_contables del acceso externo
router.patch("/externo/:accesoId", async (req, res) => {
  const [acceso] = await db
    .select({ id: user_accesos.id, role: user_accesos.role })
    .from(user_accesos)
    .where(and(eq(user_accesos.id, req.params.accesoId), eq(user_accesos.tenant_id, req.tenantId)))
    .limit(1);

  if (!acceso) return res.status(404).json({ error: "Acceso no encontrado." });

  const { permisos_contables } = req.body;

  if (permisos_contables === true && acceso.role !== "contador") {
    return res.status(422).json({ error: "Los permisos contables solo aplican al rol Contador." });
  }

  const [actualizado] = await db
    .update(user_accesos)
    .set({ ...(permisos_contables !== undefined && { permisos_contables }) })
    .where(eq(user_accesos.id, acceso.id))
    .returning();

  void audit({ tenantId: req.tenantId, userId: req.userId, accion: "acceso_externo.modificado", entidadTipo: "user_acceso", entidadId: acceso.id, detalle: { permisos_contables }, ip: req.ip });
  res.json(actualizado);
});

// DELETE /api/usuarios/externo/:accesoId
router.delete("/externo/:accesoId", async (req, res) => {
  const [acceso] = await db
    .select({ id: user_accesos.id })
    .from(user_accesos)
    .where(and(eq(user_accesos.id, req.params.accesoId), eq(user_accesos.tenant_id, req.tenantId)))
    .limit(1);

  if (!acceso) return res.status(404).json({ error: "Acceso no encontrado." });

  await db.delete(user_accesos).where(eq(user_accesos.id, acceso.id));
  void audit({ tenantId: req.tenantId, userId: req.userId, accion: "acceso_externo.desvinculado", entidadTipo: "user_acceso", entidadId: acceso.id, ip: req.ip });
  res.json({ ok: true });
});

export default router;
