import { Router } from "express";
import {
  db, facturas, clientes, notas_debito, items_nota_debito,
  asientos_contables, lineas_asiento, cuentas_contables, TIPOS_NOTA_DEBITO, resoluciones_dian,
} from "@workspace/db";
import { audit } from "../services/audit.service.js";
import { eq, and, desc } from "drizzle-orm";
import {
  buildPersona, buildItems, calcularTotalesPlemsi, emitirNotaDebito as plemsiEmitirNotaDebito,
} from "../services/plemsi.service.js";
import { siguienteConsecutivo } from "../services/consecutivo.service.js";

const router = Router();

// GET /api/notas-debito
router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: notas_debito.id,
        numero: notas_debito.numero,
        tipo: notas_debito.tipo,
        estado: notas_debito.estado,
        total: notas_debito.total,
        motivo: notas_debito.motivo,
        fecha_emision: notas_debito.fecha_emision,
        factura_id: notas_debito.factura_id,
        cude: notas_debito.cude,
        estado_dian: notas_debito.estado_dian,
        cliente: { id: clientes.id, nombre: clientes.nombre },
      })
      .from(notas_debito)
      .innerJoin(clientes, eq(notas_debito.cliente_id, clientes.id))
      .where(eq(notas_debito.tenant_id, req.tenantId))
      .orderBy(desc(notas_debito.fecha_emision));

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /notas-debito:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/notas-debito/:id
router.get("/:id", async (req, res) => {
  try {
    const [row] = await db
      .select({ nota: notas_debito, cliente: clientes })
      .from(notas_debito)
      .innerJoin(clientes, eq(notas_debito.cliente_id, clientes.id))
      .where(and(eq(notas_debito.id, req.params.id), eq(notas_debito.tenant_id, req.tenantId)))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Nota débito no encontrada." });

    const [items, facturaOriginal] = await Promise.all([
      db.select().from(items_nota_debito).where(eq(items_nota_debito.nota_debito_id, row.nota.id)),
      db.select({ numero: facturas.numero, total: facturas.total, cufe: facturas.cufe })
        .from(facturas)
        .where(eq(facturas.id, row.nota.factura_id))
        .limit(1),
    ]);

    res.json({ ...row.nota, cliente: row.cliente, items, factura_numero: facturaOriginal[0]?.numero });
  } catch (err) {
    console.error("Error en GET /notas-debito/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/notas-debito/factura/:facturaId
router.post("/factura/:facturaId", async (req, res) => {
  try {
    const { tipo, motivo, items: itemsInput } = req.body as {
      tipo: string;
      motivo: string;
      items: Array<{ descripcion: string; cantidad: number; precio_unitario: number; iva_pct?: number }>;
    };

    if (!tipo || !motivo) return res.status(400).json({ error: "tipo y motivo son requeridos." });
    if (!(TIPOS_NOTA_DEBITO as readonly string[]).includes(tipo)) {
      return res.status(400).json({ error: `tipo debe ser: ${TIPOS_NOTA_DEBITO.join(", ")}.` });
    }
    if (!itemsInput?.length) return res.status(400).json({ error: "Se requiere al menos un ítem." });

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
      return res.status(422).json({ error: "Solo se pueden crear notas débito para facturas aceptadas." });
    }

    const itemsCalculados = itemsInput.map((item) => {
      const iva = item.iva_pct ?? 19;
      const subtotal = Number((item.cantidad * item.precio_unitario).toFixed(2));
      const iva_valor = Number((subtotal * iva / 100).toFixed(2));
      return { ...item, iva_pct: iva, subtotal, iva_valor, total: subtotal + iva_valor };
    });

    const subtotal = Number(itemsCalculados.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
    const iva_total = Number(itemsCalculados.reduce((s, i) => s + i.iva_valor, 0).toFixed(2));
    const total = Number((subtotal + iva_total).toFixed(2));

    const consecutivo = await siguienteConsecutivo("notas_debito", "consecutivo", req.tenantId);
    const numero = `ND-${String(consecutivo).padStart(4, "0")}`;
    const fechaEmision = new Date();

    const nota = await db.transaction(async (tx) => {
      const [n] = await tx
        .insert(notas_debito)
        .values({
          tenant_id: req.tenantId,
          factura_id: factura.id,
          cliente_id: factura.cliente_id,
          numero,
          consecutivo,
          tipo: tipo as typeof TIPOS_NOTA_DEBITO[number],
          motivo,
          estado: "aceptada",
          subtotal: String(subtotal),
          iva_total: String(iva_total),
          total: String(total),
          fecha_emision: fechaEmision,
        })
        .returning();

      await tx.insert(items_nota_debito).values(
        itemsCalculados.map((item) => ({
          nota_debito_id: n.id,
          descripcion: item.descripcion,
          cantidad: String(item.cantidad),
          precio_unitario: String(item.precio_unitario),
          iva_pct: String(item.iva_pct),
          subtotal: String(item.subtotal),
          iva_valor: String(item.iva_valor),
          total: String(item.total),
        }))
      );

      // Asiento contable: nota débito aumenta valor → débito CxC, crédito ventas
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
            descripcion: `Nota débito ${numero} — ${tipo}`,
            origen: "ajuste" as const,
          })
          .returning();

        type Linea = { asiento_id: string; cuenta_id: string; debito: string; credito: string; descripcion: string };
        const lineas: Linea[] = [
          { asiento_id: asiento.id, cuenta_id: cxc.id,    debito: String(total),    credito: "0",             descripcion: `ND ${numero}` },
          { asiento_id: asiento.id, cuenta_id: ventas.id, debito: "0",              credito: String(subtotal), descripcion: `ND ${numero}` },
        ];

        if (cuentaIva && iva_total > 0) {
          lineas.push({ asiento_id: asiento.id, cuenta_id: cuentaIva.id, debito: "0", credito: String(iva_total), descripcion: `IVA ND ${numero}` });
        }

        await tx.insert(lineas_asiento).values(lineas);
        await tx.update(notas_debito).set({ asiento_id: asiento.id }).where(eq(notas_debito.id, n.id));
      }

      return n;
    });

    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "nota_debito.creada", entidadTipo: "nota_debito", entidadId: nota.id, detalle: { numero: nota.numero, tipo: nota.tipo, total: nota.total, factura_id: factura.id }, ip: req.ip });

    // Enviar a Plemsi si FE habilitada y la factura tiene CUFE
    if (req.tenant.facturacion_electronica && factura.cufe) {
      const posConfig = req.tenant.pos_config as Record<string, unknown> | null;
      const apiKey = (posConfig?.plemsi_api_key as string | undefined) ??
        process.env.PLEMSI_API_KEY_DEFAULT ?? "";

      if (apiKey) {
        const [clienteND] = await db.select().from(clientes).where(eq(clientes.id, factura.cliente_id)).limit(1);

        if (clienteND) {
          void (async () => {
            try {
              const customerData = buildPersona({
                nit: clienteND.numero_documento,
                dv: clienteND.digito_verificacion,
                nombre: clienteND.nombre,
                email: clienteND.correo,
                telefono: clienteND.telefono,
                direccion: clienteND.direccion,
                ciudad: clienteND.municipio,
                tipo_persona: clienteND.tipo_persona,
              });

              const itemsPlemsi = buildItems(itemsCalculados.map((i) => ({
                descripcion: i.descripcion,
                cantidad: i.cantidad,
                precio_unitario: i.precio_unitario,
                iva_porcentaje: i.iva_pct,
              })));

              const totales = calcularTotalesPlemsi(itemsPlemsi);

              // DIAN: 1=Intereses, 2=Gastos, 3=Cambio del valor (ajuste)
              const discrepancyCodes: Record<string, number> = {
                interes: 1,
                gastos: 2,
                ajuste: 3,
              };
              const discrepancy_code = discrepancyCodes[tipo] ?? 3;

              const [resolucionFact] = factura.resolucion_id
                ? await db.select({ numero: resoluciones_dian.numero_resolucion }).from(resoluciones_dian).where(eq(resoluciones_dian.id, factura.resolucion_id)).limit(1)
                : [null];
              const resolucionNumero = resolucionFact?.numero ?? process.env.PLEMSI_RESOLUCION_DEFAULT ?? "18760000001";

              const resultado = await plemsiEmitirNotaDebito({
                apiKey,
                prefix: "ND",
                number: consecutivo,
                resolution: resolucionNumero,
                discrepancy_code,
                discrepancy_description: motivo,
                customer: customerData,
                items: itemsPlemsi,
                invoice_reference: {
                  cufe: factura.cufe!,
                  number: factura.numero,
                  date: new Date(factura.fecha_emision).toISOString().slice(0, 10),
                },
                ...totales,
              });

              await db
                .update(notas_debito)
                .set({
                  cude: resultado.cufe ?? null,
                  plemsi_id: resultado.plemsi_id ?? null,
                  estado_dian: resultado.ok ? "emitida" : "error",
                  error_dian: resultado.ok ? null : (resultado.error ?? null),
                })
                .where(eq(notas_debito.id, nota.id));

              if (resultado.ok) {
                console.log(`[PLEMSI] Nota débito ${nota.numero} emitida. CUDE: ${resultado.cufe}`);
              } else {
                console.error(`[PLEMSI] Error ND ${nota.numero}: ${resultado.error}`);
              }
            } catch (e) {
              console.error(`[PLEMSI] Error inesperado ND ${nota.numero}:`, e);
            }
          })();
        }
      }
    }

    res.status(201).json(nota);
  } catch (err) {
    console.error("Error en POST /notas-debito/factura/:facturaId:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/notas-debito/:id/reenviar-dian
router.post("/:id/reenviar-dian", async (req, res) => {
  try {
    const [nota] = await db
      .select()
      .from(notas_debito)
      .where(and(eq(notas_debito.id, req.params.id), eq(notas_debito.tenant_id, req.tenantId)))
      .limit(1);

    if (!nota) return res.status(404).json({ error: "Nota débito no encontrada." });

    if (!req.tenant.facturacion_electronica) {
      return res.status(422).json({ error: "La empresa no tiene facturación electrónica habilitada." });
    }

    const [facturaOrig] = await db.select().from(facturas).where(eq(facturas.id, nota.factura_id)).limit(1);
    if (!facturaOrig?.cufe) {
      return res.status(422).json({ error: "La factura original no tiene CUFE. No se puede reenviar." });
    }

    const posConfig = req.tenant.pos_config as Record<string, unknown> | null;
    const apiKey = (posConfig?.plemsi_api_key as string | undefined) ?? process.env.PLEMSI_API_KEY_DEFAULT ?? "";
    if (!apiKey) return res.status(422).json({ error: "API key de Plemsi no configurada." });

    const [clienteND] = await db.select().from(clientes).where(eq(clientes.id, nota.cliente_id)).limit(1);
    if (!clienteND) return res.status(404).json({ error: "Cliente no encontrado." });

    const itemsND = await db.select().from(items_nota_debito).where(eq(items_nota_debito.nota_debito_id, nota.id));

    const customerData = buildPersona({
      nit: clienteND.numero_documento,
      dv: clienteND.digito_verificacion,
      nombre: clienteND.nombre,
      email: clienteND.correo,
      telefono: clienteND.telefono,
      direccion: clienteND.direccion,
      ciudad: clienteND.municipio,
      tipo_persona: clienteND.tipo_persona,
    });

    const itemsPlemsi = buildItems(itemsND.map((i) => ({
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario),
      iva_porcentaje: Number(i.iva_pct),
    })));

    const totales = calcularTotalesPlemsi(itemsPlemsi);

    const discrepancyCodes: Record<string, number> = { interes: 1, gastos: 2, ajuste: 3 };
    const discrepancy_code = discrepancyCodes[nota.tipo] ?? 3;

    const [resolucionFact] = facturaOrig.resolucion_id
      ? await db.select({ numero: resoluciones_dian.numero_resolucion }).from(resoluciones_dian).where(eq(resoluciones_dian.id, facturaOrig.resolucion_id)).limit(1)
      : [null];
    const resolucionNumero = resolucionFact?.numero ?? process.env.PLEMSI_RESOLUCION_DEFAULT ?? "18760000001";

    const resultado = await plemsiEmitirNotaDebito({
      apiKey,
      prefix: "ND",
      number: nota.consecutivo,
      resolution: resolucionNumero,
      discrepancy_code,
      discrepancy_description: nota.motivo,
      customer: customerData,
      items: itemsPlemsi,
      invoice_reference: {
        cufe: facturaOrig.cufe,
        number: facturaOrig.numero,
        date: new Date(facturaOrig.fecha_emision).toISOString().slice(0, 10),
      },
      ...totales,
    });

    await db
      .update(notas_debito)
      .set({
        cude: resultado.cufe ?? null,
        plemsi_id: resultado.plemsi_id ?? null,
        estado_dian: resultado.ok ? "emitida" : "error",
        error_dian: resultado.ok ? null : (resultado.error ?? null),
      })
      .where(eq(notas_debito.id, nota.id));

    res.json({ ok: resultado.ok, cude: resultado.cufe, error: resultado.error });
  } catch (err) {
    console.error("Error en POST /notas-debito/:id/reenviar-dian:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
