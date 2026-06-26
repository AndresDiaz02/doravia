import { Router } from "express";
import { db, plantillas_factura, clientes } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ejecutarPlantilla } from "../jobs/recurrentes.js";

const router = Router();

// GET /api/recurrentes — listado con datos del cliente
router.get("/", async (req, res) => {
  const rows = await db
    .select({
      plantilla: plantillas_factura,
      cliente: { id: clientes.id, nombre: clientes.nombre },
    })
    .from(plantillas_factura)
    .innerJoin(clientes, eq(plantillas_factura.cliente_id, clientes.id))
    .where(eq(plantillas_factura.tenant_id, req.tenantId))
    .orderBy(plantillas_factura.proxima_ejecucion);

  res.json(rows.map((r) => ({ ...r.plantilla, cliente: r.cliente })));
});

// POST /api/recurrentes — crear plantilla
router.post("/", async (req, res) => {
  const {
    nombre,
    cliente_id,
    frecuencia,
    dias_vencimiento,
    proxima_ejecucion,
    items,
    observaciones,
  } = req.body;

  if (!nombre || !cliente_id || !frecuencia || !proxima_ejecucion || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "Campos requeridos: nombre, cliente_id, frecuencia, proxima_ejecucion, items.",
    });
  }

  // Verificar que el cliente pertenece al tenant
  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, cliente_id), eq(clientes.tenant_id, req.tenantId)))
    .limit(1);

  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

  const [nueva] = await db
    .insert(plantillas_factura)
    .values({
      tenant_id: req.tenantId,
      nombre,
      cliente_id,
      frecuencia,
      dias_vencimiento: dias_vencimiento ?? 30,
      proxima_ejecucion,
      items,
      observaciones: observaciones ?? null,
    })
    .returning();

  res.status(201).json(nueva);
});

// PATCH /api/recurrentes/:id
router.patch("/:id", async (req, res) => {
  const [plantilla] = await db
    .select()
    .from(plantillas_factura)
    .where(and(eq(plantillas_factura.id, req.params.id), eq(plantillas_factura.tenant_id, req.tenantId)))
    .limit(1);

  if (!plantilla) return res.status(404).json({ error: "Plantilla no encontrada." });

  const { nombre, frecuencia, dias_vencimiento, activo, items, proxima_ejecucion, observaciones } = req.body;

  const [actualizada] = await db
    .update(plantillas_factura)
    .set({
      ...(nombre !== undefined && { nombre }),
      ...(frecuencia !== undefined && { frecuencia }),
      ...(dias_vencimiento !== undefined && { dias_vencimiento }),
      ...(activo !== undefined && { activo }),
      ...(items !== undefined && { items }),
      ...(proxima_ejecucion !== undefined && { proxima_ejecucion }),
      ...(observaciones !== undefined && { observaciones }),
    })
    .where(eq(plantillas_factura.id, plantilla.id))
    .returning();

  res.json(actualizada);
});

// POST /api/recurrentes/:id/ejecutar — ejecución manual
router.post("/:id/ejecutar", async (req, res) => {
  const [plantilla] = await db
    .select()
    .from(plantillas_factura)
    .where(and(eq(plantillas_factura.id, req.params.id), eq(plantillas_factura.tenant_id, req.tenantId)))
    .limit(1);

  if (!plantilla) return res.status(404).json({ error: "Plantilla no encontrada." });
  if (!plantilla.activo) return res.status(422).json({ error: "La plantilla está inactiva." });

  try {
    const factura = await ejecutarPlantilla(plantilla, req.tenant);
    res.status(201).json(factura);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error al generar la factura." });
  }
});

export default router;
