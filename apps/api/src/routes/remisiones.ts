import { Router } from "express";
import { db, remisiones, items_remision } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { EstadoRemision } from "@workspace/db";
import { siguienteConsecutivo } from "../services/consecutivo.service.js";

const router = Router();

// GET /api/remisiones — lista remisiones del tenant con filtro opcional por estado
router.get("/", async (req, res) => {
  try {
    const { estado } = req.query as { estado?: string };

    const condiciones = [eq(remisiones.tenant_id, req.tenantId)];
    if (estado && ["borrador", "enviada", "entregada", "anulada"].includes(estado)) {
      condiciones.push(eq(remisiones.estado, estado as EstadoRemision));
    }

    const rows = await db
      .select()
      .from(remisiones)
      .where(and(...condiciones))
      .orderBy(desc(remisiones.created_at));

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /remisiones:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/remisiones/:id — detalle de una remisión con sus ítems
router.get("/:id", async (req, res) => {
  try {
    const [remision] = await db
      .select()
      .from(remisiones)
      .where(and(eq(remisiones.id, req.params.id), eq(remisiones.tenant_id, req.tenantId)))
      .limit(1);

    if (!remision) return res.status(404).json({ error: "Remisión no encontrada." });

    const items = await db
      .select()
      .from(items_remision)
      .where(eq(items_remision.remision_id, remision.id));

    res.json({ ...remision, items });
  } catch (err) {
    console.error("Error en GET /remisiones/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/remisiones — crea una remisión nueva
router.post("/", async (req, res) => {
  try {
    const {
      cliente_id,
      nombre_cliente,
      direccion_entrega,
      fecha,
      fecha_entrega,
      observaciones,
      items = [],
    } = req.body as {
      cliente_id?: string;
      nombre_cliente?: string;
      direccion_entrega?: string;
      fecha: string;
      fecha_entrega?: string;
      observaciones?: string;
      items: Array<{
        producto_id?: string;
        descripcion: string;
        cantidad: number;
        precio_unitario: number;
      }>;
    };

    if (!fecha) {
      return res.status(400).json({ error: "Campo requerido: fecha." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "La remisión debe tener al menos un ítem." });
    }

    // Calcular consecutivo con bloqueo para evitar duplicados en inserciones concurrentes
    const consecutivo = await siguienteConsecutivo("remisiones", "consecutivo", req.tenantId);
    const anio = fecha.slice(0, 4);
    const numero = `REM-${anio}-${String(consecutivo).padStart(4, "0")}`;

    // Calcular total de ítems
    const totalCalculado = items.reduce(
      (acc, item) => acc + Number(item.cantidad) * Number(item.precio_unitario),
      0,
    );

    const nuevaRemision = await db.transaction(async (tx) => {
      const [remision] = await tx
        .insert(remisiones)
        .values({
          tenant_id: req.tenantId,
          numero,
          consecutivo,
          cliente_id: cliente_id ?? null,
          nombre_cliente: nombre_cliente ?? null,
          direccion_entrega: direccion_entrega ?? null,
          fecha,
          fecha_entrega: fecha_entrega ?? null,
          total: String(totalCalculado.toFixed(2)),
          estado: "borrador",
          observaciones: observaciones ?? null,
          creado_por: req.userId,
        })
        .returning();

      if (items.length > 0) {
        await tx.insert(items_remision).values(
          items.map((item) => ({
            remision_id: remision.id,
            producto_id: item.producto_id ?? null,
            descripcion: item.descripcion,
            cantidad: String(item.cantidad),
            precio_unitario: String(item.precio_unitario),
            total: String((Number(item.cantidad) * Number(item.precio_unitario)).toFixed(2)),
          })),
        );
      }

      return remision;
    });

    res.status(201).json(nuevaRemision);
  } catch (err) {
    console.error("Error en POST /remisiones:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/remisiones/:id — actualiza estado, observaciones, fechas o datos del cliente
router.patch("/:id", async (req, res) => {
  try {
    const [remision] = await db
      .select()
      .from(remisiones)
      .where(and(eq(remisiones.id, req.params.id), eq(remisiones.tenant_id, req.tenantId)))
      .limit(1);

    if (!remision) return res.status(404).json({ error: "Remisión no encontrada." });

    const {
      estado,
      observaciones,
      fecha_entrega,
      nombre_cliente,
      direccion_entrega,
    } = req.body as {
      estado?: EstadoRemision;
      observaciones?: string;
      fecha_entrega?: string;
      nombre_cliente?: string;
      direccion_entrega?: string;
    };

    const ESTADOS_VALIDOS = ["borrador", "enviada", "entregada", "anulada"];
    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Opciones: ${ESTADOS_VALIDOS.join(", ")}.` });
    }

    const [actualizada] = await db
      .update(remisiones)
      .set({
        ...(estado !== undefined && { estado }),
        ...(observaciones !== undefined && { observaciones }),
        ...(fecha_entrega !== undefined && { fecha_entrega }),
        ...(nombre_cliente !== undefined && { nombre_cliente }),
        ...(direccion_entrega !== undefined && { direccion_entrega }),
        updated_at: sql`now()`,
      })
      .where(eq(remisiones.id, remision.id))
      .returning();

    res.json(actualizada);
  } catch (err) {
    console.error("Error en PATCH /remisiones/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// DELETE /api/remisiones/:id — solo se puede eliminar si está en borrador
router.delete("/:id", async (req, res) => {
  try {
    const [remision] = await db
      .select()
      .from(remisiones)
      .where(and(eq(remisiones.id, req.params.id), eq(remisiones.tenant_id, req.tenantId)))
      .limit(1);

    if (!remision) return res.status(404).json({ error: "Remisión no encontrada." });

    if (remision.estado !== "borrador") {
      return res.status(422).json({
        error: "Solo se pueden eliminar remisiones en estado borrador. Anula la remisión primero.",
      });
    }

    await db.delete(remisiones).where(eq(remisiones.id, remision.id));

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /remisiones/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
