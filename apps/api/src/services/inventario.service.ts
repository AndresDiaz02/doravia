import { db, bodegas, movimientos_inventario, componentes_producto, productos, asientos_contables, lineas_asiento, cuentas_contables } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Factura, ItemFactura } from "@workspace/db";

/**
 * Al aceptar una factura, registra automáticamente una salida de inventario
 * por cada ítem que tenga producto_id y genera el asiento de costo de ventas.
 * Usa la primera bodega activa del tenant.
 * Si no hay bodegas activas o ningún ítem tiene producto, no hace nada.
 */
export async function registrarSalidaFactura(
  tenantId: string,
  factura: Factura,
  items: ItemFactura[],
): Promise<void> {
  const itemsConProducto = items.filter((i) => i.producto_id != null);
  if (itemsConProducto.length === 0) return;

  const [bodega] = await db
    .select({ id: bodegas.id })
    .from(bodegas)
    .where(and(eq(bodegas.tenant_id, tenantId), eq(bodegas.activo, true)))
    .orderBy(bodegas.created_at)
    .limit(1);

  if (!bodega) return;

  // Cargar precio_base de cada producto para registrar costo unitario y asiento
  const productIds = [...new Set(itemsConProducto.map((i) => i.producto_id!))];
  const productosMap = new Map<string, string>(); // id → precio_base
  for (const pid of productIds) {
    const [p] = await db
      .select({ id: productos.id, precio_base: productos.precio_base })
      .from(productos)
      .where(eq(productos.id, pid))
      .limit(1);
    if (p) productosMap.set(p.id, p.precio_base);
  }

  type Movimiento = {
    tenant_id: string;
    bodega_id: string;
    producto_id: string;
    tipo: "salida";
    cantidad: string;
    costo_unitario?: string;
    referencia_tipo: string;
    referencia_id: string;
    observaciones: string;
  };
  const movimientos: Movimiento[] = [];
  let totalCostoVentas = 0;

  for (const item of itemsConProducto) {
    const componentes = await db
      .select()
      .from(componentes_producto)
      .where(and(
        eq(componentes_producto.producto_id, item.producto_id!),
        eq(componentes_producto.tenant_id, tenantId),
      ));

    if (componentes.length > 0) {
      for (const comp of componentes) {
        const cantidadTotal = Number(comp.cantidad) * Number(item.cantidad);
        const costoUnitario = productosMap.get(comp.componente_id);
        movimientos.push({
          tenant_id: tenantId,
          bodega_id: bodega.id,
          producto_id: comp.componente_id,
          tipo: "salida",
          cantidad: String(cantidadTotal),
          ...(costoUnitario ? { costo_unitario: costoUnitario } : {}),
          referencia_tipo: "factura",
          referencia_id: factura.id,
          observaciones: `Factura ${factura.numero} (ensamble)`,
        });
        if (costoUnitario) {
          totalCostoVentas += Number(costoUnitario) * cantidadTotal;
        }
      }
    } else {
      const costoUnitario = productosMap.get(item.producto_id!);
      movimientos.push({
        tenant_id: tenantId,
        bodega_id: bodega.id,
        producto_id: item.producto_id!,
        tipo: "salida",
        cantidad: item.cantidad,
        ...(costoUnitario ? { costo_unitario: costoUnitario } : {}),
        referencia_tipo: "factura",
        referencia_id: factura.id,
        observaciones: `Factura ${factura.numero}`,
      });
      if (costoUnitario) {
        totalCostoVentas += Number(costoUnitario) * Number(item.cantidad);
      }
    }
  }

  if (movimientos.length === 0) return;

  await db.transaction(async (tx) => {
    await tx.insert(movimientos_inventario).values(movimientos);

    // Asiento de costo de ventas: Déb 6135 → Cred 1435
    if (totalCostoVentas > 0) {
      const [cuentaCosto] = await tx
        .select({ id: cuentas_contables.id })
        .from(cuentas_contables)
        .where(and(eq(cuentas_contables.codigo, "6135"), eq(cuentas_contables.tenant_id, tenantId)))
        .limit(1);

      const [cuentaMercancia] = await tx
        .select({ id: cuentas_contables.id })
        .from(cuentas_contables)
        .where(and(eq(cuentas_contables.codigo, "1435"), eq(cuentas_contables.tenant_id, tenantId)))
        .limit(1);

      if (cuentaCosto && cuentaMercancia) {
        const costoStr = totalCostoVentas.toFixed(2);
        const [asiento] = await tx
          .insert(asientos_contables)
          .values({
            tenant_id: tenantId,
            numero: `CV-${factura.numero}`,
            fecha: new Date().toISOString().split("T")[0],
            descripcion: `Costo de ventas — Factura ${factura.numero}`,
            origen: "ajuste" as const,
          })
          .returning();

        await tx.insert(lineas_asiento).values([
          { asiento_id: asiento.id, cuenta_id: cuentaCosto.id,    debito: costoStr, credito: "0",       descripcion: `CV ${factura.numero}` },
          { asiento_id: asiento.id, cuenta_id: cuentaMercancia.id, debito: "0",      credito: costoStr, descripcion: `CV ${factura.numero}` },
        ]);
      }
    }
  });
}
