import { Router, type Response } from "express";
import { db, movimientos_inventario, bodegas, productos, gastos, ventas_pos, items_venta_pos } from "@workspace/db";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

// GET /api/inventario — stock actual agrupado por producto + bodega
router.get("/", async (req, res) => {
  try {
    const stock = await db
      .select({
        producto_id: movimientos_inventario.producto_id,
        bodega_id: movimientos_inventario.bodega_id,
        producto_nombre: productos.nombre,
        producto_codigo: productos.codigo,
        bodega_nombre: bodegas.nombre,
        stock: sql<string>`
          SUM(
            CASE
              WHEN ${movimientos_inventario.tipo} = 'entrada' THEN ${movimientos_inventario.cantidad}
              WHEN ${movimientos_inventario.tipo} = 'salida'  THEN -${movimientos_inventario.cantidad}
              WHEN ${movimientos_inventario.tipo} = 'ajuste'  THEN ${movimientos_inventario.cantidad}
              ELSE 0
            END
          )
        `.mapWith(Number),
      })
      .from(movimientos_inventario)
      .innerJoin(productos, eq(movimientos_inventario.producto_id, productos.id))
      .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
      .where(eq(movimientos_inventario.tenant_id, req.tenantId))
      .groupBy(
        movimientos_inventario.producto_id,
        movimientos_inventario.bodega_id,
        productos.nombre,
        productos.codigo,
        bodegas.nombre,
      )
      .orderBy(productos.nombre, bodegas.nombre);

    res.json(stock);
  } catch (err) {
    console.error("Error en GET /inventario:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/inventario/kardex/:producto_id — movimientos cronológicos con saldo acumulado
router.get("/kardex/:producto_id", async (req, res) => {
  try {
    const { producto_id } = req.params;
    const { bodega_id } = req.query as { bodega_id?: string };

    const [producto] = await db
      .select({ id: productos.id, nombre: productos.nombre, codigo: productos.codigo })
      .from(productos)
      .where(and(eq(productos.id, producto_id), eq(productos.tenant_id, req.tenantId)))
      .limit(1);

    if (!producto) return res.status(404).json({ error: "Producto no encontrado." });

    const condicion = bodega_id
      ? and(
          eq(movimientos_inventario.tenant_id, req.tenantId),
          eq(movimientos_inventario.producto_id, producto_id),
          eq(movimientos_inventario.bodega_id, bodega_id),
        )
      : and(
          eq(movimientos_inventario.tenant_id, req.tenantId),
          eq(movimientos_inventario.producto_id, producto_id),
        );

    const movimientos = await db
      .select({
        id: movimientos_inventario.id,
        tipo: movimientos_inventario.tipo,
        cantidad: movimientos_inventario.cantidad,
        costo_unitario: movimientos_inventario.costo_unitario,
        referencia_tipo: movimientos_inventario.referencia_tipo,
        referencia_id: movimientos_inventario.referencia_id,
        observaciones: movimientos_inventario.observaciones,
        created_at: movimientos_inventario.created_at,
        bodega: { id: bodegas.id, nombre: bodegas.nombre },
      })
      .from(movimientos_inventario)
      .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
      .where(condicion)
      .orderBy(movimientos_inventario.created_at);

    // Calcular saldo acumulado
    let saldo = 0;
    const kardex = movimientos.map((m) => {
      const cant = Number(m.cantidad);
      const delta = m.tipo === "salida" ? -cant : cant;
      saldo += delta;
      return { ...m, delta, saldo_acumulado: saldo };
    });

    res.json({ producto, kardex });
  } catch (err) {
    console.error("Error en GET /inventario/kardex:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/inventario/movimientos — historial completo
router.get("/movimientos", async (req, res) => {
  try {
    const movimientos = await db
      .select({
        id: movimientos_inventario.id,
        tipo: movimientos_inventario.tipo,
        cantidad: movimientos_inventario.cantidad,
        costo_unitario: movimientos_inventario.costo_unitario,
        referencia_tipo: movimientos_inventario.referencia_tipo,
        referencia_id: movimientos_inventario.referencia_id,
        observaciones: movimientos_inventario.observaciones,
        created_at: movimientos_inventario.created_at,
        producto: { id: productos.id, nombre: productos.nombre, codigo: productos.codigo },
        bodega: { id: bodegas.id, nombre: bodegas.nombre },
      })
      .from(movimientos_inventario)
      .innerJoin(productos, eq(movimientos_inventario.producto_id, productos.id))
      .innerJoin(bodegas, eq(movimientos_inventario.bodega_id, bodegas.id))
      .where(eq(movimientos_inventario.tenant_id, req.tenantId))
      .orderBy(desc(movimientos_inventario.created_at))
      .limit(200);

    res.json(movimientos);
  } catch (err) {
    console.error("Error en GET /inventario/movimientos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/entrada
router.post("/entrada", async (req, res) => {
  try {
    const { bodega_id, producto_id, cantidad, costo_unitario, observaciones } = req.body;

    if (!bodega_id || !producto_id || !cantidad) {
      return res.status(400).json({ error: "Campos requeridos: bodega_id, producto_id, cantidad." });
    }

    if (Number(cantidad) <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor a cero." });
    }

    if (!(await assertPertenece(req.tenantId, bodega_id, producto_id, res))) return;

    const [nuevo] = await db
      .insert(movimientos_inventario)
      .values({
        tenant_id: req.tenantId,
        bodega_id,
        producto_id,
        tipo: "entrada",
        cantidad: String(cantidad),
        costo_unitario: costo_unitario != null ? String(costo_unitario) : null,
        referencia_tipo: "ajuste_manual",
        observaciones: observaciones ?? null,
      })
      .returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /inventario/entrada:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/salida
router.post("/salida", async (req, res) => {
  try {
    const { bodega_id, producto_id, cantidad, observaciones } = req.body;

    if (!bodega_id || !producto_id || !cantidad) {
      return res.status(400).json({ error: "Campos requeridos: bodega_id, producto_id, cantidad." });
    }

    if (Number(cantidad) <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor a cero." });
    }

    if (!(await assertPertenece(req.tenantId, bodega_id, producto_id, res))) return;

    const [nuevo] = await db
      .insert(movimientos_inventario)
      .values({
        tenant_id: req.tenantId,
        bodega_id,
        producto_id,
        tipo: "salida",
        cantidad: String(cantidad),
        referencia_tipo: "ajuste_manual",
        observaciones: observaciones ?? null,
      })
      .returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /inventario/salida:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/ajuste — cantidad puede ser negativa para reducir
router.post("/ajuste", async (req, res) => {
  try {
    const { bodega_id, producto_id, cantidad, observaciones } = req.body;

    if (!bodega_id || !producto_id || cantidad == null) {
      return res.status(400).json({ error: "Campos requeridos: bodega_id, producto_id, cantidad." });
    }

    if (!(await assertPertenece(req.tenantId, bodega_id, producto_id, res))) return;

    const [nuevo] = await db
      .insert(movimientos_inventario)
      .values({
        tenant_id: req.tenantId,
        bodega_id,
        producto_id,
        tipo: "ajuste",
        cantidad: String(cantidad),
        referencia_tipo: "ajuste_manual",
        observaciones: observaciones ?? null,
      })
      .returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /inventario/ajuste:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/inventario/recibir-lote
// Body: { bodega_id, items: [{producto_id, cantidad, precio_costo, nuevo_precio_venta?}],
//         proveedor_nombre?, fecha?, observaciones?, crear_gasto? }
router.post("/recibir-lote", async (req, res) => {
  try {
    const {
      bodega_id,
      items,
      proveedor_nombre,
      fecha,
      observaciones,
      crear_gasto = true,
    } = req.body as {
      bodega_id: string;
      items: { producto_id: string; cantidad: number; precio_costo: number; nuevo_precio_venta?: number }[];
      proveedor_nombre?: string;
      fecha?: string;
      observaciones?: string;
      crear_gasto?: boolean;
    };

    if (!bodega_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "bodega_id e items son requeridos." });
    }

    const [bodega] = await db
      .select({ id: bodegas.id })
      .from(bodegas)
      .where(and(eq(bodegas.id, bodega_id), eq(bodegas.tenant_id, req.tenantId)))
      .limit(1);
    if (!bodega) return res.status(404).json({ error: "Bodega no encontrada." });

    const fechaUso = fecha ?? new Date().toISOString().slice(0, 10);
    let totalCosto = 0;

    for (const item of items) {
      const { producto_id, cantidad, precio_costo, nuevo_precio_venta } = item;

      const [prod] = await db
        .select({ id: productos.id })
        .from(productos)
        .where(and(eq(productos.id, producto_id), eq(productos.tenant_id, req.tenantId)))
        .limit(1);
      if (!prod) return res.status(404).json({ error: `Producto ${producto_id} no encontrado.` });

      await db.insert(movimientos_inventario).values({
        tenant_id: req.tenantId,
        bodega_id,
        producto_id,
        tipo: "entrada",
        cantidad: String(cantidad),
        costo_unitario: String(precio_costo),
        referencia_tipo: "compra_proveedor",
        observaciones: proveedor_nombre ? `Compra a ${proveedor_nombre}` : (observaciones ?? null),
      });

      totalCosto += cantidad * precio_costo;

      if (nuevo_precio_venta != null && nuevo_precio_venta > 0) {
        await db
          .update(productos)
          .set({ precio_venta: String(nuevo_precio_venta), precio_base: String(nuevo_precio_venta) })
          .where(and(eq(productos.id, producto_id), eq(productos.tenant_id, req.tenantId)));
      }
    }

    let gastoId: string | null = null;
    if (crear_gasto && totalCosto > 0) {
      const desc = proveedor_nombre
        ? `Compra de mercancía — ${proveedor_nombre}`
        : "Compra de mercancía (recepción con IA)";
      const [nuevoGasto] = await db
        .insert(gastos)
        .values({
          tenant_id: req.tenantId,
          categoria: "compra_mercancia",
          descripcion: desc,
          monto: String(totalCosto),
          iva: "0",
          total: String(totalCosto),
          fecha: fechaUso,
          estado: "aprobado",
          observaciones: observaciones ?? null,
        })
        .returning({ id: gastos.id });
      gastoId = nuevoGasto.id;
    }

    return res.status(201).json({ ok: true, items_creados: items.length, total_costo: totalCosto, gasto_id: gastoId });
  } catch (err) {
    console.error("Error en POST /inventario/recibir-lote:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Verifica que la bodega y el producto pertenezcan al tenant
async function assertPertenece(
  tenantId: string,
  bodegaId: string,
  productoId: string,
  res: Response,
): Promise<boolean> {
  const [bodega] = await db
    .select({ id: bodegas.id })
    .from(bodegas)
    .where(and(eq(bodegas.id, bodegaId), eq(bodegas.tenant_id, tenantId)))
    .limit(1);

  if (!bodega) {
    res.status(404).json({ error: "Bodega no encontrada." });
    return false;
  }

  const [producto] = await db
    .select({ id: productos.id })
    .from(productos)
    .where(and(eq(productos.id, productoId), eq(productos.tenant_id, tenantId)))
    .limit(1);

  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado." });
    return false;
  }

  return true;
}

// ── Asesor de pedidos con IA ──────────────────────────────────────────────────
router.post("/consejo-pedido", async (req, res) => {
  const { presupuesto } = req.body as { presupuesto?: number };
  if (!presupuesto || presupuesto <= 0) {
    return res.status(400).json({ error: "Ingresa un presupuesto válido mayor a 0." });
  }

  try {
    // Productos activos del tenant
    const prods = await db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        codigo: productos.codigo,
        precio_base: productos.precio_base,
        precio_venta: productos.precio_venta,
        stock_actual: productos.stock_actual,
        unidad: productos.unidad,
      })
      .from(productos)
      .where(and(eq(productos.tenant_id, req.tenantId), eq(productos.activo, true)));

    // Ventas últimos 30 días (por tenant, no por bodega)
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ventasRecientes = await db
      .select({
        producto_id: items_venta_pos.producto_id,
        total_vendido: sql<string>`sum(${items_venta_pos.cantidad})`,
        ingresos: sql<string>`sum(${items_venta_pos.total})`,
      })
      .from(items_venta_pos)
      .innerJoin(ventas_pos, eq(items_venta_pos.venta_id, ventas_pos.id))
      .where(and(
        eq(ventas_pos.tenant_id, req.tenantId),
        eq(ventas_pos.estado, "completada"),
        gte(ventas_pos.created_at, hace30),
      ))
      .groupBy(items_venta_pos.producto_id);

    const ventasMap: Record<string, { total_vendido: number; ingresos: number }> = {};
    for (const v of ventasRecientes) {
      if (v.producto_id) ventasMap[v.producto_id] = {
        total_vendido: Number(v.total_vendido),
        ingresos: Number(v.ingresos),
      };
    }

    // Construir tabla de análisis
    const analisis = prods.map((p) => {
      const venta = ventasMap[p.id] ?? { total_vendido: 0, ingresos: 0 };
      const costo = Number(p.precio_base);
      const precioVenta = Number(p.precio_venta ?? p.precio_base);
      const margen = precioVenta > 0 ? ((precioVenta - costo) / precioVenta) * 100 : 0;
      return {
        nombre: p.nombre,
        codigo: p.codigo,
        stock_actual: Number(p.stock_actual ?? 0),
        unidad: p.unidad ?? "und",
        costo_unitario: costo,
        precio_venta: precioVenta,
        margen_pct: Math.round(margen),
        unidades_vendidas_30d: venta.total_vendido,
        ingresos_30d: venta.ingresos,
        rotacion: venta.total_vendido > 0 ? "alta" : "sin_ventas",
      };
    }).sort((a, b) => b.unidades_vendidas_30d - a.unidades_vendidas_30d);

    // Solo enviamos los primeros 50 a Claude para no exceder tokens
    const resumenProductos = analisis.slice(0, 50).map((p) =>
      `- ${p.nombre} (${p.codigo}): stock ${p.stock_actual} ${p.unidad}, costo $${p.costo_unitario.toLocaleString("es-CO")}, margen ${p.margen_pct}%, vendido ${p.unidades_vendidas_30d} ${p.unidad} en 30 días`
    ).join("\n");

    const prompt = `Eres un asesor de inventarios para tiendas de barrio y pequeños comercios colombianos.

DATOS DE LA TIENDA (últimos 30 días):
${resumenProductos}

PRESUPUESTO DISPONIBLE PARA PEDIDO: $${presupuesto.toLocaleString("es-CO")} COP

Analiza los datos y genera un consejo de pedido concreto. Responde ÚNICAMENTE con JSON válido con esta estructura:
{
  "resumen": "2-3 oraciones explicando la situación general del inventario",
  "alertas": ["producto que se está agotando", "otro alerta importante"],
  "recomendaciones": [
    {
      "producto": "nombre del producto",
      "cantidad_sugerida": número,
      "motivo": "razón breve",
      "costo_estimado": número en COP,
      "prioridad": "alta" | "media" | "baja"
    }
  ],
  "costo_total_sugerido": número en COP (debe ser <= presupuesto),
  "presupuesto_restante": número en COP,
  "consejo_general": "consejo práctico de 1-2 oraciones"
}

Reglas:
- No superes el presupuesto total
- Prioriza productos de alta rotación que estén bajos en stock
- Incluye mínimo 3 y máximo 10 productos en recomendaciones
- Si un producto tiene 0 ventas en 30 días, no lo incluyas salvo que sea esencial`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "La IA no generó una respuesta válida." });

    const consejo = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    // También devolvemos la tabla de análisis para que el frontend la pueda mostrar
    res.json({ consejo, analisis: analisis.slice(0, 30) });
  } catch (err) {
    console.error("[consejo-pedido]", err);
    res.status(500).json({ error: "Error al generar el consejo. Verifica la clave API." });
  }
});

export default router;
