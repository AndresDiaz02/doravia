import { Router } from "express";
import { db, facturas, items_factura, clientes, cotizaciones, items_cotizacion } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generarPdfFactura, generarPdfCotizacion, generarReciboCaja } from "../services/pdf.service.js";
import type { Readable } from "node:stream";

const router = Router();

// GET /api/documentos/facturas/:id/pdf
router.get("/facturas/:id/pdf", async (req, res) => {
  try {
    const [row] = await db
      .select({ factura: facturas, cliente: clientes })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(and(eq(facturas.id, req.params.id), eq(facturas.tenant_id, req.tenantId)))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Factura no encontrada." });

    const items = await db
      .select()
      .from(items_factura)
      .where(eq(items_factura.factura_id, row.factura.id));

    const stream = generarPdfFactura(row.factura, row.cliente, items, req.tenant);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${row.factura.numero}.pdf"`,
    );

    (stream as Readable).pipe(res);
  } catch (err) {
    console.error("Error en GET /facturas/:id/pdf:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/documentos/cotizaciones/:id/pdf
router.get("/cotizaciones/:id/pdf", async (req, res) => {
  try {
    const [row] = await db
      .select({ cotizacion: cotizaciones, cliente: clientes })
      .from(cotizaciones)
      .innerJoin(clientes, eq(cotizaciones.cliente_id, clientes.id))
      .where(and(eq(cotizaciones.id, req.params.id), eq(cotizaciones.tenant_id, req.tenantId)))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Cotización no encontrada." });

    const items = await db
      .select()
      .from(items_cotizacion)
      .where(eq(items_cotizacion.cotizacion_id, row.cotizacion.id));

    const stream = generarPdfCotizacion(row.cotizacion, row.cliente, items, req.tenant);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${row.cotizacion.numero}.pdf"`);
    (stream as Readable).pipe(res);
  } catch (err) {
    console.error("Error en GET /cotizaciones/:id/pdf:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/documentos/facturas/:id/recibo
// Genera el recibo de caja del pago de una factura
router.get("/facturas/:id/recibo", async (req, res) => {
  try {
    const [row] = await db
      .select({ factura: facturas, cliente: clientes })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(and(eq(facturas.id, req.params.id), eq(facturas.tenant_id, req.tenantId)))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Factura no encontrada." });
    if (!row.factura.pagada_at) {
      return res.status(422).json({ error: "La factura aún no ha sido marcada como pagada." });
    }

    const stream = generarReciboCaja(row.factura, row.cliente, req.tenant);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="RC-${row.factura.numero}.pdf"`);
    (stream as Readable).pipe(res);
  } catch (err) {
    console.error("Error en GET /documentos/facturas/:id/recibo:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
