import { Router } from "express";
import crypto from "node:crypto";
import { db, plans, tenants } from "@workspace/db";
import { completarRegistroPendiente } from "../services/auth.service.js";
import { eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";

const router = Router();

const WOMPI_PUB_KEY = process.env.WOMPI_PUB_KEY ?? "";
const WOMPI_PRV_KEY = process.env.WOMPI_PRV_KEY ?? "";
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET ?? "";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

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

    // Wompi: referencia única por tenant+plan+timestamp
    const referencia = `DOR-${req.tenantId.slice(0, 8)}-${plan_slug}-${Date.now()}`;
    const monto_centavos = plan.precio_anual_cop * 100; // Wompi usa centavos
    const moneda = "COP";
    const redirect_url = `${APP_URL}/pago/resultado`;

    // Firma de integridad: SHA256(referencia + monto + moneda + PRV_KEY)
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
    });
  } catch (err) {
    console.error("Error en POST /pagos/checkout:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/pagos/webhook  (sin authenticate — viene de Wompi)
// Wompi envía eventos cuando una transacción cambia de estado
router.post("/webhook", async (req, res) => {
  try {
    // Validar firma del webhook
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

    if (WOMPI_EVENTS_SECRET) {
      const { checksum, properties } = event.signature;
      const props = properties as string[];
      // Wompi firma: SHA256(prop1Value + prop2Value + ... + timestamp + events_secret)
      const eventData = event.data as Record<string, unknown>;
      const cadena = props
        .map((p) => {
          const keys = p.split(".");
          let val: unknown = eventData;
          for (const k of keys) val = (val as Record<string, unknown>)?.[k];
          return String(val ?? "");
        })
        .join("")
        + String(event.timestamp)
        + WOMPI_EVENTS_SECRET;

      const expected = crypto.createHash("sha256").update(cadena).digest("hex");
      if (expected !== checksum) {
        return res.status(401).json({ error: "Firma inválida." });
      }
    }

    // Solo procesar transacciones aprobadas
    if (event.event !== "transaction.updated") return res.sendStatus(200);
    if (event.data.transaction.status !== "APPROVED") return res.sendStatus(200);

    const ref = event.data.transaction.reference;

    // ── Registro de nueva empresa pendiente de pago ────────────────────────
    if (ref.startsWith("DOR-REG-")) {
      try {
        await completarRegistroPendiente(ref);
        console.log(`Registro completado para referencia ${ref}`);
      } catch (err) {
        console.error(`Error completando registro pendiente ${ref}:`, err);
      }
      return res.sendStatus(200);
    }
    // Formato: DOR-{tenantId8}-{planSlug}-{timestamp}
    const partes = ref.split("-");
    if (partes.length < 3 || partes[0] !== "DOR") return res.sendStatus(200);

    const tenantIdPrefix = partes[1];
    const planSlug = partes.slice(2, partes.length - 1).join("-"); // manejo guiones en slug

    const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
    if (!plan) return res.sendStatus(200);

    // Encontrar el tenant por prefijo de ID
    const allTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .limit(500);

    const tenant = allTenants.find((t) => t.id.replace(/-/g, "").slice(0, 8) === tenantIdPrefix);
    if (!tenant) {
      console.error(`Wompi webhook: tenant no encontrado para referencia ${ref}`);
      return res.sendStatus(200);
    }

    const hoy = new Date();
    const unAnio = new Date(hoy);
    unAnio.setFullYear(unAnio.getFullYear() + 1);

    const POS_PLANS = ["punto", "punto_plus"];

    if (POS_PLANS.includes(planSlug)) {
      // Plan POS: activa el addon sin tocar el plan ERP del tenant
      const [current] = await db
        .select({ addons: tenants.addons })
        .from(tenants)
        .where(eq(tenants.id, tenant.id));
      const addons: Record<string, boolean> = {
        ...((current?.addons ?? {}) as Record<string, boolean>),
        pos: true,
        ...(planSlug === "punto_plus" ? { pos_multi_caja: true } : {}),
      };
      await db.update(tenants).set({ addons }).where(eq(tenants.id, tenant.id));
      console.log(`POS addon activado (${planSlug}) para tenant ${tenant.id}`);
    } else {
      await db
        .update(tenants)
        .set({
          plan_id: plan.id,
          plan_starts_at: hoy,
          plan_ends_at: unAnio,
          activo: true,
        })
        .where(eq(tenants.id, tenant.id));
      console.log(`Plan ${planSlug} activado para tenant ${tenant.id} hasta ${unAnio.toISOString()}`);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error en POST /pagos/webhook:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export { router as pagosRouter };
export default router;
