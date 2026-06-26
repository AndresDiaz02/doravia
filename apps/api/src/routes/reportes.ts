import { Router } from "express";
import { db, facturas, clientes } from "@workspace/db";
import { eq, and, gte, lt, sum, count, desc, isNull, inArray, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAccountingLevel } from "../middleware/require-plan-feature.js";

const router = Router();

/**
 * Reporte de ventas del mes (o del periodo indicado).
 * Disponible desde Semilla.
 *
 * GET /api/reportes/ventas-mes?anio=2025&mes=6
 */
router.get("/ventas-mes", async (req, res) => {
  const ahora = new Date();
  const anio = Number(req.query.anio ?? ahora.getFullYear());
  const mes = Number(req.query.mes ?? ahora.getMonth() + 1); // 1-12

  const inicio = new Date(anio, mes - 1, 1);
  const fin = new Date(anio, mes, 1);

  // Totales del mes
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

  // Top 10 clientes del mes por valor
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

  // Facturas del mes en detalle
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
});

/**
 * Reporte comparativo — mes actual vs mes anterior y año actual vs año anterior.
 * Disponible desde Brote (accounting_level >= 3).
 *
 * GET /api/reportes/comparativo?anio=2025&mes=6
 */
router.get("/comparativo", requireAccountingLevel(3), async (req, res) => {
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

  // Mes actual
  const inicioMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 1);

  // Mes anterior
  const inicioMesAnt = new Date(anio, mes - 2, 1);
  const finMesAnt = new Date(anio, mes - 1, 1);

  // Año actual (hasta fin del mes consultado)
  const inicioAnio = new Date(anio, 0, 1);
  const finAnio = finMes;

  // Año anterior (mismo período)
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
});

// GET /api/reportes/tendencia-12
// Ventas por mes en los últimos 12 meses
router.get("/tendencia-12", async (req, res) => {
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
});

// GET /api/reportes/cartera-vencida
// Facturas sin pagar con fecha_vencimiento pasada, agrupadas por aging
router.get("/cartera-vencida", async (req, res) => {
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
});

export default router;
