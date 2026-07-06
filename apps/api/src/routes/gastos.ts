import { Router } from "express";
import { db, gastos, proveedores } from "@workspace/db";
import { eq, and, desc, isNull, lt } from "drizzle-orm";
import { crearAsientoGasto, verificarPeriodoAbierto } from "../services/contabilidad.service.js";
import { requireNotContador } from "../middleware/require-plan-feature.js";

const router = Router();

// ── Proveedores ───────────────────────────────────────────────────────────────

router.get("/proveedores", async (req, res) => {
  const rows = await db
    .select()
    .from(proveedores)
    .where(eq(proveedores.tenant_id, req.tenantId))
    .orderBy(proveedores.nombre);
  res.json(rows);
});

router.post("/proveedores", requireNotContador, async (req, res) => {
  const { nombre, tipo_documento, nit, correo, telefono, direccion, ciudad, persona_contacto, terminos_pago, observaciones } = req.body;
  if (!nombre) return res.status(400).json({ error: "Campo requerido: nombre." });

  const [nuevo] = await db
    .insert(proveedores)
    .values({
      tenant_id: req.tenantId,
      nombre,
      tipo_documento: tipo_documento ?? "NIT",
      nit: nit ?? null,
      correo: correo ?? null,
      telefono: telefono ?? null,
      direccion: direccion ?? null,
      ciudad: ciudad ?? null,
      persona_contacto: persona_contacto ?? null,
      terminos_pago: terminos_pago ? Number(terminos_pago) : 0,
      observaciones: observaciones ?? null,
    })
    .returning();
  res.status(201).json(nuevo);
});

router.get("/proveedores/:id", async (req, res) => {
  const [prov] = await db
    .select()
    .from(proveedores)
    .where(and(eq(proveedores.id, req.params.id), eq(proveedores.tenant_id, req.tenantId)))
    .limit(1);

  if (!prov) return res.status(404).json({ error: "Proveedor no encontrado." });

  const historial = await db
    .select()
    .from(gastos)
    .where(and(eq(gastos.proveedor_id, prov.id), eq(gastos.tenant_id, req.tenantId)))
    .orderBy(desc(gastos.fecha))
    .limit(50);

  const totalCompras = historial.reduce((s, g) => s + Number(g.total), 0);
  const totalPendiente = historial
    .filter((g) => g.estado !== "pagado")
    .reduce((s, g) => s + Number(g.total), 0);

  res.json({ ...prov, historial, totalCompras, totalPendiente });
});

router.patch("/proveedores/:id", async (req, res) => {
  const [prov] = await db
    .select()
    .from(proveedores)
    .where(and(eq(proveedores.id, req.params.id), eq(proveedores.tenant_id, req.tenantId)))
    .limit(1);

  if (!prov) return res.status(404).json({ error: "Proveedor no encontrado." });

  const { nombre, tipo_documento, nit, correo, telefono, direccion, ciudad, persona_contacto, terminos_pago, observaciones, activo } = req.body;
  const [actualizado] = await db
    .update(proveedores)
    .set({
      ...(nombre !== undefined && { nombre }),
      ...(tipo_documento !== undefined && { tipo_documento }),
      ...(nit !== undefined && { nit }),
      ...(correo !== undefined && { correo }),
      ...(telefono !== undefined && { telefono }),
      ...(direccion !== undefined && { direccion }),
      ...(ciudad !== undefined && { ciudad }),
      ...(persona_contacto !== undefined && { persona_contacto }),
      ...(terminos_pago !== undefined && { terminos_pago: Number(terminos_pago) }),
      ...(observaciones !== undefined && { observaciones }),
      ...(activo !== undefined && { activo }),
    })
    .where(eq(proveedores.id, prov.id))
    .returning();

  res.json(actualizado);
});

// ── Gastos ────────────────────────────────────────────────────────────────────

// GET /api/gastos?page=1&limit=50
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: gastos.id,
      categoria: gastos.categoria,
      descripcion: gastos.descripcion,
      monto: gastos.monto,
      iva: gastos.iva,
      total: gastos.total,
      fecha: gastos.fecha,
      fecha_vencimiento: gastos.fecha_vencimiento,
      estado: gastos.estado,
      pagado_at: gastos.pagado_at,
      observaciones: gastos.observaciones,
      proveedor_id: gastos.proveedor_id,
      proveedor_nombre: proveedores.nombre,
    })
    .from(gastos)
    .leftJoin(proveedores, eq(gastos.proveedor_id, proveedores.id))
    .where(eq(gastos.tenant_id, req.tenantId))
    .orderBy(desc(gastos.fecha))
    .limit(limit)
    .offset(offset);

  res.json({ data: rows, page, limit });
});

// GET /api/gastos/cuentas-por-pagar — gastos pendientes de pago con vencimiento
router.get("/cuentas-por-pagar", async (req, res) => {
  const ahora = new Date().toISOString().split("T")[0];

  const rows = await db
    .select({
      id: gastos.id,
      descripcion: gastos.descripcion,
      categoria: gastos.categoria,
      total: gastos.total,
      monto: gastos.monto,
      iva: gastos.iva,
      fecha: gastos.fecha,
      fecha_vencimiento: gastos.fecha_vencimiento,
      estado: gastos.estado,
      pagado_at: gastos.pagado_at,
      observaciones: gastos.observaciones,
      proveedor_id: gastos.proveedor_id,
      proveedor_nombre: proveedores.nombre,
    })
    .from(gastos)
    .leftJoin(proveedores, eq(gastos.proveedor_id, proveedores.id))
    .where(
      and(
        eq(gastos.tenant_id, req.tenantId),
        eq(gastos.estado, "aprobado"),
        isNull(gastos.pagado_at),
      ),
    )
    .orderBy(gastos.fecha_vencimiento);

  res.json(rows);
});

// GET /api/gastos/:id
router.get("/:id", async (req, res) => {
  const [row] = await db
    .select({
      gasto: gastos,
      proveedor: { id: proveedores.id, nombre: proveedores.nombre, nit: proveedores.nit },
    })
    .from(gastos)
    .leftJoin(proveedores, eq(gastos.proveedor_id, proveedores.id))
    .where(and(eq(gastos.id, req.params.id), eq(gastos.tenant_id, req.tenantId)))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Gasto no encontrado." });
  res.json({ ...row.gasto, proveedor: row.proveedor });
});

// POST /api/gastos
router.post("/", requireNotContador, async (req, res) => {
  const {
    proveedor_id, categoria, descripcion, monto, iva,
    fecha, fecha_vencimiento, observaciones,
  } = req.body;

  if (!categoria || !descripcion || !monto || !fecha) {
    return res.status(400).json({ error: "Campos requeridos: categoria, descripcion, monto, fecha." });
  }

  const montoNum = Number(monto);
  const ivaNum = Number(iva ?? 0);

  if (isNaN(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: "El monto debe ser un número mayor a cero." });
  }
  if (isNaN(ivaNum) || ivaNum < 0) {
    return res.status(400).json({ error: "El IVA no puede ser negativo." });
  }

  const total = Number((montoNum + ivaNum).toFixed(2));

  try {
    await verificarPeriodoAbierto(req.tenantId, fecha as string);
  } catch (err) {
    return res.status(422).json({ error: (err as Error).message });
  }

  const [nuevo] = await db
    .insert(gastos)
    .values({
      tenant_id: req.tenantId,
      proveedor_id: proveedor_id ?? null,
      categoria,
      descripcion,
      monto: String(montoNum),
      iva: String(ivaNum),
      total: String(total),
      fecha,
      fecha_vencimiento: fecha_vencimiento ?? null,
      estado: "borrador",
      observaciones: observaciones ?? null,
    })
    .returning();

  res.status(201).json(nuevo);
});

// PATCH /api/gastos/:id
router.patch("/:id", requireNotContador, async (req, res) => {
  const [gasto] = await db
    .select()
    .from(gastos)
    .where(and(eq(gastos.id, req.params.id), eq(gastos.tenant_id, req.tenantId)))
    .limit(1);

  if (!gasto) return res.status(404).json({ error: "Gasto no encontrado." });
  if (gasto.estado === "pagado") {
    return res.status(422).json({ error: "No se puede modificar un gasto ya pagado." });
  }

  const { proveedor_id, categoria, descripcion, monto, iva, fecha, fecha_vencimiento, estado, observaciones } = req.body;

  const montoNum = monto !== undefined ? Number(monto) : Number(gasto.monto);
  const ivaNum = iva !== undefined ? Number(iva) : Number(gasto.iva);

  if (monto !== undefined && (isNaN(montoNum) || montoNum <= 0)) {
    return res.status(400).json({ error: "El monto debe ser un número mayor a cero." });
  }
  if (iva !== undefined && (isNaN(ivaNum) || ivaNum < 0)) {
    return res.status(400).json({ error: "El IVA no puede ser negativo." });
  }

  const aprobandoAhora = estado === "aprobado" && gasto.estado !== "aprobado" && !gasto.asiento_id;

  const [actualizado] = await db
    .update(gastos)
    .set({
      ...(proveedor_id !== undefined && { proveedor_id: proveedor_id || null }),
      ...(categoria !== undefined && { categoria }),
      ...(descripcion !== undefined && { descripcion }),
      ...(monto !== undefined && { monto: String(montoNum) }),
      ...(iva !== undefined && { iva: String(ivaNum) }),
      ...((monto !== undefined || iva !== undefined) && { total: String(Number((montoNum + ivaNum).toFixed(2))) }),
      ...(fecha !== undefined && { fecha }),
      ...(fecha_vencimiento !== undefined && { fecha_vencimiento: fecha_vencimiento || null }),
      ...(estado !== undefined && { estado }),
      ...(observaciones !== undefined && { observaciones }),
    })
    .where(eq(gastos.id, gasto.id))
    .returning();

  if (aprobandoAhora) {
    try {
      const asientoId = await crearAsientoGasto(req.tenantId, actualizado);
      await db.update(gastos).set({ asiento_id: asientoId }).where(eq(gastos.id, actualizado.id));
      actualizado.asiento_id = asientoId;
    } catch (err) {
      console.error("Error al crear asiento de gasto:", err);
    }
  }

  res.json(actualizado);
});

// PATCH /api/gastos/:id/pagar
router.patch("/:id/pagar", requireNotContador, async (req, res) => {
  const [gasto] = await db
    .select()
    .from(gastos)
    .where(and(eq(gastos.id, req.params.id), eq(gastos.tenant_id, req.tenantId)))
    .limit(1);

  if (!gasto) return res.status(404).json({ error: "Gasto no encontrado." });
  if (gasto.estado === "pagado") {
    return res.status(422).json({ error: "El gasto ya está marcado como pagado." });
  }

  const [actualizado] = await db
    .update(gastos)
    .set({ estado: "pagado", pagado_at: new Date() })
    .where(eq(gastos.id, gasto.id))
    .returning();

  res.json(actualizado);
});

export default router;
