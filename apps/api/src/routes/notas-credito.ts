import { Router } from "express";
import {
  db, facturas, items_factura, clientes, notas_credito, items_nota_credito,
  asientos_contables, lineas_asiento, cuentas_contables, TIPOS_NOTA_CREDITO,
} from "@workspace/db";
import { audit } from "../services/audit.service.js";
import { eq, and, desc } from "drizzle-orm";
import {
  buildPersona, buildItems, calcularTotalesPlemsi, emitirNotaCredito as plemsiEmitirNotaCredito,
} from "../services/plemsi.service.js";

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
  try {
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
  } catch (err) {
    console.error("Error en GET /notas-credito:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/notas-credito/:id
router.get("/:id", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Error en GET /notas-credito/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/facturas/:facturaId/nota-credito
router.post("/factura/:facturaId", async (req, res) => {
  try {
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

    // Validar items
    for (const item of itemsInput) {
      if (!item.descripcion?.trim()) return res.status(400).json({ error: "Cada ítem debe tener descripción." });
      if (Number(item.cantidad) <= 0) return res.status(400).json({ error: "La cantidad de cada ítem debe ser mayor a cero." });
      if (Number(item.precio_unitario) <= 0) return res.status(400).json({ error: "El precio unitario de cada ítem debe ser mayor a cero." });
      const iva = item.iva_pct ?? 19;
      if (![0, 5, 19].includes(iva)) return res.status(400).json({ error: "IVA debe ser 0, 5 o 19." });
    }

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

    // La nota de crédito no puede superar el total de la factura original
    if (total > Number(factura.total)) {
      return res.status(422).json({
        error: `La nota de crédito (${total.toLocaleString("es-CO")}) no puede superar el total de la factura (${Number(factura.total).toLocaleString("es-CO")}).`,
      });
    }

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

      const [cuentaIva] = await tx
        .select({ id: cuentas_contables.id })
        .from(cuentas_contables)
        .where(and(eq(cuentas_contables.codigo, "2408"), eq(cuentas_contables.tenant_id, req.tenantId)))
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

        type Linea = { asiento_id: string; cuenta_id: string; debito: string; credito: string; descripcion: string };
        const lineas: Linea[] = [
          { asiento_id: asiento.id, cuenta_id: ventas.id, debito: String(subtotal), credito: "0",          descripcion: `NC ${numero}` },
          { asiento_id: asiento.id, cuenta_id: cxc.id,    debito: "0",             credito: String(total), descripcion: `NC ${numero}` },
        ];

        // Partida doble: débito ventas + débito IVA = crédito CxC (total = subtotal + iva_total) ✓
        if (cuentaIva && iva_total > 0) {
          lineas.push({ asiento_id: asiento.id, cuenta_id: cuentaIva.id, debito: String(iva_total), credito: "0", descripcion: `IVA NC ${numero}` });
        }

        await tx.insert(lineas_asiento).values(lineas);
        await tx.update(notas_credito).set({ asiento_id: asiento.id }).where(eq(notas_credito.id, n.id));
      }

      return n;
    });

    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "nota_credito.creada", entidadTipo: "nota_credito", entidadId: nota.id, detalle: { numero: nota.numero, tipo: nota.tipo, total: nota.total, factura_id: factura.id }, ip: req.ip });

    // Enviar nota crédito a Plemsi si: FE habilitada, factura tiene cufe y tenant tiene API key
    if (req.tenant.facturacion_electronica && factura.cufe) {
      const posConfig = req.tenant.pos_config as Record<string, unknown> | null;
      const apiKey = (posConfig?.plemsi_api_key as string | undefined) ??
        process.env.PLEMSI_API_KEY_DEFAULT ?? "";

      if (apiKey) {
        // Obtener cliente para buildPersona
        const [clienteNC] = await db.select().from(clientes).where(eq(clientes.id, factura.cliente_id)).limit(1);

        if (clienteNC) {
          void (async () => {
            try {
              const buyerData = buildPersona({
                nit: clienteNC.numero_documento,
                dv: clienteNC.digito_verificacion,
                nombre: clienteNC.nombre,
                email: clienteNC.correo,
                telefono: clienteNC.telefono,
                direccion: clienteNC.direccion,
                ciudad: clienteNC.municipio,
                tipo_persona: clienteNC.tipo_persona,
              });

              const itemsPlemsi = buildItems(itemsCalculados.map((i) => ({
                descripcion: i.descripcion,
                cantidad: i.cantidad,
                precio_unitario: i.precio_unitario,
                iva_porcentaje: i.iva_pct,
              })));

              const totales = calcularTotalesPlemsi(itemsPlemsi);

              // discrepancy_code: 2=Anulación, 1=Devolución, 3=Descuento, 4=Ajuste
              const discrepancyCodes: Record<string, number> = {
                anulacion: 2,
                devolucion: 1,
                descuento: 3,
                ajuste: 4,
              };
              const discrepancy_code = discrepancyCodes[tipo] ?? 5;

              const resultado = await plemsiEmitirNotaCredito({
                apiKey,
                prefix: "NC",
                number: consecutivo,
                resolution: numero,
                discrepancy_code,
                discrepancy_description: motivo,
                buyer: buyerData,
                items: itemsPlemsi,
                invoice_reference: {
                  cufe: factura.cufe!,
                  number: factura.numero,
                  date: new Date(factura.fecha_emision).toISOString().slice(0, 10),
                },
                ...totales,
              });

              await db
                .update(notas_credito)
                .set({
                  cude: resultado.cufe ?? null,
                  plemsi_id: resultado.plemsi_id ?? null,
                  estado_dian: resultado.ok ? "emitida" : "error",
                })
                .where(eq(notas_credito.id, nota.id));

              if (resultado.ok) {
                console.log(`[PLEMSI] Nota crédito ${nota.numero} emitida. CUDE: ${resultado.cufe}`);
              } else {
                console.error(`[PLEMSI] Error NC ${nota.numero}: ${resultado.error}`);
              }
            } catch (e) {
              console.error(`[PLEMSI] Error inesperado NC ${nota.numero}:`, e);
            }
          })();
        }
      }
    }

    res.status(201).json(nota);
  } catch (err) {
    console.error("Error en POST /notas-credito/factura/:facturaId:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
