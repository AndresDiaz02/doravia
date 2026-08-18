import { Router } from "express";
import crypto from "node:crypto";
import { db, plans, tenants, wompi_events, user_accesos, comisiones_contador, pool_documentos_nomina_tenant, product_subscriptions } from "@workspace/db";
import { completarRegistroPendiente } from "../services/auth.service.js";
import { eq, sql, and, gte } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { activarSuscripcionProducto } from "../services/product-subscription.service.js";

const router = Router();

const WOMPI_PUB_KEY = process.env.WOMPI_PUB_KEY ?? "";
const WOMPI_PRV_KEY = process.env.WOMPI_PRV_KEY ?? "";
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET ?? "";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const IS_PROD = process.env.NODE_ENV === "production";

function descuentoPaquete(productoNuevo: string, productosActivos: Set<string>) {
  const productos = new Set(productosActivos);
  productos.add(productoNuevo);
  if (productos.has("erp") && productos.has("pos") && productos.has("nomina")) return 15;
  if ((productos.has("erp") && productos.has("nomina")) || (productos.has("pos") && productos.has("facturacion"))) return 10;
  return 0;
}

// POST /api/pagos/checkout
// Genera los parámetros necesarios para el widget de Wompi (modo redirect)
router.post("/checkout", authenticate, async (req, res) => {
  try {
    const { plan_slug } = req.body as { plan_slug?: string };
    if (!plan_slug) return res.status(400).json({ error: "plan_slug es requerido." });

    const [plan] = await db.select().from(plans).where(eq(plans.slug, plan_slug)).limit(1);
    if (!plan) return res.status(404).json({ error: "Plan no encontrado." });
    if (plan.precio_anual_cop === 0) {
      return res.status(400).json({ error: "El plan Origen es gratuito, no requiere pago." });
    }

    // Protección de downgrade: solo se permiten upgrades o renovaciones del mismo plan
    if (plan.product !== "pos" && plan.product !== "nomina" && plan.product !== "origen") {
      const precioActual = req.tenant.plan.precio_anual_cop;
      if (plan.precio_anual_cop < precioActual) {
        return res.status(403).json({
          error: "Para cambiar a un plan de menor precio debes comunicarte con nuestro equipo. Escríbenos a soporte@doraviasoft.com.",
          code: "PLAN_DOWNGRADE_NOT_ALLOWED",
        });
      }
    }

    // Referencia única — incluye los primeros 8 chars del UUID (ya son suficientemente únicos)
    const suscripciones = await db.select({ product: product_subscriptions.product }).from(product_subscriptions)
      .where(and(eq(product_subscriptions.tenant_id, req.tenantId), eq(product_subscriptions.status, "active"), gte(product_subscriptions.ends_at, new Date())));
    const descuento_pct = descuentoPaquete(plan.product, new Set(suscripciones.map((s) => s.product)));
    const precio_final_cop = Math.round(plan.precio_anual_cop * (1 - descuento_pct / 100));
    const referencia = `DOR-${req.tenantId.slice(0, 8)}-${plan_slug}-${Date.now()}`;
    const monto_centavos = precio_final_cop * 100;
    const moneda = "COP";
    const redirect_url = `${APP_URL}/pago/resultado`;

    const cadena = `${referencia}${monto_centavos}${moneda}${WOMPI_PRV_KEY}`;
    const firma = crypto.createHash("sha256").update(cadena).digest("hex");

    return res.json({
      public_key: WOMPI_PUB_KEY,
      currency: moneda,
      amount_in_cents: monto_centavos,
      reference: referencia,
      signature: { integrity: firma },
      redirect_url,
      plan_slug,
      plan_nombre: plan.nombre,
      plan_precio_cop: plan.precio_anual_cop,
      descuento_pct,
      precio_final_cop,
    });
  } catch (err) {
    console.error("Error en POST /pagos/checkout:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/pagos/webhook  (sin authenticate — viene de Wompi)
router.post("/webhook", async (req, res) => {
  try {
    // En producciÃ³n un webhook sin secreto no es una degradaciÃ³n aceptable: podrÃ­a
    // activar suscripciones a partir de eventos no verificables.
    if (IS_PROD && !WOMPI_EVENTS_SECRET) {
      console.error("[Wompi] WEBHOOK rechazado: WOMPI_EVENTS_SECRET no estÃ¡ configurado.");
      return res.status(503).json({ error: "Webhook de pagos no configurado de forma segura." });
    }

    const event = req.body as {
      event: string;
      data: {
        transaction: {
          id: string;
          reference: string;
          status: string;
          amount_in_cents: number;
        };
      };
      sent_at: string;
      timestamp: number;
      signature: { checksum: string; properties: string[] };
    };

    // ── Validar firma del webhook ──────────────────────────────────────────────
    if (WOMPI_EVENTS_SECRET) {
      const { checksum, properties } = event.signature;
      const eventData = event.data as Record<string, unknown>;
      const cadena = (properties as string[])
        .map((p) => {
          const keys = p.split(".");
          let val: unknown = eventData;
          for (const k of keys) val = (val as Record<string, unknown>)?.[k];
          return String(val ?? "");
        })
        .join("") + String(event.timestamp) + WOMPI_EVENTS_SECRET;

      const expected = crypto.createHash("sha256").update(cadena).digest("hex");
      if (expected !== checksum) {
        return res.status(401).json({ error: "Firma inválida." });
      }
    }

    if (event.event !== "transaction.updated") return res.sendStatus(200);
    if (event.data.transaction.status !== "APPROVED") return res.sendStatus(200);

    const wompiTxId = event.data.transaction.id;
    const ref = event.data.transaction.reference;

    // ── Idempotencia: ignorar si ya fue procesado ──────────────────────────────
    try {
      await db.insert(wompi_events).values({ wompi_tx_id: wompiTxId, reference: ref });
    } catch {
      // Conflicto en PK = ya procesado. Retornar 200 sin hacer nada.
      console.log(`Wompi webhook duplicado ignorado: ${wompiTxId}`);
      return res.sendStatus(200);
    }

    // ── Registro de nueva empresa ──────────────────────────────────────────────
    if (ref.startsWith("DOR-REG-")) {
      try {
        const resultado = await completarRegistroPendiente(ref);
        console.log(`Registro completado: ${ref}`);
        // Generar comisión venta inicial si tiene contador asociado
        if (resultado?.tenantId && resultado?.planPrecio) {
          void generarComisionContador(resultado.tenantId, resultado.planPrecio, "venta_inicial").catch((e) =>
            console.error("Error generando comisión inicial:", e),
          );
        }
      } catch (err) {
        console.error(`Error completando registro pendiente ${ref}:`, err);
      }
      return res.sendStatus(200);
    }

    // ── Upgrade / renovación de plan existente ────────────────────────────────
    // Formato: DOR-{tenantId[0..7]}-{planSlug}-{timestamp}
    const partes = ref.split("-");
    if (partes.length < 4 || partes[0] !== "DOR") return res.sendStatus(200);

    const tenantIdPrefix = partes[1]; // primeros 8 chars del UUID (antes del primer guion)
    const planSlug = partes.slice(2, partes.length - 1).join("-");

    const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
    if (!plan) return res.sendStatus(200);

    // Lookup del tenant via SQL: LEFT(id::text, 8) = primeros 8 chars del UUID
    const [tenant] = await db
      .select({ id: tenants.id, plan_ends_at: tenants.plan_ends_at, addons: tenants.addons })
      .from(tenants)
      .where(sql`LEFT(${tenants.id}::text, 8) = ${tenantIdPrefix}`)
      .limit(1);

    if (!tenant) {
      console.error(`Wompi webhook: tenant no encontrado para ref ${ref} (prefix: ${tenantIdPrefix})`);
      return res.sendStatus(200);
    }

    const hoy = new Date();
    const planFeatures = plan.features as Record<string, boolean>;

    if (plan.product === "pos") {
      const addons: Record<string, boolean> = {
        ...((tenant.addons ?? {}) as Record<string, boolean>),
        pos: true,
        ...(planFeatures.pos_multi_caja ? { pos_multi_caja: true } : {}),
      };
      await db.update(tenants).set({ addons }).where(eq(tenants.id, tenant.id));
      await activarSuscripcionProducto(tenant.id, planSlug);
      console.log(`POS addon activado (${planSlug}) para tenant ${tenant.id}`);
    } else if (plan.product === "origen") {
      // Facturación Electrónica es un producto independiente: no sustituye ERP ni POS.
      await activarSuscripcionProducto(tenant.id, planSlug);
      console.log(`Facturación Electrónica activada (${planSlug}) para tenant ${tenant.id}`);
    } else if (plan.product === "nomina") {
      // Nómina es una suscripción independiente: no reemplaza el plan ERP, POS
      // u Origen de la empresa. Todos los productos comparten el mismo tenant.
      const documentosIncluidos = plan.document_limit ?? 999_999;
      const fechaRenovacion = new Date(hoy);
      fechaRenovacion.setFullYear(fechaRenovacion.getFullYear() + 1);

      await activarSuscripcionProducto(tenant.id, planSlug);

      await db.insert(pool_documentos_nomina_tenant)
        .values({
          tenant_id: tenant.id,
          plan_slug: planSlug,
          documentos_incluidos: documentosIncluidos,
          fecha_renovacion: fechaRenovacion.toISOString().slice(0, 10),
          limite_acumulacion: documentosIncluidos * 2,
        })
        .onConflictDoUpdate({
          target: pool_documentos_nomina_tenant.tenant_id,
          set: {
            plan_slug: planSlug,
            documentos_incluidos: documentosIncluidos,
            fecha_renovacion: fechaRenovacion.toISOString().slice(0, 10),
            limite_acumulacion: documentosIncluidos * 2,
            updated_at: new Date(),
          },
        });
      console.log(`Nómina independiente activada (${planSlug}) para tenant ${tenant.id}`);
    } else {
      // Si ya tiene plan vigente, extender desde su fecha de vencimiento (no perder días)
      const inicioActual = new Date(tenant.plan_ends_at ?? hoy);
      const inicio = inicioActual > hoy ? inicioActual : hoy;
      const fin = new Date(inicio);
      fin.setFullYear(fin.getFullYear() + 1);

      await db.update(tenants).set({
        plan_id: plan.id,
        plan_starts_at: inicio,
        plan_ends_at: fin,
        activo: true,
        ultimo_pago_confirmado_at: hoy,
      }).where(eq(tenants.id, tenant.id));
      await activarSuscripcionProducto(tenant.id, planSlug);

      console.log(`Plan ${planSlug} activado para tenant ${tenant.id} → ${fin.toISOString()}`);

      // Generar comisión para el contador asociado (si tiene uno con rol contador)
      void generarComisionContador(tenant.id, plan.precio_anual_cop, "renovacion").catch((e) =>
        console.error("Error generando comisión contador:", e),
      );
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error en POST /pagos/webhook:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Busca el contador asociado a un tenant y genera su comisión al 15%
async function generarComisionContador(
  tenantId: string,
  planPrecio: number,
  tipo: "venta_inicial" | "renovacion",
): Promise<void> {
  if (!planPrecio) return;

  const [acceso] = await db
    .select({ user_id: user_accesos.user_id })
    .from(user_accesos)
    .where(and(eq(user_accesos.tenant_id, tenantId), eq(user_accesos.role, "contador")))
    .limit(1);

  if (!acceso) return; // empresa sin contador asignado

  const PORCENTAJE = 15;
  const valor_cop = Math.round(planPrecio * PORCENTAJE / 100);

  await db.insert(comisiones_contador).values({
    contador_user_id: acceso.user_id,
    tenant_id: tenantId,
    tipo,
    porcentaje: String(PORCENTAJE),
    base_cop: planPrecio,
    valor_cop,
    pagada: false,
  });

  console.log(`Comisión ${tipo} generada: $${valor_cop} COP para contador ${acceso.user_id} (tenant ${tenantId})`);
}

export { router as pagosRouter };
export default router;
