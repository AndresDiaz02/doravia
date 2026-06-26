import { Router } from "express";
import { db, clientes } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { facturas } from "@workspace/db";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.tenant_id, req.tenantId), eq(clientes.activo, true)))
      .orderBy(clientes.nombre)
      .limit(limit)
      .offset(offset);

    res.json({ data: rows, page, limit });
  } catch (err) {
    console.error("Error en GET /clientes:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.id, req.params.id), eq(clientes.tenant_id, req.tenantId)))
      .limit(1);

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

    const historial = await db
      .select({
        id: facturas.id,
        numero: facturas.numero,
        fecha_emision: facturas.fecha_emision,
        estado: facturas.estado,
        total: facturas.total,
      })
      .from(facturas)
      .where(and(eq(facturas.cliente_id, cliente.id), eq(facturas.tenant_id, req.tenantId)))
      .orderBy(desc(facturas.fecha_emision))
      .limit(50);

    res.json({ ...cliente, historial });
  } catch (err) {
    console.error("Error en GET /clientes/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { tipo_persona, tipo_documento, numero_documento, nombre, correo, telefono, direccion, municipio, departamento, digito_verificacion } = req.body;

    if (!tipo_persona || !tipo_documento || !numero_documento || !nombre) {
      return res.status(400).json({ error: "Campos requeridos: tipo_persona, tipo_documento, numero_documento, nombre." });
    }

    const [nuevo] = await db
      .insert(clientes)
      .values({
        tenant_id: req.tenantId,
        tipo_persona,
        tipo_documento,
        numero_documento,
        digito_verificacion: digito_verificacion ?? null,
        nombre,
        correo: correo ?? null,
        telefono: telefono ?? null,
        direccion: direccion ?? null,
        municipio: municipio ?? null,
        departamento: departamento ?? null,
      })
      .returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /clientes:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.id, req.params.id), eq(clientes.tenant_id, req.tenantId)))
      .limit(1);

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

    const { nombre, correo, telefono, direccion, municipio, departamento } = req.body;

    const [actualizado] = await db
      .update(clientes)
      .set({ nombre, correo, telefono, direccion, municipio, departamento })
      .where(eq(clientes.id, cliente.id))
      .returning();

    res.json(actualizado);
  } catch (err) {
    console.error("Error en PATCH /clientes/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
