import { Router } from "express";
import { db, facturas, clientes } from "@workspace/db";
import { eq, and, desc, isNull, lt, gte, sql } from "drizzle-orm";

const router = Router();

type BucketAging = "al_dia" | "1_30" | "31_60" | "61_90" | "mas_90";

interface FacturaCartera {
  id: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  total: string;
  saldo: string;
  dias_vencida: number;
  bucket: BucketAging;
  cliente: { id: string; nombre: string; numero_documento: string };
}

function calcularBucket(diasVencida: number): BucketAging {
  if (diasVencida <= 0) return "al_dia";
  if (diasVencida <= 30) return "1_30";
  if (diasVencida <= 60) return "31_60";
  if (diasVencida <= 90) return "61_90";
  return "mas_90";
}

// GET /api/cartera/aging
// Agrupa las facturas aceptadas sin pagar por antigüedad de vencimiento
router.get("/aging", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: facturas.id,
        numero: facturas.numero,
        fecha_emision: facturas.fecha_emision,
        fecha_vencimiento: facturas.fecha_vencimiento,
        total: facturas.total,
        pagada_at: facturas.pagada_at,
        cliente: {
          id: clientes.id,
          nombre: clientes.nombre,
          numero_documento: clientes.numero_documento,
        },
      })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(
        and(
          eq(facturas.tenant_id, req.tenantId),
          eq(facturas.estado, "aceptada"),
          isNull(facturas.pagada_at),
        )
      )
      .orderBy(facturas.fecha_vencimiento);

    const hoy = new Date();

    const facturasMapeadas: FacturaCartera[] = rows.map((f) => {
      const venc = f.fecha_vencimiento ? new Date(f.fecha_vencimiento) : null;
      const diasVencida = venc
        ? Math.floor((hoy.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        id: f.id,
        numero: f.numero,
        fecha_emision: f.fecha_emision instanceof Date ? f.fecha_emision.toISOString() : String(f.fecha_emision),
        fecha_vencimiento: venc ? venc.toISOString() : null,
        total: f.total,
        saldo: f.total, // saldo completo (sin pagos parciales por ahora)
        dias_vencida: Math.max(0, diasVencida),
        bucket: calcularBucket(diasVencida),
        cliente: f.cliente,
      };
    });

    // Totales por bucket
    const buckets: Record<BucketAging, { count: number; total: number }> = {
      al_dia:  { count: 0, total: 0 },
      "1_30":  { count: 0, total: 0 },
      "31_60": { count: 0, total: 0 },
      "61_90": { count: 0, total: 0 },
      mas_90:  { count: 0, total: 0 },
    };
    for (const f of facturasMapeadas) {
      buckets[f.bucket].count++;
      buckets[f.bucket].total += Number(f.saldo);
    }

    res.json({
      facturas: facturasMapeadas,
      resumen: buckets,
      total_cartera: facturasMapeadas.reduce((s, f) => s + Number(f.saldo), 0),
    });
  } catch (err) {
    console.error("Error en GET /aging:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/cartera/estado-cuenta/:clienteId
// Estado de cuenta: todas las facturas + pagos de un cliente
router.get("/estado-cuenta/:clienteId", async (req, res) => {
  try {
    const { clienteId } = req.params;

    const [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.id, clienteId), eq(clientes.tenant_id, req.tenantId)))
      .limit(1);
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

    const facturasCliente = await db
      .select({
        id: facturas.id,
        numero: facturas.numero,
        fecha_emision: facturas.fecha_emision,
        fecha_vencimiento: facturas.fecha_vencimiento,
        estado: facturas.estado,
        total: facturas.total,
        pagada_at: facturas.pagada_at,
      })
      .from(facturas)
      .where(and(eq(facturas.tenant_id, req.tenantId), eq(facturas.cliente_id, clienteId)))
      .orderBy(desc(facturas.fecha_emision));

    const totalFacturado = facturasCliente
      .filter((f) => f.estado === "aceptada")
      .reduce((s, f) => s + Number(f.total), 0);

    const totalPagado = facturasCliente
      .filter((f) => f.pagada_at !== null)
      .reduce((s, f) => s + Number(f.total), 0);

    const saldoPendiente = totalFacturado - totalPagado;

    res.json({
      cliente,
      facturas: facturasCliente,
      resumen: {
        total_facturado: totalFacturado,
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        facturas_pendientes: facturasCliente.filter((f) => f.estado === "aceptada" && !f.pagada_at).length,
      },
    });
  } catch (err) {
    console.error("Error en GET /estado-cuenta/:clienteId:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/cartera/resumen
// Vista rápida: top 10 deudores, total cartera, cartera vencida
router.get("/resumen", async (req, res) => {
  try {
    const hoy = new Date();

    const [totales] = await db
      .select({
        total_cartera: sql<string>`COALESCE(SUM(${facturas.total}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(facturas)
      .where(and(
        eq(facturas.tenant_id, req.tenantId),
        eq(facturas.estado, "aceptada"),
        isNull(facturas.pagada_at),
      ));

    const [vencida] = await db
      .select({
        total_vencida: sql<string>`COALESCE(SUM(${facturas.total}), 0)`,
        count_vencida: sql<number>`COUNT(*)`,
      })
      .from(facturas)
      .where(and(
        eq(facturas.tenant_id, req.tenantId),
        eq(facturas.estado, "aceptada"),
        isNull(facturas.pagada_at),
        lt(facturas.fecha_vencimiento, hoy),
      ));

    // Top deudores: agrupar por cliente
    const porCliente = await db
      .select({
        cliente_id: facturas.cliente_id,
        nombre: clientes.nombre,
        total_pendiente: sql<string>`SUM(${facturas.total})`,
        facturas_pendientes: sql<number>`COUNT(*)`,
      })
      .from(facturas)
      .innerJoin(clientes, eq(facturas.cliente_id, clientes.id))
      .where(and(
        eq(facturas.tenant_id, req.tenantId),
        eq(facturas.estado, "aceptada"),
        isNull(facturas.pagada_at),
      ))
      .groupBy(facturas.cliente_id, clientes.nombre)
      .orderBy(sql`SUM(${facturas.total}) DESC`)
      .limit(10);

    res.json({
      total_cartera: Number(totales?.total_cartera ?? 0),
      facturas_pendientes: Number(totales?.count ?? 0),
      total_vencida: Number(vencida?.total_vencida ?? 0),
      facturas_vencidas: Number(vencida?.count_vencida ?? 0),
      top_deudores: porCliente,
    });
  } catch (err) {
    console.error("Error en GET /resumen:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
