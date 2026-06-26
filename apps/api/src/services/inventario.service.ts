import { db, bodegas, movimientos_inventario, componentes_producto } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Factura, ItemFactura } from "@workspace/db";

/**
 * Al aceptar una factura, registra automáticamente una salida de inventario
 * por cada ítem que tenga producto_id. Usa la primera bodega activa del tenant.
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

  const movimientos: {
    tenant_id: string;
    bodega_id: string;
    producto_id: string;
    tipo: "salida";
    cantidad: string;
    referencia_tipo: string;
    referencia_id: string;
    observaciones: string;
  }[] = [];

  for (const item of itemsConProducto) {
    // Verificar si el producto tiene receta de ensamble
    const componentes = await db
      .select()
      .from(componentes_producto)
      .where(
        and(
          eq(componentes_producto.producto_id, item.producto_id!),
          eq(componentes_producto.tenant_id, tenantId),
        )
      );

    if (componentes.length > 0) {
      // Producto ensamblado: descontar sus componentes en proporción a la cantidad vendida
      for (const comp of componentes) {
        movimientos.push({
          tenant_id: tenantId,
          bodega_id: bodega.id,
          producto_id: comp.componente_id,
          tipo: "salida",
          cantidad: String(Number(comp.cantidad) * Number(item.cantidad)),
          referencia_tipo: "factura",
          referencia_id: factura.id,
          observaciones: `Factura ${factura.numero} (ensamble)`,
        });
      }
    } else {
      // Producto simple: descontar directamente
      movimientos.push({
        tenant_id: tenantId,
        bodega_id: bodega.id,
        producto_id: item.producto_id!,
        tipo: "salida",
        cantidad: item.cantidad,
        referencia_tipo: "factura",
        referencia_id: factura.id,
        observaciones: `Factura ${factura.numero}`,
      });
    }
  }

  if (movimientos.length > 0) {
    await db.insert(movimientos_inventario).values(movimientos);
  }
}
