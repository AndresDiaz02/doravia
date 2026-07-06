import { Router } from "express";
import { db, facturas, clientes, tenants, resoluciones_dian, gastos, productos } from "@workspace/db";
import { eq, and, gte, lt, lte, sum, count, desc, isNull, inArray, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAccountingLevel } from "../middleware/require-plan-feature.js";

const router = Router();

// GET /api/reportes/ventas-mes?anio=2025&mes=6
router.get("/ventas-mes", async (req, res) => {
  try {
    const ahora = new Date();
    const anio = Number(req.query.anio ?? ahora.getFullYear());
    const mes = Number(req.query.mes ?? ahora.getMonth() + 1);

    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 1);

    const [totales] = await db
      .select({
        cantidad_facturas: count(facturas.id),
        subtotal: sum(facturas.subtotal),
        iva: sum(facturas.iva_total),
        total: sum(facturas.total),
      })
      .from(facturas)
      .where(
        and(
          eq(facturas.tenant_id, req.tenantId),
          eq(facturas.estado, "aceptada"),
          gte(facturas.fecha_emision, inicio),
          lt(facturas.fecha_emision, fin)
        )
      );

    const topClientes = await db
      .select({
        cliente_id: facturas.cliente_id,
        nombre: clientes.nombre,
        total: sum(facturas.total),
        facturas: count(facturas.id),
      })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(
        and(
          eq(facturas.tenant_id, req.tenantId),
          eq(facturas.estado, "aceptada"),
          gte(facturas.fecha_emision, inicio),
          lt(facturas.fecha_emision, fin)
        )
      )
      .groupBy(facturas.cliente_id, clientes.nombre)
      .orderBy(desc(sum(facturas.total)))
      .limit(10);

    const detalle = await db
      .select({
        id: facturas.id,
        numero: facturas.numero,
        fecha_emision: facturas.fecha_emision,
        estado: facturas.estado,
        total: facturas.total,
        cliente: clientes.nombre,
      })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(
        and(
          eq(facturas.tenant_id, req.tenantId),
          gte(facturas.fecha_emision, inicio),
          lt(facturas.fecha_emision, fin)
        )
      )
      .orderBy(desc(facturas.fecha_emision));

    res.json({
      periodo: { anio, mes, desde: inicio.toISOString(), hasta: fin.toISOString() },
      resumen: totales,
      top_clientes: topClientes,
      facturas: detalle,
    });
  } catch (err) {
    console.error("Error en /reportes/ventas-mes:", err);
    res.status(500).json({ error: "Error al generar reporte de ventas" });
  }
});

// GET /api/reportes/comparativo?anio=2025&mes=6
router.get("/comparativo", requireAccountingLevel(3), async (req, res) => {
  try {
    const ahora = new Date();
    const anio = Number(req.query.anio ?? ahora.getFullYear());
    const mes = Number(req.query.mes ?? ahora.getMonth() + 1);

    async function totalesPeriodo(inicio: Date, fin: Date) {
      const [r] = await db
        .select({
          facturas: count(facturas.id),
          total: sum(facturas.total),
        })
        .from(facturas)
        .where(
          and(
            eq(facturas.tenant_id, req.tenantId),
            eq(facturas.estado, "aceptada"),
            gte(facturas.fecha_emision, inicio),
            lt(facturas.fecha_emision, fin),
          ),
        );
      return { facturas: r.facturas, total: Number(r.total ?? 0) };
    }

    const inicioMes = new Date(anio, mes - 1, 1);
    const finMes = new Date(anio, mes, 1);
    const inicioMesAnt = new Date(anio, mes - 2, 1);
    const finMesAnt = new Date(anio, mes - 1, 1);
    const inicioAnio = new Date(anio, 0, 1);
    const finAnio = finMes;
    const inicioAnioAnt = new Date(anio - 1, 0, 1);
    const finAnioAnt = new Date(anio - 1, mes, 1);

    const [mesActual, mesAnterior, anioActual, anioAnterior] = await Promise.all([
      totalesPeriodo(inicioMes, finMes),
      totalesPeriodo(inicioMesAnt, finMesAnt),
      totalesPeriodo(inicioAnio, finAnio),
      totalesPeriodo(inicioAnioAnt, finAnioAnt),
    ]);

    function variacion(actual: number, anterior: number) {
      if (anterior === 0) return actual > 0 ? 100 : 0;
      return Number((((actual - anterior) / anterior) * 100).toFixed(1));
    }

    res.json({
      periodo: { anio, mes },
      mes: {
        actual: mesActual,
        anterior: mesAnterior,
        variacion_total: variacion(mesActual.total, mesAnterior.total),
        variacion_facturas: variacion(mesActual.facturas, mesAnterior.facturas),
      },
      anio: {
        actual: anioActual,
        anterior: anioAnterior,
        variacion_total: variacion(anioActual.total, anioAnterior.total),
        variacion_facturas: variacion(anioActual.facturas, anioAnterior.facturas),
      },
    });
  } catch (err) {
    console.error("Error en /reportes/comparativo:", err);
    res.status(500).json({ error: "Error al generar reporte comparativo" });
  }
});

// GET /api/reportes/tendencia-12
router.get("/tendencia-12", async (req, res) => {
  try {
    const ahora = new Date();
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 11, 1);

    const rows = await db.execute(sql`
      SELECT
        EXTRACT(YEAR  FROM fecha_emision)::int AS anio,
        EXTRACT(MONTH FROM fecha_emision)::int AS mes,
        COALESCE(SUM(total), 0)               AS total,
        COUNT(*)::int                          AS facturas
      FROM facturas
      WHERE tenant_id = ${req.tenantId}
        AND estado NOT IN ('borrador', 'anulada', 'rechazada')
        AND fecha_emision >= ${inicio}
      GROUP BY anio, mes
      ORDER BY anio, mes
    `);

    type Row = { anio: number; mes: number; total: string; facturas: number };
    const mapa = new Map<string, Row>(
      (rows as unknown as Row[]).map((r) => [`${r.anio}-${r.mes}`, r]),
    );

    const resultado = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const row = mapa.get(key);
      return {
        periodo: key,
        anio: d.getFullYear(),
        mes: d.getMonth() + 1,
        total: row ? Number(row.total) : 0,
        facturas: row ? row.facturas : 0,
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error("Error en /reportes/tendencia-12:", err);
    res.status(500).json({ error: "Error al generar tendencia" });
  }
});

// GET /api/reportes/cartera-vencida
router.get("/cartera-vencida", async (req, res) => {
  try {
    const ahora = new Date();

    const rows = await db
      .select({
        id: facturas.id,
        numero: facturas.numero,
        total: facturas.total,
        neto_a_pagar: facturas.neto_a_pagar,
        fecha_vencimiento: facturas.fecha_vencimiento,
        cliente: clientes.nombre,
      })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(
        and(
          eq(facturas.tenant_id, req.tenantId),
          inArray(facturas.estado, ["aceptada", "enviada"]),
          isNull(facturas.pagada_at),
          lt(facturas.fecha_vencimiento, ahora),
        ),
      )
      .orderBy(asc(facturas.fecha_vencimiento));

    const aging = { d30: 0, d60: 0, d90: 0, dMas: 0 };
    let totalVencido = 0;

    const detalle = rows.map((f) => {
      const dias = Math.floor(
        (ahora.getTime() - new Date(f.fecha_vencimiento!).getTime()) / 86_400_000,
      );
      const monto = Number(f.neto_a_pagar || f.total);
      totalVencido += monto;
      if (dias <= 30) aging.d30 += monto;
      else if (dias <= 60) aging.d60 += monto;
      else if (dias <= 90) aging.d90 += monto;
      else aging.dMas += monto;
      return { ...f, diasVencida: dias, monto };
    });

    res.json({ total: totalVencido, aging, facturas: detalle.slice(0, 15) });
  } catch (err) {
    console.error("Error en /reportes/cartera-vencida:", err);
    res.status(500).json({ error: "Error al generar cartera vencida" });
  }
});

// GET /api/reportes/gastos-mes?anio=2026&mes=6
router.get("/gastos-mes", async (req, res) => {
  try {
    const ahora = new Date();
    const anio = Number(req.query.anio ?? ahora.getFullYear());
    const mes = Number(req.query.mes ?? ahora.getMonth() + 1);

    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 1);

    const [totales] = await db
      .select({
        cantidad: count(gastos.id),
        total: sum(gastos.total),
        pendiente: sql<string>`COALESCE(SUM(CASE WHEN ${gastos.estado} = 'pendiente' THEN ${gastos.total} ELSE 0 END), 0)`,
      })
      .from(gastos)
      .where(
        and(
          eq(gastos.tenant_id, req.tenantId),
          gte(gastos.fecha, inicio.toISOString().split("T")[0]!),
          lt(gastos.fecha, fin.toISOString().split("T")[0]!),
          inArray(gastos.estado, ["aprobado", "pagado", "pendiente"]),
        ),
      );

    res.json({
      periodo: { anio, mes },
      cantidad: Number(totales?.cantidad ?? 0),
      total: Number(totales?.total ?? 0),
      pendiente: Number(totales?.pendiente ?? 0),
    });
  } catch (err) {
    console.error("Error en /reportes/gastos-mes:", err);
    res.status(500).json({ error: "Error al generar reporte de gastos" });
  }
});

// GET /api/reportes/productos-sin-stock
router.get("/productos-sin-stock", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: productos.id,
        codigo: productos.codigo,
        nombre: productos.nombre,
        stock_actual: productos.stock_actual,
      })
      .from(productos)
      .where(
        and(
          eq(productos.tenant_id, req.tenantId),
          eq(productos.activo, true),
          eq(productos.tipo, "producto"),
          lte(productos.stock_actual, "0"),
        ),
      )
      .orderBy(asc(productos.nombre))
      .limit(20);

    res.json({ total: rows.length, productos: rows });
  } catch (err) {
    console.error("Error en /reportes/productos-sin-stock:", err);
    res.status(500).json({ error: "Error al obtener productos sin stock" });
  }
});

// GET /api/reportes/primeros-pasos
router.get("/primeros-pasos", async (req, res) => {
  try {
    const tid = req.tenantId;

    const [tenant] = await db
      .select({ direccion: tenants.direccion })
      .from(tenants)
      .where(eq(tenants.id, tid))
      .limit(1);

    const [{ totalRes }] = await db
      .select({ totalRes: count(resoluciones_dian.id) })
      .from(resoluciones_dian)
      .where(eq(resoluciones_dian.tenant_id, tid));

    const [{ totalCli }] = await db
      .select({ totalCli: count(clientes.id) })
      .from(clientes)
      .where(eq(clientes.tenant_id, tid));

    const [{ totalFact }] = await db
      .select({ totalFact: count(facturas.id) })
      .from(facturas)
      .where(eq(facturas.tenant_id, tid));

    res.json({
      empresa: !!tenant?.direccion,
      resolucion: Number(totalRes) > 0,
      clientes: Number(totalCli) > 0,
      facturas: Number(totalFact) > 0,
    });
  } catch (err) {
    console.error("primeros-pasos:", err);
    res.status(500).json({ error: "Error al obtener el estado inicial." });
  }
});

export default router;
