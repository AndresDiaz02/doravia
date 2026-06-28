import { Router } from "express";
import { db, facturas, clientes, retenciones_factura, productos, movimientos_inventario, bodegas, tenants, users } from "@workspace/db";
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
