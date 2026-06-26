import { Router } from "express";
import { db, users, USER_ROLES } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { assertCanAddUsuario } from "../guards/plan-limits.js";
import { PlanLimitError } from "@workspace/shared";

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
  res.json(sinHash);
});

export default router;
