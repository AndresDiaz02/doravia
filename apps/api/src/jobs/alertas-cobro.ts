import cron from "node-cron";
import { db, facturas, clientes, tenants } from "@workspace/db";
import { eq, and, isNull, lt, inArray } from "drizzle-orm";
import { enviarAlertaCobro } from "../services/email.service.js";

async function procesarAlertasCobro() {
  const hoy = new Date();

  // Facturas aceptadas, sin pagar, vencidas
  const facturasvencidas = await db
    .select({
      id: facturas.id,
      numero: facturas.numero,
      total: facturas.total,
      fecha_vencimiento: facturas.fecha_vencimiento,
      cliente_id: facturas.cliente_id,
      tenant_id: facturas.tenant_id,
    })
    .from(facturas)
    .where(
      and(
        eq(facturas.estado, "aceptada"),
        isNull(facturas.pagada_at),
        lt(facturas.fecha_vencimiento, hoy),
      )
    );

  if (facturasvencidas.length === 0) return;

  // Agrupar por tenant → cliente
  const grupos: Record<string, Record<string, typeof facturasvencidas>> = {};
  for (const f of facturasvencidas) {
    if (!grupos[f.tenant_id]) grupos[f.tenant_id] = {};
    if (!grupos[f.tenant_id][f.cliente_id]) grupos[f.tenant_id][f.cliente_id] = [];
    grupos[f.tenant_id][f.cliente_id].push(f);
  }

  for (const [tenantId, porCliente] of Object.entries(grupos)) {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, tenantId), eq(tenants.activo, true)))
      .limit(1);

    if (!tenant) continue;

    for (const [clienteId, facts] of Object.entries(porCliente)) {
      const [cliente] = await db
        .select()
        .from(clientes)
        .where(eq(clientes.id, clienteId))
        .limit(1);

      if (!cliente?.correo) continue;

      const facturasConDias = facts.map((f) => {
        const venc = f.fecha_vencimiento ? new Date(f.fecha_vencimiento) : hoy;
        const dias = Math.floor((hoy.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
        return {
          numero: f.numero,
          total: f.total,
          dias_vencida: Math.max(0, dias),
          fecha_vencimiento: venc.toISOString(),
        };
      });

      try {
        await enviarAlertaCobro(facturasConDias, cliente, tenant);
        console.log(`[alertas-cobro] Email enviado a ${cliente.correo} (${facturasConDias.length} facturas)`);
      } catch (err) {
        console.error(`[alertas-cobro] Error enviando a ${cliente.correo}:`, err);
      }
    }
  }
}

// Ejecuta lunes, miércoles y viernes a las 08:00
export function iniciarCronAlertasCobro() {
  cron.schedule("0 8 * * 1,3,5", () => {
    void procesarAlertasCobro();
  });
  console.log("[alertas-cobro] Cron job programado — lunes, miércoles y viernes 08:00");
}
