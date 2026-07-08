import { Router } from "express";
import { db, asientos_contables, lineas_asiento, cuentas_contables, periodos_contables } from "@workspace/db";
import { eq, and, gte, lte, isNull, or, desc, sum, inArray, sql, count } from "drizzle-orm";
import { requireAccountingLevel, requireNotContador } from "../middleware/require-plan-feature.js";
import * as XLSX from "xlsx";

const router = Router();

// Libro diario — todos los asientos del periodo con sus líneas
router.get("/diario", async (req, res) => {
  try {
    const { desde, hasta } = req.query as { desde?: string; hasta?: string };

    const condiciones = [eq(asientos_contables.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(asientos_contables.fecha, desde));
    if (hasta) condiciones.push(lte(asientos_contables.fecha, hasta));

    const asientos = await db
      .select()
      .from(asientos_contables)
      .where(and(...condiciones))
      .orderBy(asientos_contables.fecha, asientos_contables.numero);

    const asientoIds = asientos.map((a) => a.id);
    if (asientoIds.length === 0) return res.json([]);

    const lineas = await db
      .select({ linea: lineas_asiento, cuenta: cuentas_contables })
      .from(lineas_asiento)
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(inArray(lineas_asiento.asiento_id, asientoIds));

    // Agrupar líneas por asiento
    const lineaMap = new Map<string, typeof lineas>();
    lineas.forEach((l) => {
      const key = l.linea.asiento_id;
      if (!lineaMap.has(key)) lineaMap.set(key, []);
      lineaMap.get(key)!.push(l);
    });

    res.json(asientos.map((a) => ({ ...a, lineas: lineaMap.get(a.id) ?? [] })));
  } catch (err) {
    console.error("Error en GET /diario:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Mayor de cuenta — movimientos de una cuenta en el periodo
router.get("/mayor/:codigo", async (req, res) => {
  try {
    const { desde, hasta } = req.query as { desde?: string; hasta?: string };
    const { codigo } = req.params;

    const [cuenta] = await db
      .select()
      .from(cuentas_contables)
      .where(
        and(
          eq(cuentas_contables.codigo, codigo),
          or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id))
        )
      )
      .orderBy(cuentas_contables.tenant_id)
      .limit(1);

    if (!cuenta) return res.status(404).json({ error: `Cuenta ${codigo} no encontrada.` });

    const condiciones = [
      eq(asientos_contables.tenant_id, req.tenantId),
      eq(lineas_asiento.cuenta_id, cuenta.id),
    ];
    if (desde) condiciones.push(gte(asientos_contables.fecha, desde));
    if (hasta) condiciones.push(lte(asientos_contables.fecha, hasta));

    const movimientos = await db
      .select({ asiento: asientos_contables, linea: lineas_asiento })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .where(and(...condiciones))
      .orderBy(asientos_contables.fecha);

    // Calcular saldo acumulado
    let saldo = 0;
    const conSaldo = movimientos.map(({ asiento, linea }) => {
      const mov = cuenta.naturaleza === "debito"
        ? Number(linea.debito) - Number(linea.credito)
        : Number(linea.credito) - Number(linea.debito);
      saldo += mov;
      return { asiento, linea, saldo };
    });

    res.json({ cuenta, movimientos: conSaldo });
  } catch (err) {
    console.error("Error en GET /mayor/:codigo:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Lista de cuentas PUC disponibles para el tenant
router.get("/cuentas", async (req, res) => {
  try {
    const cuentas = await db
      .select()
      .from(cuentas_contables)
      .where(
        and(
          or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
          eq(cuentas_contables.activo, true)
        )
      )
      .orderBy(cuentas_contables.codigo);

    res.json(cuentas);
  } catch (err) {
    console.error("Error en GET /cuentas:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Reportes nivel 2 (Raíz y superior) ────────────────────────────────────────

// GET /api/contabilidad/balance-prueba?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/balance-prueba", requireAccountingLevel(2), async (req, res) => {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const desde = (req.query.desde as string | undefined) ?? hoy.slice(0, 7) + "-01";
    const hasta = (req.query.hasta as string | undefined) ?? hoy;

    const filas = await db
      .select({
        codigo: cuentas_contables.codigo,
        nombre: cuentas_contables.nombre,
        tipo: cuentas_contables.tipo,
        naturaleza: cuentas_contables.naturaleza,
        debitos: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
        creditos: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          gte(asientos_contables.fecha, desde),
          lte(asientos_contables.fecha, hasta),
          or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
        ),
      )
      .groupBy(
        cuentas_contables.codigo,
        cuentas_contables.nombre,
        cuentas_contables.tipo,
        cuentas_contables.naturaleza,
      )
      .orderBy(cuentas_contables.codigo);

    const cuentas = filas.map((f) => {
      const d = Number(f.debitos);
      const c = Number(f.creditos);
      const saldo = f.naturaleza === "debito" ? d - c : c - d;
      return {
        codigo: f.codigo,
        nombre: f.nombre,
        tipo: f.tipo,
        naturaleza: f.naturaleza,
        debitos: d,
        creditos: c,
        saldo_debito:  saldo >= 0 && f.naturaleza === "debito"  ? saldo : saldo > 0 ? saldo : 0,
        saldo_credito: saldo >= 0 && f.naturaleza === "credito" ? saldo : saldo < 0 ? Math.abs(saldo) : 0,
      };
    });

    const totalDebitos  = cuentas.reduce((s, f) => s + f.debitos, 0);
    const totalCreditos = cuentas.reduce((s, f) => s + f.creditos, 0);
    const totalSaldoD   = cuentas.reduce((s, f) => s + f.saldo_debito, 0);
    const totalSaldoC   = cuentas.reduce((s, f) => s + f.saldo_credito, 0);

    res.json({
      desde,
      hasta,
      cuentas,
      totales: { debitos: totalDebitos, creditos: totalCreditos, saldo_debito: totalSaldoD, saldo_credito: totalSaldoC },
    });
  } catch (err) {
    console.error("Error en GET /balance-prueba:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/contabilidad/balance-general?corte=YYYY-MM-DD
router.get("/balance-general", requireAccountingLevel(2), async (req, res) => {
  try {
    const corte = (req.query.corte as string | undefined) ?? new Date().toISOString().split("T")[0];

    const filas = await db
      .select({
        tipo: cuentas_contables.tipo,
        codigo: cuentas_contables.codigo,
        nombre: cuentas_contables.nombre,
        naturaleza: cuentas_contables.naturaleza,
        total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
        total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          lte(asientos_contables.fecha, corte),
          or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
        ),
      )
      .groupBy(
        cuentas_contables.tipo,
        cuentas_contables.codigo,
        cuentas_contables.nombre,
        cuentas_contables.naturaleza,
      )
      .orderBy(cuentas_contables.codigo);

    // Calcular saldos: naturaleza débito → saldo = debito - credito; crédito → credito - debito
    const conSaldo = filas.map((f) => {
      const saldo =
        f.naturaleza === "debito"
          ? Number(f.total_debito) - Number(f.total_credito)
          : Number(f.total_credito) - Number(f.total_debito);
      return { ...f, saldo };
    });

    const activos = conSaldo.filter((f) => f.tipo === "activo");
    const pasivos = conSaldo.filter((f) => f.tipo === "pasivo");
    const patrimonio = conSaldo.filter((f) => f.tipo === "patrimonio");

    res.json({
      corte,
      activos,
      pasivos,
      patrimonio,
      totales: {
        activos: activos.reduce((s, f) => s + f.saldo, 0),
        pasivos: pasivos.reduce((s, f) => s + f.saldo, 0),
        patrimonio: patrimonio.reduce((s, f) => s + f.saldo, 0),
      },
    });
  } catch (err) {
    console.error("Error en GET /balance-general:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/contabilidad/estado-resultados?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/estado-resultados", requireAccountingLevel(2), async (req, res) => {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const desde = (req.query.desde as string | undefined) ?? hoy.slice(0, 7) + "-01";
    const hasta = (req.query.hasta as string | undefined) ?? hoy;

    const filas = await db
      .select({
        tipo: cuentas_contables.tipo,
        codigo: cuentas_contables.codigo,
        nombre: cuentas_contables.nombre,
        naturaleza: cuentas_contables.naturaleza,
        total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
        total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          gte(asientos_contables.fecha, desde),
          lte(asientos_contables.fecha, hasta),
          or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
          // Solo cuentas de resultado
          sql`${cuentas_contables.tipo} IN ('ingreso', 'costo', 'gasto')`,
        ),
      )
      .groupBy(
        cuentas_contables.tipo,
        cuentas_contables.codigo,
        cuentas_contables.nombre,
        cuentas_contables.naturaleza,
      )
      .orderBy(cuentas_contables.codigo);

    const ingresos = filas
      .filter((f) => f.tipo === "ingreso")
      .map((f) => ({ ...f, saldo: Number(f.total_credito) - Number(f.total_debito) }));

    const costos = filas
      .filter((f) => f.tipo === "costo")
      .map((f) => ({ ...f, saldo: Number(f.total_debito) - Number(f.total_credito) }));

    const gastos = filas
      .filter((f) => f.tipo === "gasto")
      .map((f) => ({ ...f, saldo: Number(f.total_debito) - Number(f.total_credito) }));

    const totalIngresos = ingresos.reduce((s, f) => s + f.saldo, 0);
    const totalCostos = costos.reduce((s, f) => s + f.saldo, 0);
    const totalGastos = gastos.reduce((s, f) => s + f.saldo, 0);

    res.json({
      periodo: { desde, hasta },
      ingresos,
      costos,
      gastos,
      totales: {
        ingresos: totalIngresos,
        costos: totalCostos,
        gastos: totalGastos,
        utilidad_bruta: totalIngresos - totalCostos,
        utilidad_neta: totalIngresos - totalCostos - totalGastos,
      },
    });
  } catch (err) {
    console.error("Error en GET /estado-resultados:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Períodos contables ────────────────────────────────────────────────────────

// GET /api/contabilidad/periodos
router.get("/periodos", async (req, res) => {
  try {
    const periodos = await db
      .select()
      .from(periodos_contables)
      .where(eq(periodos_contables.tenant_id, req.tenantId))
      .orderBy(desc(periodos_contables.fecha_inicio));
    res.json(periodos);
  } catch (err) {
    console.error("Error en GET /periodos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/contabilidad/periodos
router.post("/periodos", requireNotContador, async (req, res) => {
  try {
    const { nombre, tipo, fecha_inicio, fecha_fin } = req.body;
    if (!nombre || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: "Campos requeridos: nombre, fecha_inicio, fecha_fin." });
    }

    const [nuevo] = await db
      .insert(periodos_contables)
      .values({
        tenant_id: req.tenantId,
        nombre,
        tipo: tipo ?? "mensual",
        fecha_inicio,
        fecha_fin,
        estado: "abierto",
      })
      .returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /periodos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/contabilidad/periodos/:id/cerrar
router.patch("/periodos/:id/cerrar", requireNotContador, async (req, res) => {
  try {
    const [periodo] = await db
      .select()
      .from(periodos_contables)
      .where(and(eq(periodos_contables.id, req.params.id), eq(periodos_contables.tenant_id, req.tenantId)))
      .limit(1);

    if (!periodo) return res.status(404).json({ error: "Período no encontrado." });
    if (periodo.estado === "cerrado") return res.status(422).json({ error: "El período ya está cerrado." });

    const [cerrado] = await db
      .update(periodos_contables)
      .set({ estado: "cerrado", cerrado_at: new Date(), cerrado_por_id: req.userId })
      .where(eq(periodos_contables.id, periodo.id))
      .returning();

    res.json(cerrado);
  } catch (err) {
    console.error("Error en PATCH /periodos/:id/cerrar:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/contabilidad/periodos/:id/reabrir
router.patch("/periodos/:id/reabrir", requireNotContador, async (req, res) => {
  try {
    const [periodo] = await db
      .select()
      .from(periodos_contables)
      .where(and(eq(periodos_contables.id, req.params.id), eq(periodos_contables.tenant_id, req.tenantId)))
      .limit(1);

    if (!periodo) return res.status(404).json({ error: "Período no encontrado." });

    const [reabierto] = await db
      .update(periodos_contables)
      .set({ estado: "abierto", cerrado_at: null, cerrado_por_id: null })
      .where(eq(periodos_contables.id, periodo.id))
      .returning();

    res.json(reabierto);
  } catch (err) {
    console.error("Error en PATCH /periodos/:id/reabrir:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Exportar a Excel ──────────────────────────────────────────────────────────

function enviarExcel(res: import("express").Response, wb: XLSX.WorkBook, nombre: string) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(buf);
}

// GET /api/contabilidad/exportar/diario?desde=&hasta=
router.get("/exportar/diario", async (req, res) => {
  try {
    const { desde, hasta } = req.query as { desde?: string; hasta?: string };
    const hoy = new Date().toISOString().split("T")[0];

    const condiciones = [eq(asientos_contables.tenant_id, req.tenantId)];
    if (desde) condiciones.push(gte(asientos_contables.fecha, desde));
    if (hasta) condiciones.push(lte(asientos_contables.fecha, hasta));

    const filas = await db
      .select({
        asiento_numero: asientos_contables.numero,
        asiento_fecha: asientos_contables.fecha,
        asiento_descripcion: asientos_contables.descripcion,
        asiento_origen: asientos_contables.origen,
        cuenta_codigo: cuentas_contables.codigo,
        cuenta_nombre: cuentas_contables.nombre,
        linea_descripcion: lineas_asiento.descripcion,
        debito: lineas_asiento.debito,
        credito: lineas_asiento.credito,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(and(...condiciones))
      .orderBy(asientos_contables.fecha, asientos_contables.numero);

    const data = filas.map((f) => ({
      "Número asiento": f.asiento_numero,
      "Fecha":          f.asiento_fecha,
      "Descripción asiento": f.asiento_descripcion,
      "Origen":         f.asiento_origen,
      "Cuenta código":  f.cuenta_codigo,
      "Cuenta nombre":  f.cuenta_nombre,
      "Detalle línea":  f.linea_descripcion ?? "",
      "Débito":         Number(f.debito),
      "Crédito":        Number(f.credito),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [12, 12, 35, 10, 8, 30, 30, 14, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Libro Diario");
    enviarExcel(res, wb, `libro_diario_${desde ?? hoy}_${hasta ?? hoy}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/diario:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/contabilidad/exportar/balance?corte=
router.get("/exportar/balance", requireAccountingLevel(2), async (req, res) => {
  try {
    const corte = (req.query.corte as string | undefined) ?? new Date().toISOString().split("T")[0];

    const filas = await db
      .select({
        tipo: cuentas_contables.tipo,
        codigo: cuentas_contables.codigo,
        nombre: cuentas_contables.nombre,
        naturaleza: cuentas_contables.naturaleza,
        total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
        total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(and(eq(asientos_contables.tenant_id, req.tenantId), lte(asientos_contables.fecha, corte), or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id))))
      .groupBy(cuentas_contables.tipo, cuentas_contables.codigo, cuentas_contables.nombre, cuentas_contables.naturaleza)
      .orderBy(cuentas_contables.codigo);

    const data = filas.map((f) => {
      const saldo = f.naturaleza === "debito"
        ? Number(f.total_debito) - Number(f.total_credito)
        : Number(f.total_credito) - Number(f.total_debito);
      return {
        "Tipo":    f.tipo.charAt(0).toUpperCase() + f.tipo.slice(1),
        "Código":  f.codigo,
        "Cuenta":  f.nombre,
        "Débitos": Number(f.total_debito),
        "Créditos": Number(f.total_credito),
        "Saldo":   saldo,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [12, 8, 35, 14, 14, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Balance General");
    enviarExcel(res, wb, `balance_general_${corte}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/balance:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/contabilidad/exportar/estado-resultados?desde=&hasta=
router.get("/exportar/estado-resultados", requireAccountingLevel(2), async (req, res) => {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const desde = (req.query.desde as string | undefined) ?? hoy.slice(0, 7) + "-01";
    const hasta = (req.query.hasta as string | undefined) ?? hoy;

    const filas = await db
      .select({
        tipo: cuentas_contables.tipo,
        codigo: cuentas_contables.codigo,
        nombre: cuentas_contables.nombre,
        naturaleza: cuentas_contables.naturaleza,
        total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
        total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(and(eq(asientos_contables.tenant_id, req.tenantId), gte(asientos_contables.fecha, desde), lte(asientos_contables.fecha, hasta), or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)), sql`${cuentas_contables.tipo} IN ('ingreso', 'costo', 'gasto')`))
      .groupBy(cuentas_contables.tipo, cuentas_contables.codigo, cuentas_contables.nombre, cuentas_contables.naturaleza)
      .orderBy(cuentas_contables.codigo);

    const conSaldo = filas.map((f) => {
      const saldo = f.tipo === "ingreso"
        ? Number(f.total_credito) - Number(f.total_debito)
        : Number(f.total_debito) - Number(f.total_credito);
      return {
        "Tipo":    f.tipo.charAt(0).toUpperCase() + f.tipo.slice(1),
        "Código":  f.codigo,
        "Cuenta":  f.nombre,
        "Total":   saldo,
      };
    });

    const totalIngresos = conSaldo.filter((f) => f["Tipo"] === "Ingreso").reduce((s, f) => s + f["Total"], 0);
    const totalCostos = conSaldo.filter((f) => f["Tipo"] === "Costo").reduce((s, f) => s + f["Total"], 0);
    const totalGastos = conSaldo.filter((f) => f["Tipo"] === "Gasto").reduce((s, f) => s + f["Total"], 0);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(conSaldo);
    ws["!cols"] = [10, 8, 35, 14].map((w) => ({ wch: w }));

    // Fila de utilidad neta al final
    const resumen = [
      { "Tipo": "", "Código": "", "Cuenta": "Total Ingresos", "Total": totalIngresos },
      { "Tipo": "", "Código": "", "Cuenta": "Total Costos", "Total": -totalCostos },
      { "Tipo": "", "Código": "", "Cuenta": "Total Gastos", "Total": -totalGastos },
      { "Tipo": "", "Código": "", "Cuenta": "UTILIDAD NETA", "Total": totalIngresos - totalCostos - totalGastos },
    ];
    const wsResumen = XLSX.utils.json_to_sheet(resumen);
    XLSX.utils.book_append_sheet(wb, ws, "Estado de Resultados");
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    enviarExcel(res, wb, `estado_resultados_${desde}_${hasta}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/estado-resultados:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/contabilidad/exportar/balance-prueba?desde=&hasta=
router.get("/exportar/balance-prueba", requireAccountingLevel(2), async (req, res) => {
  try {
    const hoy = new Date().toISOString().split("T")[0];
    const desde = (req.query.desde as string | undefined) ?? hoy.slice(0, 7) + "-01";
    const hasta = (req.query.hasta as string | undefined) ?? hoy;

    const filas = await db
      .select({
        codigo: cuentas_contables.codigo,
        nombre: cuentas_contables.nombre,
        tipo: cuentas_contables.tipo,
        naturaleza: cuentas_contables.naturaleza,
        debitos: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
        creditos: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          gte(asientos_contables.fecha, desde),
          lte(asientos_contables.fecha, hasta),
          or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
        ),
      )
      .groupBy(cuentas_contables.codigo, cuentas_contables.nombre, cuentas_contables.tipo, cuentas_contables.naturaleza)
      .orderBy(cuentas_contables.codigo);

    const data = filas.map((f) => {
      const d = Number(f.debitos);
      const c = Number(f.creditos);
      const saldoD = f.naturaleza === "debito" && d >= c ? d - c : 0;
      const saldoC = f.naturaleza === "credito" && c >= d ? c - d : f.naturaleza === "debito" && c > d ? c - d : 0;
      return {
        "Código":         f.codigo,
        "Cuenta":         f.nombre,
        "Tipo":           f.tipo.charAt(0).toUpperCase() + f.tipo.slice(1),
        "Naturaleza":     f.naturaleza === "debito" ? "Débito" : "Crédito",
        "Total débitos":  d,
        "Total créditos": c,
        "Saldo débito":   saldoD,
        "Saldo crédito":  saldoC,
      };
    });

    const totD  = data.reduce((s, r) => s + r["Total débitos"],  0);
    const totC  = data.reduce((s, r) => s + r["Total créditos"], 0);
    const totSD = data.reduce((s, r) => s + r["Saldo débito"],   0);
    const totSC = data.reduce((s, r) => s + r["Saldo crédito"],  0);
    data.push({ "Código": "TOTAL", "Cuenta": "", "Tipo": "", "Naturaleza": "", "Total débitos": totD, "Total créditos": totC, "Saldo débito": totSD, "Saldo crédito": totSC });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [8, 35, 12, 10, 14, 14, 14, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Balance de Prueba");
    enviarExcel(res, wb, `balance_prueba_${desde}_${hasta}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/balance-prueba:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/contabilidad/exportar/mayor/:codigo?desde=&hasta=
router.get("/exportar/mayor/:codigo", requireAccountingLevel(1), async (req, res) => {
  try {
    const { codigo } = req.params;
    const { desde, hasta } = req.query as { desde?: string; hasta?: string };

    const [cuenta] = await db
      .select()
      .from(cuentas_contables)
      .where(and(eq(cuentas_contables.codigo, codigo), or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id))))
      .orderBy(cuentas_contables.tenant_id)
      .limit(1);

    if (!cuenta) return res.status(404).json({ error: `Cuenta ${codigo} no encontrada.` });

    const condiciones = [
      eq(asientos_contables.tenant_id, req.tenantId),
      eq(lineas_asiento.cuenta_id, cuenta.id),
    ];
    if (desde) condiciones.push(gte(asientos_contables.fecha, desde));
    if (hasta) condiciones.push(lte(asientos_contables.fecha, hasta));

    const movimientos = await db
      .select({ asiento: asientos_contables, linea: lineas_asiento })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .where(and(...condiciones))
      .orderBy(asientos_contables.fecha);

    let saldo = 0;
    const data = movimientos.map(({ asiento, linea }) => {
      const mov = cuenta.naturaleza === "debito"
        ? Number(linea.debito) - Number(linea.credito)
        : Number(linea.credito) - Number(linea.debito);
      saldo += mov;
      return {
        "Fecha": asiento.fecha,
        "Asiento": asiento.numero,
        "Descripción": asiento.descripcion ?? "",
        "Débito": Number(linea.debito),
        "Crédito": Number(linea.credito),
        "Saldo": saldo,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [12, 12, 40, 14, 14, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, `${cuenta.codigo} ${cuenta.nombre}`.slice(0, 31));
    enviarExcel(res, wb, `auxiliar_${codigo}_${desde ?? ""}_${hasta ?? ""}.xlsx`);
  } catch (err) {
    console.error("Error en GET /exportar/mayor:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Plan de cuentas — gestión por tenant ──────────────────────────────────────

// GET /api/contabilidad/plan-cuentas
// Devuelve todas las cuentas: sistema (tenant_id null) + propias del tenant
router.get("/plan-cuentas", requireAccountingLevel(1), async (req, res) => {
  try {
    const cuentas = await db
      .select()
      .from(cuentas_contables)
      .where(or(isNull(cuentas_contables.tenant_id), eq(cuentas_contables.tenant_id, req.tenantId)))
      .orderBy(cuentas_contables.codigo);

    res.json(cuentas);
  } catch (err) {
    console.error("Error en GET /plan-cuentas:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/contabilidad/plan-cuentas
// Crea una cuenta propia del tenant (nivel 4+ recomendado)
router.post("/plan-cuentas", requireAccountingLevel(1), requireNotContador, async (req, res) => {
  try {
    const { codigo, nombre, tipo, naturaleza, nivel, padre_id } = req.body as {
      codigo?: string;
      nombre?: string;
      tipo?: string;
      naturaleza?: string;
      nivel?: number;
      padre_id?: string;
    };

    if (!codigo || !nombre || !tipo || !naturaleza || !nivel) {
      return res.status(400).json({ error: "Campos requeridos: codigo, nombre, tipo, naturaleza, nivel." });
    }
    if (!["activo", "pasivo", "patrimonio", "ingreso", "costo", "gasto"].includes(tipo)) {
      return res.status(400).json({ error: "tipo inválido." });
    }
    if (!["debito", "credito"].includes(naturaleza)) {
      return res.status(400).json({ error: "naturaleza inválida: debe ser 'debito' o 'credito'." });
    }
    if (!/^\d+$/.test(codigo)) {
      return res.status(400).json({ error: "El código solo puede contener dígitos." });
    }

    // Verificar que el código no esté ya en uso para este tenant (o en sistema)
    const [existente] = await db
      .select({ id: cuentas_contables.id })
      .from(cuentas_contables)
      .where(
        and(
          eq(cuentas_contables.codigo, codigo),
          or(isNull(cuentas_contables.tenant_id), eq(cuentas_contables.tenant_id, req.tenantId)),
        ),
      )
      .limit(1);

    if (existente) return res.status(422).json({ error: `Ya existe una cuenta con el código ${codigo}.` });

    const [nueva] = await db
      .insert(cuentas_contables)
      .values({
        tenant_id: req.tenantId,
        codigo,
        nombre,
        tipo: tipo as "activo" | "pasivo" | "patrimonio" | "ingreso" | "costo" | "gasto",
        naturaleza: naturaleza as "debito" | "credito",
        nivel,
        padre_id: padre_id ?? null,
      })
      .returning();

    res.status(201).json(nueva);
  } catch (err) {
    console.error("Error en POST /plan-cuentas:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/contabilidad/plan-cuentas/:id
// Edita nombre o activo — solo para cuentas propias del tenant
router.patch("/plan-cuentas/:id", requireAccountingLevel(1), requireNotContador, async (req, res) => {
  try {
    const [cuenta] = await db
      .select()
      .from(cuentas_contables)
      .where(
        and(eq(cuentas_contables.id, req.params.id), eq(cuentas_contables.tenant_id, req.tenantId)),
      )
      .limit(1);

    if (!cuenta) {
      return res.status(404).json({ error: "Cuenta no encontrada o no editable (las cuentas del sistema son de solo lectura)." });
    }

    const { nombre, activo } = req.body as { nombre?: string; activo?: boolean };
    const updates: Partial<typeof cuentas_contables.$inferInsert> = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (activo !== undefined) updates.activo = activo;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nada que actualizar." });
    }

    const [actualizada] = await db
      .update(cuentas_contables)
      .set(updates)
      .where(eq(cuentas_contables.id, cuenta.id))
      .returning();

    res.json(actualizada);
  } catch (err) {
    console.error("Error en PATCH /plan-cuentas/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/contabilidad/cierre-anual
// Cierra el ejercicio anual: crea asiento de cierre de cuentas de resultado.
// Solo admins. El año debe tener todos los períodos mensuales cerrados.
router.post("/cierre-anual", requireNotContador, async (req, res) => {
  try {
    const { ano } = req.body as { ano?: number };
    if (!ano || isNaN(Number(ano))) {
      return res.status(400).json({ error: "Se requiere el campo 'ano' (número, ej. 2025)." });
    }
    const anoNum = Number(ano);

    // Solo admin puede hacer cierre anual
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede realizar el cierre anual." });
    }

    const desdeAno = `${anoNum}-01-01`;
    const hastaAno = `${anoNum}-12-31`;

    // 1. Verificar que todos los períodos mensuales estén cerrados
    const periodosAbiertos = await db
      .select({ id: periodos_contables.id, nombre: periodos_contables.nombre })
      .from(periodos_contables)
      .where(
        and(
          eq(periodos_contables.tenant_id, req.tenantId),
          gte(periodos_contables.fecha_inicio, desdeAno),
          lte(periodos_contables.fecha_fin, hastaAno),
          sql`${periodos_contables.estado} != 'cerrado'`,
        ),
      );

    if (periodosAbiertos.length > 0) {
      return res.status(422).json({
        error: `Deben cerrarse todos los períodos mensuales antes del cierre anual. Períodos pendientes: ${periodosAbiertos.map((p) => p.nombre).join(", ")}.`,
      });
    }

    // 2. Verificar si ya existe un asiento de cierre anual para este año
    const patronCierre = `Cierre anual ${anoNum}%`;
    const [asientoCierreExistente] = await db
      .select({ id: asientos_contables.id })
      .from(asientos_contables)
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          sql`${asientos_contables.origen} = 'ajuste'`,
          sql`${asientos_contables.descripcion} LIKE ${patronCierre}`,
        ),
      )
      .limit(1);

    if (asientoCierreExistente) {
      return res.status(409).json({
        error: `El cierre del ejercicio ${anoNum} ya fue realizado.`,
      });
    }

    // 3. Calcular saldos de cuentas de resultado (4xxx ingresos, 5xxx costos/gastos)
    const saldosResultado = await db
      .select({
        codigo: cuentas_contables.codigo,
        id: cuentas_contables.id,
        tipo: cuentas_contables.tipo,
        naturaleza: cuentas_contables.naturaleza,
        total_debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
        total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          gte(asientos_contables.fecha, desdeAno),
          lte(asientos_contables.fecha, hastaAno),
          or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
          sql`(${cuentas_contables.codigo} LIKE '4%' OR ${cuentas_contables.codigo} LIKE '5%')`,
        ),
      )
      .groupBy(cuentas_contables.codigo, cuentas_contables.id, cuentas_contables.tipo, cuentas_contables.naturaleza)
      .orderBy(cuentas_contables.codigo);

    // 4. Calcular utilidad/pérdida
    let totalIngresos = 0;
    let totalGastos = 0;

    for (const fila of saldosResultado) {
      const debito = Number(fila.total_debito);
      const credito = Number(fila.total_credito);
      if (fila.codigo.startsWith("4")) {
        // Ingresos: naturaleza crédito → saldo = crédito - débito
        totalIngresos += credito - debito;
      } else if (fila.codigo.startsWith("5")) {
        // Gastos/costos: naturaleza débito → saldo = débito - crédito
        totalGastos += debito - credito;
      }
    }

    const utilidad = totalIngresos - totalGastos;

    // 5. Crear asiento de cierre anual
    const [{ value: totalAsientos }] = await db
      .select({ value: count() })
      .from(asientos_contables)
      .where(eq(asientos_contables.tenant_id, req.tenantId));

    const seq = String(Number(totalAsientos) + 1).padStart(5, "0");
    const numeroAsiento = `AC-${anoNum}-${seq}`;
    const fechaCierre = `${anoNum}-12-31`;

    const [asiento] = await db
      .insert(asientos_contables)
      .values({
        tenant_id: req.tenantId,
        numero: numeroAsiento,
        fecha: fechaCierre,
        descripcion: `Cierre anual ${anoNum}`,
        origen: "ajuste",
      })
      .returning();

    // Construir líneas del asiento de cierre
    const lineasCierre: { asiento_id: string; cuenta_id: string; descripcion: string; debito: string; credito: string }[] = [];

    // Cancelar cuentas de ingresos (4xxx): débito = saldo ingreso
    for (const fila of saldosResultado.filter((f) => f.codigo.startsWith("4"))) {
      const saldo = Number(fila.total_credito) - Number(fila.total_debito);
      if (saldo !== 0) {
        lineasCierre.push({
          asiento_id: asiento.id,
          cuenta_id: fila.id,
          descripcion: `Cierre ingresos ${anoNum}`,
          debito: saldo > 0 ? String(saldo) : "0",
          credito: saldo < 0 ? String(Math.abs(saldo)) : "0",
        });
      }
    }

    // Cancelar cuentas de gastos/costos (5xxx): crédito = saldo gasto
    for (const fila of saldosResultado.filter((f) => f.codigo.startsWith("5"))) {
      const saldo = Number(fila.total_debito) - Number(fila.total_credito);
      if (saldo !== 0) {
        lineasCierre.push({
          asiento_id: asiento.id,
          cuenta_id: fila.id,
          descripcion: `Cierre gastos/costos ${anoNum}`,
          debito: saldo < 0 ? String(Math.abs(saldo)) : "0",
          credito: saldo > 0 ? String(saldo) : "0",
        });
      }
    }

    // La diferencia va a utilidad (360505) o pérdida (330500)
    if (utilidad !== 0) {
      const codigoResultado = utilidad >= 0 ? "360505" : "330500";
      const nombreResultado = utilidad >= 0 ? "Utilidad del ejercicio" : "Pérdida del ejercicio";

      // Buscar o usar cuenta genérica
      const cuentaResultadoRows = await db
        .select({ id: cuentas_contables.id })
        .from(cuentas_contables)
        .where(
          and(
            eq(cuentas_contables.codigo, codigoResultado),
            or(eq(cuentas_contables.tenant_id, req.tenantId), isNull(cuentas_contables.tenant_id)),
          ),
        )
        .limit(1);

      if (cuentaResultadoRows.length > 0) {
        lineasCierre.push({
          asiento_id: asiento.id,
          cuenta_id: cuentaResultadoRows[0].id,
          descripcion: `${nombreResultado} ${anoNum}`,
          debito: utilidad < 0 ? String(Math.abs(utilidad)) : "0",
          credito: utilidad >= 0 ? String(utilidad) : "0",
        });
      }
    }

    if (lineasCierre.length > 0) {
      await db.insert(lineas_asiento).values(lineasCierre);
    }

    const mensaje = utilidad >= 0
      ? `Cierre anual ${anoNum} registrado. Utilidad del ejercicio: $${utilidad.toLocaleString("es-CO")}`
      : `Cierre anual ${anoNum} registrado. Pérdida del ejercicio: $${Math.abs(utilidad).toLocaleString("es-CO")}`;

    res.status(201).json({ ano: anoNum, utilidad, asiento_id: asiento.id, mensaje });
  } catch (err) {
    console.error("Error en POST /cierre-anual:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
