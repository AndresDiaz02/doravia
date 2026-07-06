import { Router } from "express";
import { db, facturas, clientes, retenciones_factura, productos, movimientos_inventario, bodegas, tenants, users, gastos, proveedores, cotizaciones, notas_credito, notas_debito, remisiones } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import * as XLSX from "xlsx";

const router = Router();

function enviarExcel(res: import("express").Response, wb: XLSX.WorkBook, nombre: string) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(buf);
}

// GET /api/exportar/facturas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/facturas", async (req, res) => {
  try {
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;

    const condiciones = [eq(facturas.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(facturas.fecha_emision, new Date(desde)));
    if (hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      condiciones.push(lte(facturas.fecha_emision, hastaFin));
    }

    const rows = await db
      .select({
        numero: facturas.numero,
        fecha_emision: facturas.fecha_emision,
        fecha_vencimiento: facturas.fecha_vencimiento,
        estado: facturas.estado,
        cliente_nombre: clientes.nombre,
        cliente_nit: clientes.numero_documento,
        subtotal: facturas.subtotal,
        iva_total: facturas.iva_total,
        total: facturas.total,
        total_retenciones: facturas.total_retenciones,
        neto_a_pagar: facturas.neto_a_pagar,
        pagada_at: facturas.pagada_at,
        cufe: facturas.cufe,
      })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(and(...condiciones))
      .orderBy(desc(facturas.fecha_emision));

    const data = rows.map((r) => ({
      "Número":            r.numero,
      "Fecha emisión":     r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString("es-CO") : "",
      "Fecha vencimiento": r.fecha_vencimiento ? new Date(r.fecha_vencimiento).toLocaleDateString("es-CO") : "",
      "Estado":            r.estado,
      "Cliente":           r.cliente_nombre,
      "NIT/CC cliente":    r.cliente_nit,
      "Subtotal":          Number(r.subtotal),
      "IVA":               Number(r.iva_total),
      "Total bruto":       Number(r.total),
      "Retenciones":       Number(r.total_retenciones),
      "Neto a pagar":      Number(r.neto_a_pagar),
      "Pagada":            r.pagada_at ? "Sí" : "No",
      "CUFE":              r.cufe ?? "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [8,12,12,10,30,14,12,12,12,12,12,6,50].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Facturas");
    enviarExcel(res, wb, `facturas_${desde ?? "todo"}_${hasta ?? "todo"}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/facturas:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/clientes
router.get("/clientes", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(clientes)
      .where(eq(clientes.tenant_id, req.tenantId))
      .orderBy(clientes.nombre);

    const data = rows.map((c) => ({
      "Nombre / Razón social": c.nombre,
      "Tipo documento":        c.tipo_documento,
      "Número documento":      c.numero_documento,
      "Correo":                c.correo ?? "",
      "Teléfono":              c.telefono ?? "",
      "Dirección":             c.direccion ?? "",
      "Departamento":          c.departamento ?? "",
      "Activo":                c.activo ? "Sí" : "No",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [35, 15, 15, 30, 15, 35, 20, 6].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    enviarExcel(res, wb, "clientes.xlsx");
  } catch (err) {
    console.error("Error en GET /exportar/clientes:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/retenciones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Certificado de retenciones practicadas (para declaración de renta)
router.get("/retenciones", async (req, res) => {
  try {
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;

    const condiciones = [eq(facturas.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(facturas.fecha_emision, new Date(desde)));
    if (hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      condiciones.push(lte(facturas.fecha_emision, hastaFin));
    }

    const rows = await db
      .select({
        factura_numero: facturas.numero,
        fecha_emision:  facturas.fecha_emision,
        cliente_nombre: clientes.nombre,
        cliente_nit:    clientes.numero_documento,
        factura_total:  facturas.total,
        ret_nombre:     retenciones_factura.nombre,
        ret_tipo:       retenciones_factura.tipo,
        ret_porcentaje: retenciones_factura.porcentaje,
        ret_base:       retenciones_factura.base,
        ret_valor:      retenciones_factura.valor,
      })
      .from(retenciones_factura)
      .innerJoin(facturas, eq(retenciones_factura.factura_id, facturas.id))
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(and(...condiciones))
      .orderBy(retenciones_factura.tipo, clientes.nombre);

    const data = rows.map((r) => ({
      "Tipo retención":  r.ret_tipo,
      "Nombre":          r.ret_nombre,
      "Agente retenedor (cliente)": r.cliente_nombre,
      "NIT agente":      r.cliente_nit,
      "Factura":         r.factura_numero,
      "Fecha factura":   r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString("es-CO") : "",
      "Total factura":   Number(r.factura_total),
      "Base retención":  Number(r.ret_base),
      "Tarifa %":        Number(r.ret_porcentaje),
      "Valor retenido":  Number(r.ret_valor),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [12, 30, 35, 14, 10, 12, 14, 14, 8, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Retenciones");

    // Hoja de resumen por tipo
    const resumen: Record<string, number> = {};
    for (const r of rows) {
      resumen[r.ret_tipo] = (resumen[r.ret_tipo] ?? 0) + Number(r.ret_valor);
    }
    const resumenData = Object.entries(resumen).map(([tipo, total]) => ({
      "Tipo": tipo,
      "Total retenido": total,
    }));
    const wsRes = XLSX.utils.json_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsRes, "Resumen");

    enviarExcel(res, wb, `retenciones_${desde ?? "todo"}_${hasta ?? "todo"}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/retenciones:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/inventario
router.get("/inventario", async (req, res) => {
  try {
    const rows = await db
      .select({
        producto_codigo: productos.codigo,
        producto_nombre: productos.nombre,
        tipo_movimiento: movimientos_inventario.tipo,
        cantidad:        movimientos_inventario.cantidad,
        fecha:           movimientos_inventario.created_at,
        bodega_nombre:   bodegas.nombre,
        referencia:      movimientos_inventario.referencia_id,
        notas:           movimientos_inventario.observaciones,
      })
      .from(movimientos_inventario)
      .innerJoin(productos, eq(movimientos_inventario.producto_id, productos.id))
      .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
      .where(eq(movimientos_inventario.tenant_id, req.tenantId))
      .orderBy(desc(movimientos_inventario.created_at));

    const data = rows.map((r) => ({
      "Fecha":     r.fecha ? new Date(r.fecha).toLocaleDateString("es-CO") : "",
      "Bodega":    r.bodega_nombre,
      "Código":    r.producto_codigo,
      "Producto":  r.producto_nombre,
      "Tipo":      r.tipo_movimiento,
      "Cantidad":  Number(r.cantidad),
      "Referencia": r.referencia ?? "",
      "Notas":     r.notas ?? "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [12, 20, 10, 35, 10, 10, 15, 30].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    enviarExcel(res, wb, "inventario_movimientos.xlsx");
  } catch (err) {
    console.error("Error en GET /exportar/inventario:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/productos
// Exporta todos los productos del tenant con stock actual, precio e IVA
router.get("/productos", async (req, res) => {
  try {
    const rows = await db
      .select({
        codigo:       productos.codigo,
        nombre:       productos.nombre,
        descripcion:  productos.descripcion,
        tipo:         productos.tipo,
        precio_base:  productos.precio_base,
        precio_venta: productos.precio_venta,
        iva_pct:      productos.iva_pct,
        stock_actual: productos.stock_actual,
        unidad:       productos.unidad,
        activo:       productos.activo,
      })
      .from(productos)
      .where(eq(productos.tenant_id, req.tenantId))
      .orderBy(productos.nombre);

    const data = rows.map((p) => ({
      "Código":       p.codigo,
      "Nombre":       p.nombre,
      "Descripción":  p.descripcion ?? "",
      "Tipo":         p.tipo === "producto" ? "Producto" : "Servicio",
      "Precio base":  Number(p.precio_base),
      "Precio venta": Number(p.precio_venta ?? p.precio_base),
      "IVA %":        Number(p.iva_pct),
      "Stock actual": Number(p.stock_actual ?? 0),
      "Unidad":       p.unidad ?? "",
      "Activo":       p.activo ? "Sí" : "No",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [10, 35, 30, 10, 14, 14, 8, 12, 8, 6].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    enviarExcel(res, wb, "productos.xlsx");
  } catch (err) {
    console.error("Error en GET /exportar/productos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/gastos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/gastos", async (req, res) => {
  try {
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;

    const condiciones = [eq(gastos.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(gastos.fecha, desde));
    if (hasta) condiciones.push(lte(gastos.fecha, hasta));

    const rows = await db
      .select({
        fecha:             gastos.fecha,
        categoria:         gastos.categoria,
        descripcion:       gastos.descripcion,
        proveedor_nombre:  proveedores.nombre,
        monto:             gastos.monto,
        iva:               gastos.iva,
        total:             gastos.total,
        estado:            gastos.estado,
        pagado_at:         gastos.pagado_at,
        fecha_vencimiento: gastos.fecha_vencimiento,
        observaciones:     gastos.observaciones,
      })
      .from(gastos)
      .leftJoin(proveedores, eq(gastos.proveedor_id, proveedores.id))
      .where(and(...condiciones))
      .orderBy(desc(gastos.fecha));

    const CATEGORIA_LABEL: Record<string, string> = {
      nomina: "Nómina", arriendo: "Arriendo", servicios_publicos: "Servicios públicos",
      proveedores: "Proveedores", impuestos: "Impuestos", marketing: "Marketing",
      transporte: "Transporte", tecnologia: "Tecnología", seguros: "Seguros", otros: "Otros",
    };

    const data = rows.map((r) => ({
      "Fecha":             r.fecha ?? "",
      "Categoría":         CATEGORIA_LABEL[r.categoria] ?? r.categoria,
      "Descripción":       r.descripcion,
      "Proveedor":         r.proveedor_nombre ?? "",
      "Monto base":        Number(r.monto),
      "IVA":               Number(r.iva),
      "Total":             Number(r.total),
      "Estado":            r.estado,
      "Pagado":            r.pagado_at ? new Date(r.pagado_at).toLocaleDateString("es-CO") : "No",
      "Vencimiento":       r.fecha_vencimiento ?? "",
      "Observaciones":     r.observaciones ?? "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [12, 18, 40, 30, 14, 12, 14, 12, 12, 12, 30].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Gastos");
    enviarExcel(res, wb, `gastos_${desde ?? "todo"}_${hasta ?? "todo"}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/gastos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/cotizaciones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/cotizaciones", async (req, res) => {
  try {
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;

    const condiciones = [eq(cotizaciones.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(cotizaciones.fecha_emision, new Date(desde)));
    if (hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      condiciones.push(lte(cotizaciones.fecha_emision, hastaFin));
    }

    const rows = await db
      .select({
        numero: cotizaciones.numero,
        fecha_emision: cotizaciones.fecha_emision,
        fecha_vencimiento: cotizaciones.fecha_vencimiento,
        estado: cotizaciones.estado,
        cliente_nombre: clientes.nombre,
        cliente_nit: clientes.numero_documento,
        subtotal: cotizaciones.subtotal,
        iva_total: cotizaciones.iva_total,
        total: cotizaciones.total,
      })
      .from(cotizaciones)
      .innerJoin(clientes, eq(cotizaciones.cliente_id, clientes.id))
      .where(and(...condiciones))
      .orderBy(desc(cotizaciones.fecha_emision));

    const ESTADO_LABEL: Record<string, string> = {
      borrador: "Borrador", enviada: "Enviada", aceptada: "Aceptada",
      rechazada: "Rechazada", vencida: "Vencida", convertida: "Convertida",
    };

    const data = rows.map((r) => ({
      "Número":            r.numero,
      "Fecha":             r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString("es-CO") : "",
      "Vence":             r.fecha_vencimiento ? new Date(r.fecha_vencimiento).toLocaleDateString("es-CO") : "",
      "Estado":            ESTADO_LABEL[r.estado] ?? r.estado,
      "Cliente":           r.cliente_nombre,
      "NIT/CC":            r.cliente_nit,
      "Subtotal":          Number(r.subtotal),
      "IVA":               Number(r.iva_total),
      "Total":             Number(r.total),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [10, 12, 12, 12, 35, 14, 14, 12, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Cotizaciones");
    enviarExcel(res, wb, `cotizaciones_${desde ?? "todo"}_${hasta ?? "todo"}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/cotizaciones:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/notas-credito?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/notas-credito", async (req, res) => {
  try {
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;

    const condiciones = [eq(notas_credito.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(notas_credito.fecha_emision, new Date(desde)));
    if (hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      condiciones.push(lte(notas_credito.fecha_emision, hastaFin));
    }

    const rows = await db
      .select({
        numero: notas_credito.numero,
        tipo: notas_credito.tipo,
        motivo: notas_credito.motivo,
        estado: notas_credito.estado,
        estado_dian: notas_credito.estado_dian,
        fecha_emision: notas_credito.fecha_emision,
        subtotal: notas_credito.subtotal,
        iva_total: notas_credito.iva_total,
        total: notas_credito.total,
        cliente_nombre: clientes.nombre,
        cliente_nit: clientes.numero_documento,
        factura_numero: facturas.numero,
      })
      .from(notas_credito)
      .innerJoin(clientes, eq(notas_credito.cliente_id, clientes.id))
      .innerJoin(facturas, eq(notas_credito.factura_id, facturas.id))
      .where(and(...condiciones))
      .orderBy(desc(notas_credito.fecha_emision));

    const TIPO_LABEL: Record<string, string> = {
      anulacion: "Anulación", devolucion: "Devolución", descuento: "Descuento", ajuste: "Ajuste",
    };

    const data = rows.map((r) => ({
      "Número":       r.numero,
      "Tipo":         TIPO_LABEL[r.tipo] ?? r.tipo,
      "Motivo":       r.motivo,
      "Estado":       r.estado,
      "DIAN":         r.estado_dian ?? "",
      "Fecha":        r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString("es-CO") : "",
      "Cliente":      r.cliente_nombre,
      "NIT/CC":       r.cliente_nit,
      "Factura ref.": r.factura_numero,
      "Subtotal":     Number(r.subtotal),
      "IVA":          Number(r.iva_total),
      "Total":        Number(r.total),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [10, 12, 40, 10, 10, 12, 35, 14, 10, 14, 12, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Notas crédito");
    enviarExcel(res, wb, `notas_credito_${desde ?? "todo"}_${hasta ?? "todo"}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/notas-credito:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/notas-debito?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/notas-debito", async (req, res) => {
  try {
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;

    const condiciones = [eq(notas_debito.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(notas_debito.fecha_emision, new Date(desde)));
    if (hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      condiciones.push(lte(notas_debito.fecha_emision, hastaFin));
    }

    const rows = await db
      .select({
        numero: notas_debito.numero,
        tipo: notas_debito.tipo,
        motivo: notas_debito.motivo,
        estado_dian: notas_debito.estado_dian,
        fecha_emision: notas_debito.fecha_emision,
        subtotal: notas_debito.subtotal,
        iva_total: notas_debito.iva_total,
        total: notas_debito.total,
        cliente_nombre: clientes.nombre,
        cliente_nit: clientes.numero_documento,
        factura_numero: facturas.numero,
      })
      .from(notas_debito)
      .innerJoin(clientes, eq(notas_debito.cliente_id, clientes.id))
      .innerJoin(facturas, eq(notas_debito.factura_id, facturas.id))
      .where(and(...condiciones))
      .orderBy(desc(notas_debito.fecha_emision));

    const TIPO_LABEL: Record<string, string> = {
      interes: "Intereses", gastos: "Gastos", ajuste: "Ajuste",
    };

    const data = rows.map((r) => ({
      "Número":       r.numero,
      "Tipo":         TIPO_LABEL[r.tipo] ?? r.tipo,
      "Motivo":       r.motivo,
      "DIAN":         r.estado_dian ?? "",
      "Fecha":        r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString("es-CO") : "",
      "Cliente":      r.cliente_nombre,
      "NIT/CC":       r.cliente_nit,
      "Factura ref.": r.factura_numero,
      "Subtotal":     Number(r.subtotal),
      "IVA":          Number(r.iva_total),
      "Total":        Number(r.total),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [10, 12, 40, 10, 12, 35, 14, 10, 14, 12, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Notas débito");
    enviarExcel(res, wb, `notas_debito_${desde ?? "todo"}_${hasta ?? "todo"}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/notas-debito:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/exportar/proveedores
router.get("/proveedores", async (req, res) => {
  try {
    const rows = await db
      .select({
        nombre: proveedores.nombre,
        tipo_documento: proveedores.tipo_documento,
        nit: proveedores.nit,
        correo: proveedores.correo,
        telefono: proveedores.telefono,
        ciudad: proveedores.ciudad,
        persona_contacto: proveedores.persona_contacto,
        terminos_pago: proveedores.terminos_pago,
        activo: proveedores.activo,
      })
      .from(proveedores)
      .where(eq(proveedores.tenant_id, req.tenantId))
      .orderBy(proveedores.nombre);

    const data = rows.map((p) => ({
      "Nombre / Razón social": p.nombre,
      "Tipo documento": p.tipo_documento ?? "",
      "Número documento": p.nit ?? "",
      "Correo": p.correo ?? "",
      "Teléfono": p.telefono ?? "",
      "Ciudad": p.ciudad ?? "",
      "Contacto": p.persona_contacto ?? "",
      "Términos pago (días)": Number(p.terminos_pago ?? 0),
      "Estado": p.activo ? "Activo" : "Inactivo",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [30, 14, 16, 28, 14, 16, 20, 20, 10].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
    enviarExcel(res, wb, "proveedores.xlsx");
  } catch (err) {
    console.error("Error en GET /exportar/proveedores:", err);
    res.status(500).json({ error: "Error al exportar proveedores." });
  }
});

// GET /api/exportar/remisiones
router.get("/remisiones", async (req, res) => {
  try {
    const rows = await db
      .select({
        numero: remisiones.numero,
        fecha: remisiones.fecha,
        fecha_entrega: remisiones.fecha_entrega,
        estado: remisiones.estado,
        nombre_cliente: remisiones.nombre_cliente,
        total: remisiones.total,
        observaciones: remisiones.observaciones,
      })
      .from(remisiones)
      .where(eq(remisiones.tenant_id, req.tenantId))
      .orderBy(desc(remisiones.consecutivo));

    const ESTADO_LABEL: Record<string, string> = {
      borrador: "Borrador",
      enviada: "Enviada",
      entregada: "Entregada",
      anulada: "Anulada",
    };

    const data = rows.map((r) => ({
      "Número": r.numero,
      "Fecha": r.fecha ? new Date(r.fecha).toLocaleDateString("es-CO") : "",
      "Fecha entrega": r.fecha_entrega ? new Date(r.fecha_entrega).toLocaleDateString("es-CO") : "",
      "Estado": ESTADO_LABEL[r.estado ?? ""] ?? (r.estado ?? ""),
      "Cliente": r.nombre_cliente ?? "",
      "Total": Number(r.total ?? 0),
      "Observaciones": r.observaciones ?? "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [14, 12, 14, 12, 28, 14, 30].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Remisiones");
    enviarExcel(res, wb, "remisiones.xlsx");
  } catch (err) {
    console.error("Error en GET /exportar/remisiones:", err);
    res.status(500).json({ error: "Error al exportar remisiones." });
  }
});

// GET /api/exportar/kardex/:productoId
router.get("/kardex/:productoId", async (req, res) => {
  try {
    const { productoId } = req.params;

    const [prod] = await db
      .select({ nombre: productos.nombre, codigo: productos.codigo })
      .from(productos)
      .where(and(eq(productos.id, productoId), eq(productos.tenant_id, req.tenantId)))
      .limit(1);

    if (!prod) return res.status(404).json({ error: "Producto no encontrado." });

    const rows = await db
      .select({
        tipo: movimientos_inventario.tipo,
        cantidad: movimientos_inventario.cantidad,
        costo_unitario: movimientos_inventario.costo_unitario,
        referencia_tipo: movimientos_inventario.referencia_tipo,
        observaciones: movimientos_inventario.observaciones,
        created_at: movimientos_inventario.created_at,
        bodega: bodegas.nombre,
      })
      .from(movimientos_inventario)
      .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
      .where(and(eq(movimientos_inventario.producto_id, productoId), eq(movimientos_inventario.tenant_id, req.tenantId)))
      .orderBy(movimientos_inventario.created_at);

    const TIPO_LABEL: Record<string, string> = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste" };

    let saldo = 0;
    const data = rows.map((m) => {
      const qty = Number(m.cantidad ?? 0);
      const delta = m.tipo === "salida" ? -qty : qty;
      saldo += delta;
      return {
        "Fecha": new Date(m.created_at).toLocaleDateString("es-CO"),
        "Tipo": TIPO_LABEL[m.tipo ?? ""] ?? (m.tipo ?? ""),
        "Bodega": m.bodega,
        "Referencia": m.referencia_tipo ?? "",
        "Cantidad": delta,
        "Costo unit.": m.costo_unitario ? Number(m.costo_unitario) : "",
        "Saldo": saldo,
        "Observaciones": m.observaciones ?? "",
      };
    });

    const nombreArchivo = prod.codigo ? `kardex_${prod.codigo}.xlsx` : `kardex_${productoId.slice(0, 8)}.xlsx`;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [12, 10, 16, 14, 10, 12, 10, 30].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, prod.nombre.slice(0, 31));
    enviarExcel(res, wb, nombreArchivo);
  } catch (err) {
    console.error("Error en GET /exportar/kardex:", err);
    res.status(500).json({ error: "Error al exportar kardex." });
  }
});

// GET /api/exportar/datos-empresa
// Exporta todos los datos personales del tenant como JSON (Ley 1581 — portabilidad de datos).
// Solo para administradores.
router.get("/datos-empresa", async (req, res) => {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden exportar los datos completos." });
  }

  try {
    const [empresa] = await db
      .select({ id: tenants.id, nombre: tenants.nombre, nit: tenants.nit, correo: tenants.correo, direccion: tenants.direccion, ciudad: tenants.ciudad, created_at: tenants.created_at })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);

    const [clientesData, usuariosData, facturasData] = await Promise.all([
      db.select({ id: clientes.id, tipo_persona: clientes.tipo_persona, tipo_documento: clientes.tipo_documento, numero_documento: clientes.numero_documento, nombre: clientes.nombre, correo: clientes.correo, telefono: clientes.telefono, direccion: clientes.direccion, municipio: clientes.municipio, departamento: clientes.departamento, activo: clientes.activo, created_at: clientes.created_at })
        .from(clientes).where(eq(clientes.tenant_id, req.tenantId)),
      db.select({ id: users.id, nombre: users.nombre, email: users.email, role: users.role, activo: users.activo, created_at: users.created_at })
        .from(users).where(eq(users.tenant_id, req.tenantId)),
      db.select({ id: facturas.id, numero: facturas.numero, fecha_emision: facturas.fecha_emision, estado: facturas.estado, total: facturas.total, cliente_id: facturas.cliente_id })
        .from(facturas).where(eq(facturas.tenant_id, req.tenantId)).orderBy(desc(facturas.fecha_emision)).limit(5000),
    ]);

    const exportacion = {
      generado_en: new Date().toISOString(),
      ley_aplicable: "Ley 1581 de 2012 — Habeas Data Colombia",
      empresa,
      clientes: clientesData,
      usuarios: usuariosData,
      facturas_resumen: facturasData,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="datos-empresa-${empresa?.nit ?? req.tenantId}-${new Date().toISOString().split("T")[0]}.json"`);
    res.json(exportacion);
  } catch (err) {
    console.error("Error en GET /exportar/datos-empresa:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
