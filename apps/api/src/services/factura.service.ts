import { db, facturas, items_factura, resoluciones_dian, clientes, retenciones_factura } from "@workspace/db";
import type { ResolucionDian } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { assertCanEmitirFactura } from "../guards/plan-limits.js";
import { crearAsientoFactura } from "./contabilidad.service.js";
import { enviarFacturaDian } from "./dian.service.js";
import { registrarSalidaFactura } from "./inventario.service.js";
import { generarPdfFactura } from "./pdf.service.js";
import { enviarFacturaAceptada } from "./email.service.js";
import type { TenantWithPlan } from "../lib/tenant.js";

export interface ItemInput {
  producto_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct?: number;
  iva_pct?: number;
  unidad_medida?: string;
}

export interface RetencionInput {
  config_id?: string;
  nombre: string;
  tipo: "retefuente" | "reteiva" | "reteica";
  porcentaje: number;
  base: number;
}

export interface CrearFacturaInput {
  cliente_id: string;
  items: ItemInput[];
  retenciones?: RetencionInput[];
  fecha_vencimiento?: string;
  observaciones?: string;
  condicion_pago?: string;
  forma_pago?: string;
}

function calcularItem(item: ItemInput) {
  const cant = item.cantidad;
  const precio = item.precio_unitario;
  const descPct = item.descuento_pct ?? 0;
  const ivaPct = item.iva_pct ?? 19;

  const precioConDesc = precio * (1 - descPct / 100);
  const subtotal = Number((cant * precioConDesc).toFixed(2));
  const iva_valor = Number((subtotal * (ivaPct / 100)).toFixed(2));
  const total = Number((subtotal + iva_valor).toFixed(2));

  return { subtotal, iva_valor, total, iva_pct: ivaPct, descuento_pct: descPct };
}

export async function crearFactura(tenant: TenantWithPlan, input: CrearFacturaInput) {
  // Guard numérico — lanza PlanLimitError si se superó el límite del mes
  await assertCanEmitirFactura(tenant);

  // Validar items
  if (!input.items.length) throw new Error("Se requiere al menos un ítem.");
  for (const item of input.items) {
    if (!item.descripcion?.trim()) throw new Error("Cada ítem debe tener descripción.");
    if (Number(item.cantidad) <= 0) throw new Error("La cantidad de cada ítem debe ser mayor a cero.");
    if (Number(item.precio_unitario) <= 0) throw new Error("El precio unitario de cada ítem debe ser mayor a cero.");
    const desc = item.descuento_pct ?? 0;
    if (desc < 0 || desc > 100) throw new Error("El descuento debe estar entre 0 y 100.");
    const iva = item.iva_pct ?? 19;
    if (![0, 5, 19].includes(iva)) throw new Error("IVA debe ser 0, 5 o 19.");
  }

  // Validar fecha de vencimiento
  if (input.fecha_vencimiento) {
    const hoyStr = new Date().toISOString().slice(0, 10);
    if (input.fecha_vencimiento < hoyStr) {
      throw new Error("La fecha de vencimiento no puede ser anterior a hoy.");
    }
  }

  // Verificar que el cliente pertenece al tenant
  const [cliente] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, input.cliente_id), eq(clientes.tenant_id, tenant.id)))
    .limit(1);

  if (!cliente) throw new Error("Cliente no encontrado.");

  // Verificar que existe resolución activa ANTES de la transacción (falla rápido si no hay)
  const [resolucionPrev] = await db
    .select({ id: resoluciones_dian.id, numero_resolucion: resoluciones_dian.numero_resolucion,
              fecha_desde: resoluciones_dian.fecha_desde, fecha_hasta: resoluciones_dian.fecha_hasta })
    .from(resoluciones_dian)
    .where(and(eq(resoluciones_dian.tenant_id, tenant.id), eq(resoluciones_dian.activa, true)))
    .limit(1);

  if (!resolucionPrev) throw new Error("No hay una resolución DIAN activa. Configura tu resolución antes de emitir facturas.");

  const hoy = new Date();
  const fechaDesde = new Date(resolucionPrev.fecha_desde);
  const fechaHasta = new Date(resolucionPrev.fecha_hasta);
  if (hoy < fechaDesde || hoy > fechaHasta) {
    throw new Error(
      `La resolución DIAN ${resolucionPrev.numero_resolucion} no está vigente. ` +
      `Vigencia: ${resolucionPrev.fecha_desde} – ${resolucionPrev.fecha_hasta}.`
    );
  }

  // Calcular totales de items
  const itemsCalculados = input.items.map((item) => ({ ...item, ...calcularItem(item) }));
  const subtotal = Number(itemsCalculados.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
  const iva_total = Number(itemsCalculados.reduce((s, i) => s + i.iva_valor, 0).toFixed(2));
  const total = Number((subtotal + iva_total).toFixed(2));

  // Calcular retenciones
  const retencionesCalculadas = (input.retenciones ?? []).map((r) => ({
    ...r,
    valor: Number((r.base * r.porcentaje / 100).toFixed(2)),
  }));
  const total_retenciones = Number(retencionesCalculadas.reduce((s, r) => s + r.valor, 0).toFixed(2));
  const neto_a_pagar = Number((total - total_retenciones).toFixed(2));

  const fechaEmision = new Date();

  // Insertar factura + items + retenciones en una transacción atómica.
  // El consecutivo se lee con SELECT FOR UPDATE dentro de la transacción para
  // evitar la race condition donde dos requests concurrentes generan el mismo número.
  let resolucion!: ResolucionDian;
  const factura = await db.transaction(async (tx) => {
    // Lock de la fila de resolución — garantiza consecutivo único
    const [resolucionLocked] = await tx
      .select()
      .from(resoluciones_dian)
      .where(eq(resoluciones_dian.id, resolucionPrev.id))
      .for("update");

    if (!resolucionLocked) throw new Error("Resolución DIAN no encontrada.");
    if (resolucionLocked.consecutivo_actual > resolucionLocked.consecutivo_hasta) {
      throw new Error("La resolución DIAN ha agotado su rango de consecutivos. Solicita una nueva resolución.");
    }

    resolucion = resolucionLocked;
    const consecutivo = resolucionLocked.consecutivo_actual;
    const numero = `${resolucionLocked.prefijo}${String(consecutivo).padStart(4, "0")}`;

    const [f] = await tx
      .insert(facturas)
      .values({
        tenant_id: tenant.id,
        cliente_id: input.cliente_id,
        resolucion_id: resolucion.id,
        prefijo: resolucion.prefijo,
        consecutivo,
        numero,
        estado: "borrador",
        fecha_emision: fechaEmision,
        fecha_vencimiento: input.fecha_vencimiento ? new Date(input.fecha_vencimiento) : null,
        subtotal: String(subtotal),
        descuento_total: "0",
        iva_total: String(iva_total),
        total: String(total),
        total_retenciones: String(total_retenciones),
        neto_a_pagar: String(neto_a_pagar),
        condicion_pago: (input.condicion_pago ?? "contado") as "contado" | "credito",
        forma_pago: (input.forma_pago ?? "efectivo") as "efectivo" | "tarjeta_credito" | "tarjeta_debito" | "transferencia" | "cheque" | "otro",
        observaciones: input.observaciones ?? null,
      })
      .returning();

    await tx.insert(items_factura).values(
      itemsCalculados.map((item) => ({
        factura_id: f.id,
        producto_id: item.producto_id ?? null,
        descripcion: item.descripcion,
        cantidad: String(item.cantidad),
        precio_unitario: String(item.precio_unitario),
        descuento_pct: String(item.descuento_pct ?? 0),
        iva_pct: String(item.iva_pct ?? 19),
        unidad_medida: (item.unidad_medida ?? "UN") as "UN" | "KG" | "GR" | "LT" | "ML" | "MT" | "CM" | "M2" | "M3" | "HOR" | "DIA" | "MES" | "BOL" | "CJA" | "PAR" | "DOZ",
        subtotal: String(item.subtotal),
        iva_valor: String(item.iva_valor),
        total: String(item.total),
      }))
    );

    if (retencionesCalculadas.length > 0) {
      await tx.insert(retenciones_factura).values(
        retencionesCalculadas.map((r) => ({
          factura_id: f.id,
          config_id: r.config_id ?? null,
          nombre: r.nombre,
          tipo: r.tipo,
          porcentaje: String(r.porcentaje),
          base: String(r.base),
          valor: String(r.valor),
        }))
      );
    }

    // Incrementar consecutivo en la resolución
    await tx
      .update(resoluciones_dian)
      .set({ consecutivo_actual: consecutivo + 1 })
      .where(eq(resoluciones_dian.id, resolucion.id));

    return f;
  });

  // Enviar a DIAN fuera de la transacción DB — si falla, la factura queda en borrador
  try {
    const itemsParaDian = await db
      .select()
      .from(items_factura)
      .where(eq(items_factura.factura_id, factura.id));

    const respDian = await enviarFacturaDian({
      factura,
      cliente,
      items: itemsParaDian,
      tenant,
      resolucion: resolucion!,
    });

    if (respDian.aceptada) {
      // crearAsientoFactura falla si no hay cuentas PUC configuradas.
      // Esto NO debe impedir que la factura quede aceptada — la factura ya
      // fue validada por la DIAN. Se captura el error y se registra para
      // que el usuario pueda ver la advertencia sin perder la factura.
      let asientoId: string | null = null;
      let asientoError: string | null = null;
      try {
        asientoId = await crearAsientoFactura(tenant.id, factura);
      } catch (e) {
        asientoError = e instanceof Error ? e.message : "Error desconocido al crear asiento contable.";
        console.error(`[CONTABILIDAD] Asiento factura ${factura.numero} fallido:`, asientoError);
      }

      // Auto-descuento de inventario si el plan lo tiene activo
      const features = tenant.plan.features as Record<string, boolean>;
      if (features.inventario) {
        await registrarSalidaFactura(tenant.id, factura, itemsParaDian);
      }

      const [facturaFinal] = await db
        .update(facturas)
        .set({
          estado: "aceptada",
          cufe: respDian.cufe,
          qr_code: respDian.qr_code,
          xml_firmado: respDian.xml_firmado,
          asiento_id: asientoId,
        })
        .where(eq(facturas.id, factura.id))
        .returning();

      // Enviar PDF por email al cliente (best-effort, no bloquea la respuesta)
      if (cliente.correo) {
        const pdfStream = generarPdfFactura(facturaFinal, cliente, itemsParaDian, tenant);
        const chunks: Buffer[] = [];
        pdfStream.on("data", (c: Buffer) => chunks.push(c));
        pdfStream.on("end", () => {
          const pdfBuffer = Buffer.concat(chunks);
          void enviarFacturaAceptada(facturaFinal, cliente, tenant, pdfBuffer).catch(
            (e) => console.error("Email factura fallido:", e),
          );
        });
      }

      return { factura: facturaFinal, advertencias: asientoError ? [asientoError] : [] };
    } else {
      await db.update(facturas).set({ estado: "rechazada" }).where(eq(facturas.id, factura.id));
      throw new Error(`La DIAN rechazó la factura: ${respDian.mensaje}`);
    }
  } catch (err) {
    // Si falló el envío DIAN, la factura queda en borrador para reintento
    if (err instanceof Error && err.message.includes("La DIAN rechazó")) throw err;
    throw new Error(`Error al enviar a la DIAN. La factura ${factura.numero} quedó en borrador para reintento.`);
  }
}
