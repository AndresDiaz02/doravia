import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  db, tenants, users, plans, plan_features, refresh_tokens, facturas,
  user_accesos, gastos_internos, comisiones_contador,
  retencion_seguimiento, leads_doravia, pending_registrations,
} from "@workspace/db";
import { eq, and, gte, lte, max, count, desc, sql, notInArray, inArray, isNull } from "drizzle-orm";

const router = Router();

// POST /api/fundador/verify-pin — valida el PIN de acceso al panel
// Si FUNDADOR_PIN no está configurado, devuelve ok sin verificar (PIN desactivado)
router.post("/verify-pin", (req, res) => {
  const { pin } = req.body as { pin?: string };
  const fundadorPin = process.env.FUNDADOR_PIN;
  if (!fundadorPin) return res.json({ ok: true });
  if (pin === fundadorPin) return res.json({ ok: true });
  return res.status(403).json({ error: "PIN incorrecto." });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcularRiesgo(d: {
  diasSinLogin: number | null;
  facturasUlt30: number;
  diasPlanVence: number | null;
  onboardingCompletado: boolean;
}): { score: number; nivel: "bajo" | "medio" | "alto" } {
  let score = 0;
  const dias = d.diasSinLogin ?? 999;
  if (dias > 60) score += 40;
  else if (dias > 30) score += 25;
  else if (dias > 14) score += 10;

  if (d.facturasUlt30 === 0) score += 30;
  else if (d.facturasUlt30 < 3) score += 10;

  const vence = d.diasPlanVence ?? -1;
  if (vence < 0) score += 30;
  else if (vence < 15) score += 25;
  else if (vence < 30) score += 15;
  else if (vence < 60) score += 5;

  if (!d.onboardingCompletado) score += 20;
  score = Math.min(score, 100);
  return { score, nivel: score >= 60 ? "alto" : score >= 30 ? "medio" : "bajo" };
}

function anualizar(gastos: { monto_cop: number; frecuencia: string; activo: boolean }[]): number {
  return gastos
    .filter((g) => g.activo)
    .reduce((s, g) => s + (g.frecuencia === "mensual" ? g.monto_cop * 12 : g.monto_cop), 0);
}

// IDs de tenants del sistema que no deben aparecer en el panel fundador
async function getSistemaTenantIds(): Promise<string[]> {
  // Hub Contadores siempre excluido por NIT
  const [hub] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.nit, "0000000001")).limit(1);
  const ids: string[] = [];
  if (hub) ids.push(hub.id);

  // El tenant del fundador se identifica por FUNDADOR_EMAILS
  const fundadorEmails = (process.env.FUNDADOR_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (fundadorEmails.length > 0) {
    const fundadores = await db
      .select({ tenant_id: users.tenant_id })
      .from(users)
      .where(inArray(users.email, fundadorEmails));
    for (const u of fundadores) {
      if (u.tenant_id && !ids.includes(u.tenant_id)) ids.push(u.tenant_id);
    }
  }
  return ids;
}

// Datos de actividad compartidos entre endpoints
async function getActividadMaps() {
  const ultimosLogin = await db
    .select({ tenant_id: refresh_tokens.tenant_id, ultimo: max(refresh_tokens.created_at) })
    .from(refresh_tokens)
    .groupBy(refresh_tokens.tenant_id);
  const loginMap = new Map(ultimosLogin.map((r) => [r.tenant_id, r.ultimo]));

  const hace30 = new Date(Date.now() - 30 * 86400000);
  const factUlt30 = await db
    .select({ tenant_id: facturas.tenant_id, total: count() })
    .from(facturas)
    .where(gte(facturas.created_at, hace30))
    .groupBy(facturas.tenant_id);
  const factMap = new Map(factUlt30.map((r) => [r.tenant_id, Number(r.total)]));

  const factTotal = await db
    .select({ tenant_id: facturas.tenant_id, total: count() })
    .from(facturas)
    .groupBy(facturas.tenant_id);
  const factTotalMap = new Map(factTotal.map((r) => [r.tenant_id, Number(r.total)]));

  return { loginMap, factMap, factTotalMap };
}

// ── GET /api/fundador/metricas ────────────────────────────────────────────────

router.get("/metricas", async (_req, res, next) => {
  try {
    const excluir = await getSistemaTenantIds();
    const empresaRows = await db
      .select({
        id: tenants.id,
        activo: tenants.activo,
        precio_anual: plans.precio_anual_cop,
        plan_ends_at: tenants.plan_ends_at,
        plan_starts_at: tenants.plan_starts_at,
        created_at: tenants.created_at,
        onboarding_completado: tenants.onboarding_completado,
        cac_cop: tenants.cac_cop,
        ultimo_pago_confirmado_at: tenants.ultimo_pago_confirmado_at,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .where(excluir.length ? notInArray(tenants.id, excluir) : undefined);

    const activas = empresaRows.filter((e) => e.activo);
    const arr = activas.reduce((s, e) => s + (e.precio_anual ?? 0), 0);
    const mrr = Math.round(arr / 12);
    const acv = activas.length > 0 ? Math.round(arr / activas.length) : 0;

    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const nuevasMes = empresaRows.filter((e) => new Date(e.created_at) >= inicioMes);
    const mrrNuevo = Math.round(nuevasMes.reduce((s, e) => s + (e.precio_anual ?? 0) / 12, 0));

    const hace60 = new Date(Date.now() - 60 * 86400000);
    const churned = empresaRows.filter(
      (e) => !e.activo && new Date(e.plan_ends_at) >= hace60,
    );
    const mrrChurned = Math.round(churned.reduce((s, e) => s + (e.precio_anual ?? 0) / 12, 0));

    const mesConf = new Date(); mesConf.setDate(1); mesConf.setHours(0, 0, 0, 0);
    const confirmados = activas.filter(
      (e) => e.ultimo_pago_confirmado_at && new Date(e.ultimo_pago_confirmado_at) >= mesConf,
    );
    const revenueConfirmado = Math.round(
      confirmados.reduce((s, e) => s + (e.precio_anual ?? 0) / 12, 0),
    );

    const vencenPronto = activas.filter((e) => {
      const d = (new Date(e.plan_ends_at).getTime() - Date.now()) / 86400000;
      return d < 30;
    }).length;

    const gastosRows = await db.select().from(gastos_internos);
    const gastosAnuales = anualizar(gastosRows);

    const { loginMap, factMap } = await getActividadMaps();
    let riesgoAlto = 0; let riesgoMedio = 0;
    const cacValues = activas.filter((e) => e.cac_cop).map((e) => e.cac_cop!);
    const cacPromedio = cacValues.length > 0
      ? Math.round(cacValues.reduce((s, v) => s + v, 0) / cacValues.length)
      : null;

    for (const e of activas) {
      const ul = loginMap.get(e.id);
      const diasSinLogin = ul ? Math.floor((Date.now() - new Date(ul).getTime()) / 86400000) : null;
      const diasPlanVence = Math.floor((new Date(e.plan_ends_at).getTime() - Date.now()) / 86400000);
      const { nivel } = calcularRiesgo({ diasSinLogin, facturasUlt30: factMap.get(e.id) ?? 0, diasPlanVence, onboardingCompletado: e.onboarding_completado });
      if (nivel === "alto") riesgoAlto++;
      else if (nivel === "medio") riesgoMedio++;
    }

    const ltv = acv > 0 ? Math.round(acv * 3) : null; // 3 años promedio estimado

    res.json({
      arr, mrr, acv, ltv_estimado: ltv,
      mrr_nuevo: mrrNuevo,
      mrr_churned_aprox: mrrChurned,
      mrr_neto: mrrNuevo - mrrChurned,
      revenue_confirmado_mes: revenueConfirmado,
      revenue_pendiente_mes: mrr - revenueConfirmado,
      cac_promedio: cacPromedio,
      payback_meses: cacPromedio && mrr > 0 && activas.length > 0
        ? Math.round(cacPromedio / (mrr / activas.length))
        : null,
      total_empresas: empresaRows.length,
      empresas_activas: activas.length,
      nuevas_este_mes: nuevasMes.length,
      vencen_pronto: vencenPronto,
      gastos_anuales: gastosAnuales,
      ganancia_estimada: arr - gastosAnuales,
      empresas_riesgo_alto: riesgoAlto,
      empresas_riesgo_medio: riesgoMedio,
    });
  } catch (err) { next(err); }
});

// ── GET /api/fundador/empresas ────────────────────────────────────────────────

router.get("/empresas", async (_req, res, next) => {
  try {
    const excluir = await getSistemaTenantIds();
    const rows = await db
      .select({
        id: tenants.id, nombre: tenants.nombre, nit: tenants.nit,
        activo: tenants.activo, correo: tenants.correo, telefono: tenants.telefono,
        ciudad: tenants.ciudad, created_at: tenants.created_at,
        plan_starts_at: tenants.plan_starts_at, plan_ends_at: tenants.plan_ends_at,
        onboarding_completado: tenants.onboarding_completado,
        fuente_adquisicion: tenants.fuente_adquisicion,
        cac_cop: tenants.cac_cop,
        ultimo_pago_confirmado_at: tenants.ultimo_pago_confirmado_at,
        plan_nombre: plans.nombre, precio_anual: plans.precio_anual_cop,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .where(excluir.length ? notInArray(tenants.id, excluir) : undefined)
      .orderBy(tenants.nombre);

    const { loginMap, factMap, factTotalMap } = await getActividadMaps();

    const resultado = rows.map((e) => {
      const ul = loginMap.get(e.id);
      const diasSinLogin = ul ? Math.floor((Date.now() - new Date(ul).getTime()) / 86400000) : null;
      const diasPlanVence = Math.floor((new Date(e.plan_ends_at).getTime() - Date.now()) / 86400000);
      const facturasUlt30 = factMap.get(e.id) ?? 0;
      const { score, nivel } = calcularRiesgo({ diasSinLogin, facturasUlt30, diasPlanVence, onboardingCompletado: e.onboarding_completado });
      return {
        ...e,
        ultimo_login: ul ?? null, dias_sin_login: diasSinLogin,
        facturas_ult30: facturasUlt30, facturas_total: factTotalMap.get(e.id) ?? 0,
        dias_plan_vence: diasPlanVence, riesgo_score: score, riesgo_nivel: nivel,
        ltv_estimado: e.precio_anual ? e.precio_anual * 3 : null,
      };
    });

    resultado.sort((a, b) => b.riesgo_score - a.riesgo_score);
    res.json(resultado);
  } catch (err) { next(err); }
});

// ── PATCH /api/fundador/empresas/:id/meta ─────────────────────────────────────

router.patch("/empresas/:id/meta", async (req, res, next) => {
  try {
    const { fuente_adquisicion, cac_cop } = req.body as { fuente_adquisicion?: string; cac_cop?: number };
    const [t] = await db
      .update(tenants)
      .set({
        ...(fuente_adquisicion !== undefined && { fuente_adquisicion }),
        ...(cac_cop !== undefined && { cac_cop }),
      })
      .where(eq(tenants.id, req.params.id))
      .returning({ id: tenants.id });
    if (!t) { res.status(404).json({ error: "Empresa no encontrada." }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /api/fundador/empresas/:id/confirmar-pago ───────────────────────────

router.patch("/empresas/:id/confirmar-pago", async (req, res, next) => {
  try {
    const [t] = await db
      .update(tenants)
      .set({ ultimo_pago_confirmado_at: new Date() })
      .where(eq(tenants.id, req.params.id))
      .returning({ id: tenants.id });
    if (!t) { res.status(404).json({ error: "Empresa no encontrada." }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Pipeline de retención ─────────────────────────────────────────────────────

router.get("/retencion", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: retencion_seguimiento.id,
        etapa: retencion_seguimiento.etapa,
        notas: retencion_seguimiento.notas,
        responsable: retencion_seguimiento.responsable,
        proxima_accion_at: retencion_seguimiento.proxima_accion_at,
        updated_at: retencion_seguimiento.updated_at,
        tenant_id: tenants.id,
        tenant_nombre: tenants.nombre,
        correo: tenants.correo,
        telefono: tenants.telefono,
        plan_nombre: plans.nombre,
        precio_anual: plans.precio_anual_cop,
        plan_ends_at: tenants.plan_ends_at,
      })
      .from(retencion_seguimiento)
      .innerJoin(tenants, eq(tenants.id, retencion_seguimiento.tenant_id))
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .orderBy(retencion_seguimiento.updated_at);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/retencion", async (req, res, next) => {
  try {
    const { tenant_id, etapa, notas, responsable, proxima_accion_at } = req.body as {
      tenant_id: string; etapa?: string; notas?: string; responsable?: string; proxima_accion_at?: string;
    };
    if (!tenant_id) { res.status(400).json({ error: "Campo requerido: tenant_id." }); return; }

    const existing = await db
      .select({ id: retencion_seguimiento.id })
      .from(retencion_seguimiento)
      .where(eq(retencion_seguimiento.tenant_id, tenant_id))
      .limit(1);

    const values = {
      etapa: (etapa ?? "en_riesgo") as "en_riesgo" | "contactado" | "en_negociacion" | "renovado" | "cancelado",
      notas: notas ?? null,
      responsable: responsable ?? null,
      proxima_accion_at: proxima_accion_at ? new Date(proxima_accion_at) : null,
      updated_at: new Date(),
    };

    if (existing.length > 0) {
      await db.update(retencion_seguimiento).set(values).where(eq(retencion_seguimiento.tenant_id, tenant_id));
    } else {
      await db.insert(retencion_seguimiento).values({ tenant_id, ...values });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/fundador/renovaciones ───────────────────────────────────────────

router.get("/renovaciones", async (req, res, next) => {
  try {
    const dias = Number((req.query as { dias?: string }).dias ?? 90);
    const hasta = new Date(Date.now() + dias * 86400000);
    const ahora = new Date();
    const excluir = await getSistemaTenantIds();

    const rows = await db
      .select({
        id: tenants.id, nombre: tenants.nombre, correo: tenants.correo,
        telefono: tenants.telefono, plan_ends_at: tenants.plan_ends_at,
        plan_nombre: plans.nombre, precio_anual: plans.precio_anual_cop,
        ultimo_pago_confirmado_at: tenants.ultimo_pago_confirmado_at,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .where(and(
        eq(tenants.activo, true),
        gte(tenants.plan_ends_at, ahora),
        lte(tenants.plan_ends_at, hasta),
        excluir.length > 0 ? notInArray(tenants.id, excluir) : undefined,
      ))
      .orderBy(tenants.plan_ends_at);

    res.json(
      rows.map((r) => ({
        ...r,
        dias_para_vencer: Math.ceil((new Date(r.plan_ends_at).getTime() - Date.now()) / 86400000),
      })),
    );
  } catch (err) { next(err); }
});

// ── GET /api/fundador/embajadores ─────────────────────────────────────────────

router.get("/embajadores", async (_req, res, next) => {
  try {
    const activas = await db
      .select({
        id: tenants.id, nombre: tenants.nombre, correo: tenants.correo,
        telefono: tenants.telefono, created_at: tenants.created_at,
        plan_nombre: plans.nombre,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .where(eq(tenants.activo, true));

    const { loginMap, factTotalMap } = await getActividadMaps();

    const candidatos = activas
      .map((t) => {
        const ul = loginMap.get(t.id);
        const diasSinLogin = ul ? Math.floor((Date.now() - new Date(ul).getTime()) / 86400000) : 999;
        const factTotal = factTotalMap.get(t.id) ?? 0;
        const diasActivo = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000);
        return { ...t, dias_sin_login: diasSinLogin, facturas_total: factTotal, dias_activo: diasActivo };
      })
      .filter((t) => t.dias_sin_login < 14 && t.facturas_total >= 5)
      .sort((a, b) => b.facturas_total - a.facturas_total)
      .slice(0, 10);

    res.json(candidatos);
  } catch (err) { next(err); }
});

// ── GET /api/fundador/contadores ──────────────────────────────────────────────

router.get("/contadores", async (_req, res, next) => {
  try {
    // Solo accesos de rol "contador" — no admins ni otros roles
    const accesos = await db
      .select({
        user_id: user_accesos.user_id,
        tenant_id: user_accesos.tenant_id,
        nombre: tenants.nombre,
        plan: plans.nombre,
        precio_anual: plans.precio_anual_cop,
      })
      .from(user_accesos)
      .innerJoin(tenants, eq(tenants.id, user_accesos.tenant_id))
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .where(eq(user_accesos.role, "contador"));

    const userIds = [...new Set(accesos.map((a) => a.user_id))];
    if (userIds.length === 0) { res.json([]); return; }

    const usersRows = await db
      .select({ id: users.id, nombre: users.nombre, email: users.email })
      .from(users)
      .where(sql`${users.id} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(","))}]::uuid[])`);

    const comisiones = await db
      .select({ contador_user_id: comisiones_contador.contador_user_id, pagada: comisiones_contador.pagada, valor: comisiones_contador.valor_cop })
      .from(comisiones_contador);

    const comisionMap = new Map<string, { pendiente: number; pagada: number }>();
    for (const c of comisiones) {
      const prev = comisionMap.get(c.contador_user_id) ?? { pendiente: 0, pagada: 0 };
      if (c.pagada) prev.pagada += c.valor; else prev.pendiente += c.valor;
      comisionMap.set(c.contador_user_id, prev);
    }

    res.json(
      usersRows.map((u) => {
        const misEmpresas = accesos.filter((a) => a.user_id === u.id);
        const com = comisionMap.get(u.id) ?? { pendiente: 0, pagada: 0 };
        return {
          ...u,
          empresas_gestionadas: misEmpresas.length,
          empresas: misEmpresas,
          comision_pendiente: com.pendiente,
          comision_pagada: com.pagada,
        };
      }),
    );
  } catch (err) { next(err); }
});

// ── Gastos internos ───────────────────────────────────────────────────────────

router.get("/gastos", async (_req, res, next) => {
  try {
    const rows = await db.select().from(gastos_internos).orderBy(gastos_internos.created_at);
    const totalMensual = rows.filter((g) => g.activo).reduce((s, g) => s + (g.frecuencia === "mensual" ? g.monto_cop : Math.round(g.monto_cop / 12)), 0);
    res.json({ gastos: rows, total_mensual: totalMensual, total_anual: anualizar(rows) });
  } catch (err) { next(err); }
});

router.post("/gastos", async (req, res, next) => {
  try {
    const { concepto, proveedor, monto_cop, frecuencia, notas } = req.body as { concepto: string; proveedor?: string; monto_cop: number; frecuencia: string; notas?: string; };
    if (!concepto || !monto_cop || !frecuencia) { res.status(400).json({ error: "Campos requeridos." }); return; }
    const [g] = await db.insert(gastos_internos).values({ concepto, proveedor: proveedor ?? null, monto_cop, frecuencia: frecuencia as "mensual" | "anual" | "unico", notas: notas ?? null }).returning();
    res.status(201).json(g);
  } catch (err) { next(err); }
});

router.patch("/gastos/:id/toggle", async (req, res, next) => {
  try {
    const [g] = await db.select().from(gastos_internos).where(eq(gastos_internos.id, req.params.id));
    if (!g) { res.status(404).json({ error: "No encontrado." }); return; }
    const [u] = await db.update(gastos_internos).set({ activo: !g.activo }).where(eq(gastos_internos.id, req.params.id)).returning();
    res.json(u);
  } catch (err) { next(err); }
});

router.delete("/gastos/:id", async (req, res, next) => {
  try {
    await db.delete(gastos_internos).where(eq(gastos_internos.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Comisiones ────────────────────────────────────────────────────────────────

router.get("/comisiones", async (_req, res, next) => {
  try {
    const rows = await db
      .select({ id: comisiones_contador.id, tipo: comisiones_contador.tipo, ano_renovacion: comisiones_contador.ano_renovacion, porcentaje: comisiones_contador.porcentaje, base_cop: comisiones_contador.base_cop, valor_cop: comisiones_contador.valor_cop, pagada: comisiones_contador.pagada, fecha_pago: comisiones_contador.fecha_pago, notas: comisiones_contador.notas, created_at: comisiones_contador.created_at, contador_nombre: users.nombre, contador_email: users.email, empresa_nombre: tenants.nombre })
      .from(comisiones_contador)
      .innerJoin(users, eq(users.id, comisiones_contador.contador_user_id))
      .innerJoin(tenants, eq(tenants.id, comisiones_contador.tenant_id))
      .orderBy(desc(comisiones_contador.created_at));
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/comisiones", async (req, res, next) => {
  try {
    const { contador_user_id, tenant_id, tipo, ano_renovacion, porcentaje, base_cop, notas } = req.body as { contador_user_id: string; tenant_id: string; tipo: string; ano_renovacion?: number; porcentaje: number; base_cop: number; notas?: string; };
    if (!contador_user_id || !tenant_id || !tipo || !porcentaje || !base_cop) { res.status(400).json({ error: "Campos requeridos." }); return; }
    const valor_cop = Math.round((base_cop * porcentaje) / 100);
    const [c] = await db.insert(comisiones_contador).values({ contador_user_id, tenant_id, tipo: tipo as "venta_inicial" | "renovacion", ano_renovacion: ano_renovacion ?? 1, porcentaje: String(porcentaje), base_cop, valor_cop, notas: notas ?? null }).returning();
    res.status(201).json(c);
  } catch (err) { next(err); }
});

router.patch("/comisiones/:id/pagar", async (req, res, next) => {
  try {
    const [c] = await db.update(comisiones_contador).set({ pagada: true, fecha_pago: new Date() }).where(and(eq(comisiones_contador.id, req.params.id), eq(comisiones_contador.pagada, false))).returning();
    if (!c) { res.status(404).json({ error: "No encontrada o ya pagada." }); return; }
    res.json(c);
  } catch (err) { next(err); }
});

// ── Leads ─────────────────────────────────────────────────────────────────────

router.get("/leads", async (_req, res, next) => {
  try {
    const rows = await db.select().from(leads_doravia).orderBy(desc(leads_doravia.updated_at));
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/leads", async (req, res, next) => {
  try {
    const body = req.body as { empresa: string; contacto?: string; email?: string; telefono?: string; fuente?: string; etapa?: string; valor_potencial_cop?: number; notas?: string; responsable?: string; };
    if (!body.empresa) { res.status(400).json({ error: "Campo requerido: empresa." }); return; }
    const [l] = await db.insert(leads_doravia).values({
      empresa: body.empresa, contacto: body.contacto ?? null, email: body.email ?? null,
      telefono: body.telefono ?? null, fuente: (body.fuente as any) ?? null,
      etapa: (body.etapa as any) ?? "prospecto",
      valor_potencial_cop: body.valor_potencial_cop ?? null,
      notas: body.notas ?? null, responsable: body.responsable ?? null,
    }).returning();
    res.status(201).json(l);
  } catch (err) { next(err); }
});

router.patch("/leads/:id", async (req, res, next) => {
  try {
    const body = req.body as { empresa?: string; contacto?: string; email?: string; telefono?: string; fuente?: string; etapa?: string; valor_potencial_cop?: number; notas?: string; responsable?: string; };
    const [l] = await db.update(leads_doravia).set({ ...body, updated_at: new Date() } as any).where(eq(leads_doravia.id, req.params.id)).returning();
    if (!l) { res.status(404).json({ error: "Lead no encontrado." }); return; }
    res.json(l);
  } catch (err) { next(err); }
});

router.delete("/leads/:id", async (req, res, next) => {
  try {
    await db.delete(leads_doravia).where(eq(leads_doravia.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/fundador/marketing ───────────────────────────────────────────────

router.get("/marketing", async (_req, res, next) => {
  try {
    const allTenants = await db
      .select({ id: tenants.id, activo: tenants.activo, onboarding_completado: tenants.onboarding_completado, created_at: tenants.created_at, plan_nombre: plans.nombre, plan_slug: plans.slug, nombre: tenants.nombre, correo: tenants.correo, telefono: tenants.telefono, fuente_adquisicion: tenants.fuente_adquisicion })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id));

    const conFacturas = await db.selectDistinct({ tenant_id: facturas.tenant_id }).from(facturas);
    const conFacturasSet = new Set(conFacturas.map((f) => f.tenant_id));

    const haceUnaS = new Date(Date.now() - 7 * 86400000);
    const haceUnM = new Date(Date.now() - 30 * 86400000);
    const hace60 = new Date(Date.now() - 60 * 86400000);

    const planDist: Record<string, number> = {};
    const fuenteDist: Record<string, number> = {};
    for (const t of allTenants) {
      planDist[t.plan_nombre] = (planDist[t.plan_nombre] ?? 0) + 1;
      const f = t.fuente_adquisicion ?? "sin_registrar";
      fuenteDist[f] = (fuenteDist[f] ?? 0) + 1;
    }

    const { loginMap, factMap } = await getActividadMaps();

    const empresasRiesgo = allTenants
      .filter((t) => t.activo)
      .map((t) => {
        const ul = loginMap.get(t.id);
        const diasSinLogin = ul ? Math.floor((Date.now() - new Date(ul).getTime()) / 86400000) : null;
        const { nivel, score } = calcularRiesgo({ diasSinLogin, facturasUlt30: factMap.get(t.id) ?? 0, diasPlanVence: null, onboardingCompletado: t.onboarding_completado });
        return { ...t, dias_sin_login: diasSinLogin, riesgo_nivel: nivel, riesgo_score: score };
      })
      .filter((t) => t.riesgo_nivel !== "bajo")
      .sort((a, b) => b.riesgo_score - a.riesgo_score)
      .slice(0, 20);

    res.json({
      funnel: {
        total: allTenants.length,
        activas: allTenants.filter((t) => t.activo).length,
        onboarding_completo: allTenants.filter((t) => t.onboarding_completado).length,
        con_facturas: conFacturasSet.size,
        sin_facturas: allTenants.filter((t) => !conFacturasSet.has(t.id)).length,
      },
      crecimiento: {
        nuevas_esta_semana: allTenants.filter((t) => new Date(t.created_at) >= haceUnaS).length,
        nuevas_este_mes: allTenants.filter((t) => new Date(t.created_at) >= haceUnM).length,
        mes_anterior: allTenants.filter((t) => new Date(t.created_at) >= hace60 && new Date(t.created_at) < haceUnM).length,
        variacion_pct: null,
      },
      distribucion_planes: planDist,
      distribucion_fuentes: fuenteDist,
      sin_fuente: allTenants.filter((t) => !t.fuente_adquisicion).length,
      empresas_sin_fuente: allTenants.filter((t) => !t.fuente_adquisicion).map((t) => ({ id: t.id, nombre: t.nombre })),
      empresas_para_outreach: empresasRiesgo,
    });
  } catch (err) { next(err); }
});

// ── POST /api/fundador/ia ─────────────────────────────────────────────────────

router.post("/ia", async (req, res, next) => {
  try {
    const { pregunta, contexto, historial } = req.body as { pregunta: string; contexto?: string; historial?: { role: "user" | "assistant"; content: string }[] };
    if (!pregunta?.trim()) { res.status(400).json({ error: "Campo requerido: pregunta." }); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "Asistente IA no configurado." }); return; }

    const anthropic = new Anthropic({ apiKey });

    const mensajesPrevios = (historial ?? []).slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `Eres un experto en marketing para SaaS B2B en el mercado colombiano de pymes.
Trabajas con los fundadores de Doravia, un ERP contable y de facturación electrónica para empresas colombianas.
Tu trabajo es ayudar a la CEO de Marketing a crecer clientes, mejorar retención y generar contenido efectivo.
Responde en español, sé concreto y orientado a la acción. Máximo 350 palabras.
${contexto ? `\nContexto actual:\n${contexto}` : ""}`,
      messages: [
        ...mensajesPrevios,
        { role: "user", content: pregunta },
      ],
    });

    const respuesta = msg.content[0]?.type === "text" ? msg.content[0].text : "Sin respuesta.";
    res.json({ respuesta });
  } catch (err) { next(err); }
});

// ── GET /api/fundador/registros-pendientes ────────────────────────────────────
router.get("/registros-pendientes", async (_req, res, next) => {
  try {
    const pendientes = await db
      .select({
        id: pending_registrations.id,
        nit: pending_registrations.nit,
        tenant_nombre: pending_registrations.tenant_nombre,
        usuario_nombre: pending_registrations.usuario_nombre,
        email: pending_registrations.email,
        plan_slug: pending_registrations.plan_slug,
        wompi_reference: pending_registrations.wompi_reference,
        expires_at: pending_registrations.expires_at,
        created_at: pending_registrations.created_at,
      })
      .from(pending_registrations)
      .where(isNull(pending_registrations.completed_at))
      .orderBy(desc(pending_registrations.created_at));

    return res.json(pendientes);
  } catch (err) {
    console.error("Error en GET /fundador/registros-pendientes:", err);
    next(err);
  }
});

// POST /api/fundador/activar-registro/:id
// Activa un pending_registration sin pago — útil en desarrollo/QA y cuando el fundador
// quiere confirmar manualmente un registro (ej. pago por fuera).
// Protegido por requireFundador. En producción, solo el fundador puede usarlo.
router.post("/activar-registro/:id", async (req, res) => {
  const { id } = req.params;

  const [pending] = await db
    .select()
    .from(pending_registrations)
    .where(eq(pending_registrations.id, id))
    .limit(1);

  if (!pending) return res.status(404).json({ error: "Registro pendiente no encontrado." });
  if (pending.completed_at) return res.status(409).json({ error: "Este registro ya fue completado.", tenant_id: null });

  const [plan] = await db.select().from(plans).where(eq(plans.slug, pending.plan_slug)).limit(1);
  if (!plan) return res.status(422).json({ error: `Plan "${pending.plan_slug}" no encontrado en DB. Corre db:seed primero.` });

  const [nitExistente] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.nit, pending.nit)).limit(1);
  if (nitExistente) return res.status(422).json({ error: `Ya existe un tenant con NIT ${pending.nit}.` });

  const ahora = new Date();
  const planFin = new Date(ahora);
  planFin.setFullYear(planFin.getFullYear() + 1);

  const { tenant, user } = await db.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenants).values({
      nombre: pending.tenant_nombre,
      nit: pending.nit,
      plan_id: plan.id,
      plan_starts_at: ahora,
      plan_ends_at: planFin,
      activo: true,
      ultimo_pago_confirmado_at: ahora,
    }).returning();

    const [user] = await tx.insert(users).values({
      tenant_id: tenant.id,
      email: pending.email,
      nombre: pending.usuario_nombre,
      role: "admin",
      password_hash: pending.password_hash,
    }).returning();

    await tx.update(pending_registrations)
      .set({ completed_at: ahora })
      .where(eq(pending_registrations.id, pending.id));

    return { tenant, user };
  });

  console.log(`[fundador] Registro activado manualmente: ${tenant.nombre} (${tenant.nit}) — ${user.email}`);
  res.status(201).json({
    ok: true,
    tenant_id: tenant.id,
    tenant_nombre: tenant.nombre,
    nit: tenant.nit,
    plan: plan.slug,
    email: user.email,
    plan_ends_at: planFin.toISOString(),
  });
});

// ── GET /api/fundador/plan-features — lista todos los planes con sus features ──
router.get("/plan-features", async (_req, res, next) => {
  try {
    const allPlans = await db.select().from(plans).orderBy(plans.product, plans.precio_anual_cop);
    const allFeatures = await db.select().from(plan_features);

    const featuresByPlan = new Map<string, Record<string, boolean>>();
    for (const f of allFeatures) {
      if (!featuresByPlan.has(f.plan_id)) featuresByPlan.set(f.plan_id, {});
      featuresByPlan.get(f.plan_id)![f.feature_key] = f.enabled;
    }

    const result = allPlans.map((p) => ({
      id: p.id,
      slug: p.slug,
      nombre: p.nombre,
      product: p.product,
      precio_anual_cop: p.precio_anual_cop,
      features: featuresByPlan.get(p.id) ?? {},
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ── PATCH /api/fundador/plan-features/:planId/:featureKey ─────────────────────
router.patch("/plan-features/:planId/:featureKey", async (req, res, next) => {
  try {
    const { planId, featureKey } = req.params;
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Campo requerido: enabled (boolean)." });
    }

    const plan = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan[0]) return res.status(404).json({ error: "Plan no encontrado." });

    await db
      .insert(plan_features)
      .values({ plan_id: planId, feature_key: featureKey, enabled })
      .onConflictDoUpdate({
        target: [plan_features.plan_id, plan_features.feature_key],
        set: { enabled, updated_at: sql`now()` },
      });

    res.json({ ok: true, plan_id: planId, feature_key: featureKey, enabled });
  } catch (err) { next(err); }
});

// ── GET /api/fundador/consumo-dian ────────────────────────────────────────────
router.get("/consumo-dian", async (_req, res, next) => {
  try {
    const { loginMap } = await getActividadMaps();
    void loginMap; // usado en otros endpoints, aquí solo para consistencia del helper
    const rows = await db
      .select({
        id: tenants.id,
        nombre: tenants.nombre,
        nit: tenants.nit,
        facturas_mes_actual: tenants.facturas_mes_actual,
        plemsi_ambiente: tenants.plemsi_ambiente,
        plemsi_habilitado: tenants.plemsi_habilitado,
      })
      .from(tenants)
      .where(eq(tenants.activo, true))
      .orderBy(desc(tenants.facturas_mes_actual));

    const totalMes = rows.reduce((s, r) => s + (r.facturas_mes_actual ?? 0), 0);
    res.json({ total_mes: totalMes, tenants: rows });
  } catch (err) { next(err); }
});

export default router;
