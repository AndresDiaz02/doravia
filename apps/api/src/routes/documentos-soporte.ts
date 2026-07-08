import { Router } from "express";
import { db, documentos_soporte, items_documento_soporte } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { siguienteConsecutivo } from "../services/consecutivo.service.js";

const router = Router();

// Módulo en prototipo — requiere habilitar FEATURE_DOC_SOPORTE=true explícitamente.
// La transmisión a DIAN no está implementada ni verificada con Plemsi.
router.use((_req, res, next) => {
  if (process.env.FEATURE_DOC_SOPORTE !== "true") {
    return res.status(404).json({ error: "Módulo no disponible." });
  }
  next();
});

// ── GET / — listar documentos soporte del tenant ─────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, vendedor } = req.query as {
      fecha_inicio?: string;
      fecha_fin?: string;
      vendedor?: string;
    };

    const condiciones = [
      eq(documentos_soporte.tenant_id, req.tenantId),
      eq(documentos_soporte.anulado, false),
    ];

    if (fecha_inicio) condiciones.push(gte(documentos_soporte.fecha, fecha_inicio));
    if (fecha_fin) condiciones.push(lte(documentos_soporte.fecha, fecha_fin));
    if (vendedor) condiciones.push(sql`${documentos_soporte.nombre_vendedor} ILIKE ${"%" + vendedor + "%"}`);

    const rows = await db
      .select()
      .from(documentos_soporte)
      .where(and(...condiciones))
      .orderBy(documentos_soporte.consecutivo);

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /documentos-soporte:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST / — crear documento soporte ─────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "contador") {
      return res.status(403).json({ error: "Solo administradores o contadores pueden crear documentos soporte." });
    }

    const {
      nombre_vendedor,
      tipo_documento_vendedor,
      nit_vendedor,
      descripcion,
      items,
      iva_asumido,
      retencion_fuente,
      fecha,
      observaciones,
    } = req.body as {
      nombre_vendedor?: string;
      tipo_documento_vendedor?: string;
      nit_vendedor?: string;
      descripcion?: string;
      items?: Array<{ descripcion: string; cantidad: number; valor_unitario: number }>;
      iva_asumido?: number;
      retencion_fuente?: number;
      fecha?: string;
      observaciones?: string;
    };

    if (!nombre_vendedor || !nit_vendedor || !descripcion || !fecha) {
      return res.status(400).json({
        error: "Campos requeridos: nombre_vendedor, nit_vendedor, descripcion, fecha.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Se requiere al menos un ítem." });
    }

    // Calcular totales
    const itemsConTotal = items.map((item) => ({
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      valor_unitario: Number(item.valor_unitario),
      total: Math.round(Number(item.cantidad) * Number(item.valor_unitario)),
    }));

    const subtotal = itemsConTotal.reduce((s, i) => s + i.total, 0);
    const ivaAsumidoNum = Number(iva_asumido ?? 0);
    const retencionFuenteNum = Number(retencion_fuente ?? 0);
    const total = subtotal + ivaAsumidoNum - retencionFuenteNum;

    // Consecutivo seguro con lock
    const consecutivo = await siguienteConsecutivo("documentos_soporte", "consecutivo", req.tenantId);
    const numero = `DS-${String(consecutivo).padStart(5, "0")}`;

    // Insertar documento e ítems en transacción
    const resultado = await db.transaction(async (tx) => {
      const [documento] = await tx
        .insert(documentos_soporte)
        .values({
          tenant_id: req.tenantId,
          numero,
          consecutivo,
          nombre_vendedor,
          tipo_documento_vendedor: tipo_documento_vendedor ?? "CC",
          nit_vendedor,
          descripcion,
          subtotal: String(subtotal),
          iva_asumido: String(ivaAsumidoNum),
          retencion_fuente: String(retencionFuenteNum),
          total: String(total),
          fecha,
          observaciones: observaciones ?? null,
        })
        .returning();

      await tx.insert(items_documento_soporte).values(
        itemsConTotal.map((item) => ({
          documento_id: documento.id,
          descripcion: item.descripcion,
          cantidad: String(item.cantidad),
          valor_unitario: String(item.valor_unitario),
          total: String(item.total),
        })),
      );

      return documento;
    });

    res.status(201).json(resultado);
  } catch (err) {
    console.error("Error en POST /documentos-soporte:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /:id — detalle con ítems ─────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const [documento] = await db
      .select()
      .from(documentos_soporte)
      .where(and(eq(documentos_soporte.id, req.params.id), eq(documentos_soporte.tenant_id, req.tenantId)))
      .limit(1);

    if (!documento) return res.status(404).json({ error: "Documento soporte no encontrado." });

    const itemsDoc = await db
      .select()
      .from(items_documento_soporte)
      .where(eq(items_documento_soporte.documento_id, documento.id));

    res.json({ ...documento, items: itemsDoc });
  } catch (err) {
    console.error("Error en GET /documentos-soporte/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── DELETE /:id — anular documento (no borrar) ───────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede anular documentos soporte." });
    }

    const [documento] = await db
      .select()
      .from(documentos_soporte)
      .where(and(eq(documentos_soporte.id, req.params.id), eq(documentos_soporte.tenant_id, req.tenantId)))
      .limit(1);

    if (!documento) return res.status(404).json({ error: "Documento soporte no encontrado." });
    if (documento.anulado) return res.status(422).json({ error: "El documento ya está anulado." });

    const [anulado] = await db
      .update(documentos_soporte)
      .set({ anulado: true })
      .where(eq(documentos_soporte.id, documento.id))
      .returning();

    res.json({ ok: true, documento: anulado });
  } catch (err) {
    console.error("Error en DELETE /documentos-soporte/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
