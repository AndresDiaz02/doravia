import { Router } from "express";
import { db, facturas, productos, turnos_pos } from "@workspace/db";
import { eq, and, lt, lte, gte, isNull, count, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

interface Notificacion {
  id: string;
  tipo: "stock_sin_existencia" | "cartera_vencida" | "factura_vence_pronto" | "turno_abierto";
  titulo: string;
  descripcion: string;
  urgencia: "alta" | "media" | "baja";
  link: string;
  count?: number;
}

// GET /api/notificaciones
// Retorna alertas activas del tenant basadas en el estado actual de los datos.
// No requiere tabla en BD — se computa en tiempo real.
router.get("/", async (req, res) => {
  try {
    const ahora = new Date();
    const en7Dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      resultCartera,
      resultProximas,
      resultSinStock,
      resultTurnos,
    ] = await Promise.all([
      // Facturas vencidas sin pagar
      db
        .select({ total: count() })
        .from(facturas)
        .where(
          and(
            eq(facturas.tenant_id, req.tenantId),
            inArray(facturas.estado, ["aceptada", "enviada"]),
            isNull(facturas.pagada_at),
            lt(facturas.fecha_vencimiento, ahora),
          ),
        ),

      // Facturas que vencen en los próximos 7 días
      db
        .select({ total: count() })
        .from(facturas)
        .where(
          and(
            eq(facturas.tenant_id, req.tenantId),
            inArray(facturas.estado, ["aceptada", "enviada"]),
            isNull(facturas.pagada_at),
            gte(facturas.fecha_vencimiento, ahora),
            lte(facturas.fecha_vencimiento, en7Dias),
          ),
        ),

      // Productos sin existencia (stock_actual = 0 o negativo)
      db
        .select({ total: count() })
        .from(productos)
        .where(
          and(
            eq(productos.tenant_id, req.tenantId),
            eq(productos.activo, true),
            sql`${productos.stock_actual} <= 0`,
          ),
        ),

      // Turnos POS abiertos (puede ser una alerta si hay muchos o si llevan mucho tiempo)
      db
        .select({ total: count() })
        .from(turnos_pos)
        .where(
          and(
            eq(turnos_pos.tenant_id, req.tenantId),
            eq(turnos_pos.estado, "abierto"),
          ),
        ),
    ]);

    const notificaciones: Notificacion[] = [];

    const totalCartera = Number(resultCartera[0]?.total ?? 0);
    const totalProximas = Number(resultProximas[0]?.total ?? 0);
    const totalSinStock = Number(resultSinStock[0]?.total ?? 0);
    const totalTurnos = Number(resultTurnos[0]?.total ?? 0);

    if (totalCartera > 0) {
      notificaciones.push({
        id: "cartera_vencida",
        tipo: "cartera_vencida",
        titulo: "Cartera vencida",
        descripcion: `${totalCartera} factura${totalCartera > 1 ? "s" : ""} vencida${totalCartera > 1 ? "s" : ""} sin cobrar.`,
        urgencia: "alta",
        link: "/cartera",
        count: totalCartera,
      });
    }

    if (totalProximas > 0) {
      notificaciones.push({
        id: "factura_vence_pronto",
        tipo: "factura_vence_pronto",
        titulo: "Facturas por vencer",
        descripcion: `${totalProximas} factura${totalProximas > 1 ? "s vencen" : " vence"} en los próximos 7 días.`,
        urgencia: "media",
        link: "/alertas/cobro",
        count: totalProximas,
      });
    }

    if (totalSinStock > 0) {
      notificaciones.push({
        id: "stock_sin_existencia",
        tipo: "stock_sin_existencia",
        titulo: "Productos sin existencia",
        descripcion: `${totalSinStock} producto${totalSinStock > 1 ? "s" : ""} con stock en cero.`,
        urgencia: totalSinStock > 5 ? "alta" : "media",
        link: "/inventario",
        count: totalSinStock,
      });
    }

    if (totalTurnos > 0) {
      notificaciones.push({
        id: "turno_abierto",
        tipo: "turno_abierto",
        titulo: "Turno POS abierto",
        descripcion: `${totalTurnos} turno${totalTurnos > 1 ? "s" : ""} de caja abierto${totalTurnos > 1 ? "s" : ""}.`,
        urgencia: "baja",
        link: "/pos",
        count: totalTurnos,
      });
    }

    res.json(notificaciones);
  } catch (err) {
    console.error("Error en GET /notificaciones:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
