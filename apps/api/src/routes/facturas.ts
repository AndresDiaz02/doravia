import { Router } from "express";
import { db, facturas, items_factura, clientes, retenciones_factura, resoluciones_dian } from "@workspace/db";
import { eq, and, desc, gte, lte, ilike, or, SQL, sql } from "drizzle-orm";
import { crearFactura, enviarAPlemsiSiAplica } from "../services/factura.service.js";
import { crearAsientoFactura, verificarPeriodoAbierto } from "../services/contabilidad.service.js";
import { enviarFacturaDian } from "../services/dian.service.js";
import { registrarSalidaFactura } from "../services/inventario.service.js";
import { audit } from "../services/audit.service.js";
import { PlanLimitError } from "@workspace/shared";
import { generarPdfFactura } from "../services/pdf.service.js";
import { enviarFacturaAceptada } from "../services/email.service.js";

const router = Router();

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [eq(facturas.tenant_id, req.tenantId)];
  if (req.query.desde) conditions.push(gte(facturas.fecha_emision, new Date(req.query.desde as string)));
  if (req.query.hasta) {
    const hasta = new Date(req.query.hasta as string);
    hasta.setHours(23, 59, 59, 999);
    conditions.push(lte(facturas.fecha_emision, hasta));
  }
  if (req.query.estado) conditions.push(sql`${facturas.estado} = ${req.query.estado}`);
  if (req.query.q) {
    const q = `%${req.query.q}%`;
    conditions.push(or(ilike(facturas.numero, q), ilike(clientes.nombre, q), ilike(clientes.numero_documento, q))!);
  }

  const rows = await db
    .select({
      id: facturas.id,
      numero: facturas.numero,
      fecha_emision: facturas.fecha_emision,
      estado: facturas.estado,
      estado_dian: facturas.estado_dian,
      error_dian: facturas.error_dian,
      total: facturas.total,
      pagada_at: facturas.pagada_at,
      cufe: facturas.cufe,
      cliente: { id: clientes.id, nombre: clientes.nombre, numero_documento: clientes.numero_documento },
    })
    .from(facturas)
    .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
    .where(and(...conditions))
    .orderBy(desc(facturas.fecha_emision))
    .limit(limit)
    .offset(offset);

  res.json({ data: rows, page, limit });
});

router.get("/:id", async (req, res) => {
  const [row] = await db
    .select({ factura: facturas, cliente: clientes })
    .from(facturas)
    .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
    .where(and(eq(facturas.id, req.params.id), eq(facturas.tenant_id, req.tenantId)))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Factura no encontrada." });

  const [items, retenciones] = await Promise.all([
    db.select().from(items_factura).where(eq(items_factura.factura_id, row.factura.id)),
    db.select().from(retenciones_factura).where(eq(retenciones_factura.factura_id, row.factura.id)),
  ]);

  res.json({ ...row.factura, cliente: row.cliente, items, retenciones });
});

// POST /api/facturas/:id/reenviar — reintenta el envío a la DIAN para facturas en borrador
router.post("/:id/reenviar", async (req, res) => {
  const [factura] = await db
    .select()
    .from(facturas)
    .where(and(eq(facturas.id, req.params.id), eq(facturas.tenant_id, req.tenantId)))
    .limit(1);

  if (!factura) return res.status(404).json({ error: "Factura no encontrada." });

  if (factura.estado !== "borrador") {
    return res.status(422).json({
      error: "Solo las facturas en borrador pueden reenviarse a la DIAN.",
    });
  }

  const [[cliente], items, [resolucion]] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.id, factura.cliente_id)).limit(1),
    db.select().from(items_factura).where(eq(items_factura.factura_id, factura.id)),
    db.select().from(resoluciones_dian).where(eq(resoluciones_dian.id, factura.resolucion_id)).limit(1),
  ]);

  if (!cliente) return res.status(422).json({ error: "Cliente de la factura no encontrado." });
  if (!resolucion) return res.status(422).json({ error: "Resolución DIAN de la factura no encontrada." });

  try {
    const respDian = await enviarFacturaDian({ factura, cliente, items, tenant: req.tenant, resolucion });

    if (respDian.aceptada) {
      let asientoId: string | null = null;
      try {
        asientoId = await crearAsientoFactura(req.tenantId, factura);
      } catch (e) {
        console.error(`[CONTABILIDAD] Asiento reenvío factura ${factura.numero} fallido:`, e);
      }

      const features = req.tenant.plan.features as Record<string, boolean>;
      if (features.inventario) {
        await registrarSalidaFactura(req.tenantId, factura, items);
      }

      const [actualizada] = await db
        .update(facturas)
        .set({
          estado: "aceptada",
          cufe: respDian.cufe,
          qr_code: respDian.qr_code,
          xml_firmado: respDian.xml_firmado,
          asiento_id: asientoId,
        })
        .where(eq(facturas.id, factura.id))
        .returning();
      return res.json(actualizada);
    } else {
      await db.update(facturas).set({ estado: "rechazada" }).where(eq(facturas.id, factura.id));
      return res.status(422).json({ error: `La DIAN rechazó la factura: ${respDian.mensaje}` });
    }
  } catch (err) {
    if (err instanceof Error) {
      return res.status(502).json({ error: err.message });
    }
    throw err;
  }
});

// PATCH /api/facturas/:id/marcar-pagada
router.patch("/:id/marcar-pagada", async (req, res) => {
  const [factura] = await db
    .select()
    .from(facturas)
    .where(and(eq(facturas.id, req.params.id), eq(facturas.tenant_id, req.tenantId)))
    .limit(1);

  if (!factura) return res.status(404).json({ error: "Factura no encontrada." });
  if (factura.estado !== "aceptada") {
    return res.status(422).json({ error: "Solo las facturas aceptadas pueden marcarse como pagadas." });
  }
  if (factura.pagada_at) {
    return res.status(422).json({ error: "La factura ya está marcada como pagada." });
  }

  const [actualizada] = await db
    .update(facturas)
    .set({ pagada_at: new Date() })
    .where(eq(facturas.id, factura.id))
    .returning();

  void audit({ tenantId: req.tenantId, userId: req.userId, accion: "factura.marcada_pagada", entidadTipo: "factura", entidadId: factura.id, detalle: { numero: factura.numero, total: factura.total }, ip: req.ip });
  res.json(actualizada);
});

// POST /api/facturas/:id/reenviar-dian — reintenta el envío a Plemsi para facturas con error o pendientes
router.post("/:id/reenviar-dian", async (req, res) => {
  const [factura] = await db
    .select()
    .from(facturas)
    .where(and(eq(facturas.id, req.params.id), eq(facturas.tenant_id, req.tenantId)))
    .limit(1);

  if (!factura) return res.status(404).json({ error: "Factura no encontrada." });

  const estadoDian = (factura as Record<string, unknown>).estado_dian as string | null;
  const cufeActual = (factura as Record<string, unknown>).cufe as string | null;
  const tieneStubCufe = cufeActual?.startsWith("STUB-") ?? false;
  if (estadoDian !== "error" && estadoDian !== "pendiente" && !tieneStubCufe) {
    return res.status(422).json({
      error: "Solo se pueden reenviar facturas con estado_dian 'error' o 'pendiente'.",
    });
  }

  const [[cliente], itemsDB, [resolucion]] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.id, factura.cliente_id)).limit(1),
    db.select().from(items_factura).where(eq(items_factura.factura_id, factura.id)),
    db.select().from(resoluciones_dian).where(eq(resoluciones_dian.id, factura.resolucion_id)).limit(1),
  ]);

  if (!cliente) return res.status(422).json({ error: "Cliente de la factura no encontrado." });
  if (!resolucion) return res.status(422).json({ error: "Resolución DIAN de la factura no encontrada." });

  try {
    await enviarAPlemsiSiAplica(req.tenant, factura, cliente, itemsDB, resolucion);
    const [actualizada] = await db.select().from(facturas).where(eq(facturas.id, factura.id)).limit(1);
    const act = actualizada as Record<string, unknown>;
    return res.json({ ok: act.estado_dian === "emitida", cufe: act.cufe, error: act.error_dian });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Error inesperado." });
  }
});

// POST /api/facturas/:id/enviar-email — reenvía la factura por correo al cliente
router.post("/:id/enviar-email", async (req, res) => {
  const [row] = await db
    .select({ factura: facturas, cliente: clientes })
    .from(facturas)
    .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
    .where(and(eq(facturas.id, req.params.id), eq(facturas.tenant_id, req.tenantId)))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Factura no encontrada." });

  const { factura, cliente } = row;

  if (!cliente.correo) {
    return res.status(422).json({ error: "El cliente no tiene correo electrónico registrado." });
  }

  const items = await db
    .select()
    .from(items_factura)
    .where(eq(items_factura.factura_id, factura.id));

  try {
    const pdfStream = generarPdfFactura(factura, cliente, items, req.tenant);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      pdfStream.on("data", (c: Buffer) => chunks.push(c));
      pdfStream.on("end", resolve);
      pdfStream.on("error", reject);
    });
    const pdfBuffer = Buffer.concat(chunks);

    await enviarFacturaAceptada(factura, cliente, req.tenant, pdfBuffer);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error enviando factura por email:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Error al enviar el correo.",
    });
  }
});

router.post("/", async (req, res) => {
  const { cliente_id, items, fecha, fecha_vencimiento, observaciones } = req.body;

  if (!cliente_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Campos requeridos: cliente_id, items (array no vacío)." });
  }

  try {
    const fechaDoc = fecha ? new Date(fecha) : new Date();
    await verificarPeriodoAbierto(req.tenantId, fechaDoc);
    const { factura, advertencias } = await crearFactura(req.tenant, { cliente_id, items, fecha: fechaDoc, fecha_vencimiento, observaciones });
    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "factura.creada", entidadTipo: "factura", entidadId: factura.id, detalle: { numero: factura.numero, total: factura.total, estado: factura.estado }, ip: req.ip });
    res.status(201).json({ ...factura, advertencias });
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    if (err instanceof Error) {
      return res.status(422).json({ error: err.message });
    }
    throw err;
  }
});

// POST /api/facturas/sync-cude-plemsi — consulta Plemsi y actualiza CUDEs reales en BD
// Solo actualiza facturas con CUFE stub (emitidas en modo habilitación sin guardar CUDE)
router.post("/sync-cude-plemsi", async (req, res) => {
  const apiKey = process.env.PLEMSI_API_KEY_DEFAULT ?? "";
  const plemsiBase = process.env.PLEMSI_URL ?? "https://pruebas.plemsi.com";
  if (!apiKey) return res.status(422).json({ error: "PLEMSI_API_KEY_DEFAULT no configurada." });

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const cudeMap = new Map<string, string>(); // consecutive → cude

  // Paginar todos los documentos emitidos en Plemsi
  let searchAfter: string | null = null;
  let pagina = 0;
  do {
    const url = new URL(`${plemsiBase}/api/billing/invoice`);
    if (searchAfter) url.searchParams.set("searchAfter", searchAfter);
    url.searchParams.set("limit", "50");
    const resp = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) break;
    const json = await resp.json() as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    const docs = (data.docs ?? []) as Array<Record<string, unknown>>;
    for (const doc of docs) {
      if (doc.state === "Emitted" && doc.cude && doc.consecutive) {
        cudeMap.set(String(doc.consecutive), String(doc.cude));
      }
    }
    searchAfter = (data.searchAfter as string | null) ?? null;
    pagina++;
  } while (searchAfter && pagina < 20);

  // Obtener facturas con CUFE stub del tenant
  const todasFacturas = await db
    .select({ id: facturas.id, numero: facturas.numero, cufe: sql<string>`${facturas}.cufe` })
    .from(facturas)
    .where(eq(facturas.tenant_id, req.tenantId));

  let actualizadas = 0;
  for (const f of todasFacturas) {
    if (!f.cufe || !String(f.cufe).startsWith("STUB-")) continue;
    // numero "SETT0001" → buscar "SETT1", "SETT01", etc.
    const match = /^([A-Z]+)0*(\d+)$/.exec(f.numero ?? "");
    if (!match) continue;
    const [, prefix, num] = match;
    const consecutive = `${prefix}${num}`;
    const cude = cudeMap.get(consecutive);
    if (!cude) continue;
    await db.update(facturas)
      .set({ cufe: cude, estado_dian: "emitida", error_dian: null } as Record<string, unknown>)
      .where(eq(facturas.id, f.id));
    actualizadas++;
  }

  return res.json({ ok: true, cudeMapSize: cudeMap.size, actualizadas });
});

export default router;
