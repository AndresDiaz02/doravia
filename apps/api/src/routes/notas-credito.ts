import { Router } from "express";
import {
  db, facturas, items_factura, clientes, notas_credito, items_nota_credito,
  asientos_contables, lineas_asiento, cuentas_contables, TIPOS_NOTA_CREDITO,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// Contador de notas crédito por tenant (en memoria — en producción usar secuencia DB)
const contadores: Record<string, number> = {};
async function nextConsecutivo(tenantId: string): Promise<number> {
  const [last] = await db
    .select({ consecutivo: notas_credito.consecutivo })
    .from(notas_credito)
    .where(eq(notas_credito.tenant_id, tenantId))
    .orderBy(desc(notas_credito.consecutivo))
    .limit(1);
  return (last?.consecutivo ?? 0) + 1;
}

// GET /api/notas-credito
router.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: notas_credito.id,
      numero: notas_credito.numero,
      tipo: notas_credito.tipo,
      estado: notas_credito.estado,
      total: notas_credito.total,
      motivo: notas_credito.motivo,
      fecha_emision: notas_credito.fecha_emision,
      factura_id: notas_credito.factura_id,
      cliente: { id: clientes.id, nombre: clientes.nombre },
    })
    .from(notas_credito)
    .innerJoin(clientes, eq(notas_credito.cliente_id, clientes.id))
    .where(eq(notas_credito.tenant_id, req.tenantId))
    .orderBy(desc(notas_credito.fecha_emision));

  res.json(rows);
});

// GET /api/notas-credito/:id
router.get("/:id", async (req, res) => {
  const [row] = await db
    .select({ nota: notas_credito, cliente: clientes })
    .from(notas_credito)
    .innerJoin(clientes, eq(notas_credito.cliente_id, clientes.id))
    .where(and(eq(notas_credito.id, req.params.id), eq(notas_credito.tenant_id, req.tenantId)))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Nota crédito no encontrada." });

  const [items, facturaOriginal] = await Promise.all([
    db.select().from(items_nota_credito).where(eq(items_nota_credito.nota_credito_id, row.nota.id)),
    db.select({ numero: facturas.numero, total: facturas.total }).from(facturas).where(eq(facturas.id, row.nota.factura_id)).limit(1),
  ]);

  res.json({ ...row.nota, cliente: row.cliente, items, factura_numero: facturaOriginal[0]?.numero });
});

// POST /api/facturas/:facturaId/nota-credito
router.post("/factura/:facturaId", async (req, res) => {
  const { tipo, motivo, items: itemsInput } = req.body as {
    tipo: string;
    motivo: string;
    items: Array<{ descripcion: string; cantidad: number; precio_unitario: number; iva_pct?: number }>;
  };

  if (!tipo || !motivo) return res.status(400).json({ error: "tipo y motivo son requeridos." });
  if (!(TIPOS_NOTA_CREDITO as readonly string[]).includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser: ${TIPOS_NOTA_CREDITO.join(", ")}.` });
  }
  if (!itemsInput?.length) return res.status(400).json({ error: "Se requiere al menos un ítem." });

  const [factura] = await db
    .select()
    .from(facturas)
    .where(and(eq(facturas.id, req.params.facturaId), eq(facturas.tenant_id, req.tenantId)))
    .limit(1);

  if (!factura) return res.status(404).json({ error: "Factura no encontrada." });
  if (factura.estado !== "aceptada") {
    return res.status(422).json({ error: "Solo se pueden crear notas crédito para facturas aceptadas." });
  }

  // Calcular totales de la nota
  const itemsCalculados = itemsInput.map((item) => {
    const iva = item.iva_pct ?? 19;
    const subtotal = Number((item.cantidad * item.precio_unitario).toFixed(2));
    const iva_valor = Number((subtotal * iva / 100).toFixed(2));
    return { ...item, iva_pct: iva, subtotal, iva_valor, total: subtotal + iva_valor };
  });

  const subtotal = Number(itemsCalculados.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
  const iva_total = Number(itemsCalculados.reduce((s, i) => s + i.iva_valor, 0).toFixed(2));
  const total = Number((subtotal + iva_total).toFixed(2));

  const consecutivo = await nextConsecutivo(req.tenantId);
  const numero = `NC-${String(consecutivo).padStart(4, "0")}`;
  const fechaEmision = new Date();

  const nota = await db.transaction(async (tx) => {
    const [n] = await tx
      .insert(notas_credito)
      .values({
        tenant_id: req.tenantId,
        factura_id: factura.id,
        cliente_id: factura.cliente_id,
        numero,
        consecutivo,
        tipo: tipo as typeof TIPOS_NOTA_CREDITO[number],
        motivo,
        estado: "aceptada",
        subtotal: String(subtotal),
        iva_total: String(iva_total),
        total: String(total),
        fecha_emision: fechaEmision,
      })
      .returning();

    await tx.insert(items_nota_credito).values(
      itemsCalculados.map((item) => ({
        nota_credito_id: n.id,
        descripcion: item.descripcion,
        cantidad: String(item.cantidad),
        precio_unitario: String(item.precio_unitario),
        iva_pct: String(item.iva_pct),
        subtotal: String(item.subtotal),
        iva_valor: String(item.iva_valor),
        total: String(item.total),
      }))
    );

    // Si es anulación total: marcar la factura como anulada
    if (tipo === "anulacion") {
      await tx.update(facturas).set({ estado: "anulada" }).where(eq(facturas.id, factura.id));
    }

    // Asiento contable de reversión (crédito a cuentas por cobrar, débito a ventas)
    const [cxc] = await tx
      .select({ id: cuentas_contables.id })
      .from(cuentas_contables)
      .where(and(eq(cuentas_contables.codigo, "1305"), eq(cuentas_contables.tenant_id, req.tenantId)))
      .limit(1);

    const [ventas] = await tx
      .select({ id: cuentas_contables.id })
      .from(cuentas_contables)
      .where(and(eq(cuentas_contables.codigo, "4135"), eq(cuentas_contables.tenant_id, req.tenantId)))
      .limit(1);

    if (cxc && ventas) {
      const [asiento] = await tx
        .insert(asientos_contables)
        .values({
          tenant_id: req.tenantId,
          numero,
          fecha: fechaEmision.toISOString().split("T")[0],
          descripcion: `Nota crédito ${numero} — ${tipo}`,
          origen: "ajuste" as const,
        })
        .returning();

      await tx.insert(lineas_asiento).values([
        { asiento_id: asiento.id, cuenta_id: ventas.id,  debito: String(subtotal), credito: "0",       descripcion: `NC ${numero}` },
        { asiento_id: asiento.id, cuenta_id: cxc.id,     debito: "0",             credito: String(total), descripcion: `NC ${numero}` },
      ]);

      await tx.update(notas_credito).set({ asiento_id: asiento.id }).where(eq(notas_credito.id, n.id));
    }

    return n;
  });

  res.status(201).json(nota);
});

export default router;
