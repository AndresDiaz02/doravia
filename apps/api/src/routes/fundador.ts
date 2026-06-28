import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, tenants, users, plans, refresh_tokens, facturas, user_accesos, gastos_internos, comisiones_contador } from "@workspace/db";
import { eq, sql, desc, and, gte, max, count } from "drizzle-orm";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcularRiesgo(d: {
  diasSinLogin: number | null;
  facturasUlt30: number;
  diasPlanVence: number | null;
  onboardingCompletado: boolean;
}): { score: number; nivel: "bajo" | "medio" | "alto" } {
  let score = 0;

  // Actividad: hasta 40 pts
  const dias = d.diasSinLogin ?? 999;
  if (dias > 60) score += 40;
  else if (dias > 30) score += 25;
  else if (dias > 14) score += 10;

  // Facturación: hasta 30 pts
  if (d.facturasUlt30 === 0) score += 30;
  else if (d.facturasUlt30 < 3) score += 10;

  // Vencimiento plan: hasta 30 pts
  const vence = d.diasPlanVence ?? -1;
  if (vence < 0) score += 30;
  else if (vence < 15) score += 25;
  else if (vence < 30) score += 15;
  else if (vence < 60) score += 5;

  // Onboarding incompleto: +20
  if (!d.onboardingCompletado) score += 20;

  score = Math.min(score, 100);
  const nivel = score >= 60 ? "alto" : score >= 30 ? "medio" : "bajo";
  return { score, nivel };
}

function anualizar(gastos: { monto_cop: number; frecuencia: string; activo: boolean }[]): number {
  return gastos
    .filter((g) => g.activo)
    .reduce((s, g) => {
      if (g.frecuencia === "mensual") return s + g.monto_cop * 12;
      return s + g.monto_cop; // anual o único
    }, 0);
}

// ── GET /api/fundador/metricas ────────────────────────────────────────────────

router.get("/metricas", async (_req, res, next) => {
  try {
    const empresaRows = await db
      .select({
        id: tenants.id,
        activo: tenants.activo,
        precio_anual: plans.precio_anual_cop,
        plan_ends_at: tenants.plan_ends_at,
        created_at: tenants.created_at,
        onboarding_completado: tenants.onboarding_completado,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id));

    const activas = empresaRows.filter((e) => e.activo);
    const arr = activas.reduce((s, e) => s + (e.precio_anual ?? 0), 0);
    const mrr = Math.round(arr / 12);
    const acv = activas.length > 0 ? Math.round(arr / activas.length) : 0;

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const nuevasMes = empresaRows.filter((e) => new Date(e.created_at) >= inicioMes).length;

    const vencenPronto = activas.filter((e) => {
      const dias = (new Date(e.plan_ends_at).getTime() - Date.now()) / 86400000;
      return dias < 30;
    }).length;

    const gastosRows = await db.select().from(gastos_internos);
    const gastosAnuales = anualizar(gastosRows);

    // Risk snapshot — última actividad por tenant
    const ultimosLogin = await db
      .select({ tenant_id: refresh_tokens.tenant_id, ultimo: max(refresh_tokens.created_at) })
      .from(refresh_tokens)
      .groupBy(refresh_tokens.tenant_id);

    const loginMap = new Map(ultimosLogin.map((r) => [r.tenant_id, r.ultimo]));

    // Facturas últimos 30 días
    const hace30 = new Date(Date.now() - 30 * 86400000);
    const factUlt30 = await db
      .select({ tenant_id: facturas.tenant_id, total: count() })
      .from(facturas)
      .where(gte(facturas.created_at, hace30))
      .groupBy(facturas.tenant_id);
    const factMap = new Map(factUlt30.map((r) => [r.tenant_id, Number(r.total)]));

    let riesgoAlto = 0;
    let riesgoMedio = 0;
    for (const e of activas) {
      const ultimo = loginMap.get(e.id);
      const diasSinLogin = ultimo
        ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000)
        : null;
      const diasPlanVence = Math.floor((new Date(e.plan_ends_at).getTime() - Date.now()) / 86400000);
      const { nivel } = calcularRiesgo({
        diasSinLogin,
        facturasUlt30: factMap.get(e.id) ?? 0,
        diasPlanVence,
        onboardingCompletado: e.onboarding_completado,
      });
      if (nivel === "alto") riesgoAlto++;
      else if (nivel === "medio") riesgoMedio++;
    }

    res.json({
      arr,
      mrr,
      acv,
      total_empresas: empresaRows.length,
      empresas_activas: activas.length,
      nuevas_este_mes: nuevasMes,
      vencen_pronto: vencenPronto,
      gastos_anuales: gastosAnuales,
      ganancia_estimada: arr - gastosAnuales,
      empresas_riesgo_alto: riesgoAlto,
      empresas_riesgo_medio: riesgoMedio,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/fundador/empresas ────────────────────────────────────────────────

router.get("/empresas", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: tenants.id,
        nombre: tenants.nombre,
        nit: tenants.nit,
        activo: tenants.activo,
        correo: tenants.correo,
        telefono: tenants.telefono,
        ciudad: tenants.ciudad,
        created_at: tenants.created_at,
        plan_starts_at: tenants.plan_starts_at,
        plan_ends_at: tenants.plan_ends_at,
        onboarding_completado: tenants.onboarding_completado,
        plan_nombre: plans.nombre,
        precio_anual: plans.precio_anual_cop,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id))
      .orderBy(tenants.nombre);

    // Última actividad por tenant
    const ultimosLogin = await db
      .select({ tenant_id: refresh_tokens.tenant_id, ultimo: max(refresh_tokens.created_at) })
      .from(refresh_tokens)
      .groupBy(refresh_tokens.tenant_id);
    const loginMap = new Map(ultimosLogin.map((r) => [r.tenant_id, r.ultimo]));

    // Facturas últimos 30 días
    const hace30 = new Date(Date.now() - 30 * 86400000);
    const factUlt30 = await db
      .select({ tenant_id: facturas.tenant_id, total: count() })
      .from(facturas)
      .where(gte(facturas.created_at, hace30))
      .groupBy(facturas.tenant_id);
    const factMap = new Map(factUlt30.map((r) => [r.tenant_id, Number(r.total)]));

    // Total facturas por tenant (all time)
    const factTotal = await db
      .select({ tenant_id: facturas.tenant_id, total: count() })
      .from(facturas)
      .groupBy(facturas.tenant_id);
    const factTotalMap = new Map(factTotal.map((r) => [r.tenant_id, Number(r.total)]));

    const resultado = rows.map((e) => {
      const ultimo = loginMap.get(e.id);
      const diasSinLogin = ultimo
        ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000)
        : null;
      const diasPlanVence = Math.floor((new Date(e.plan_ends_at).getTime() - Date.now()) / 86400000);
      const facturasUlt30 = factMap.get(e.id) ?? 0;
      const { score, nivel } = calcularRiesgo({
        diasSinLogin,
        facturasUlt30,
        diasPlanVence,
        onboardingCompletado: e.onboarding_completado,
      });
      return {
        ...e,
        ultimo_login: ultimo ?? null,
        dias_sin_login: diasSinLogin,
        facturas_ult30: facturasUlt30,
        facturas_total: factTotalMap.get(e.id) ?? 0,
        dias_plan_vence: diasPlanVence,
        riesgo_score: score,
        riesgo_nivel: nivel,
      };
    });

    // Sort by risk score descending
    resultado.sort((a, b) => b.riesgo_score - a.riesgo_score);

    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/fundador/contadores ──────────────────────────────────────────────

router.get("/contadores", async (_req, res, next) => {
  try {
    // Usuarios que gestionan empresas ajenas vía user_accesos
    const accesos = await db
      .select({
        user_id: user_accesos.user_id,
        tenant_id: user_accesos.tenant_id,
        tenant_nombre: tenants.nombre,
        tenant_plan: plans.nombre,
        precio_anual: plans.precio_anual_cop,
      })
      .from(user_accesos)
      .innerJoin(tenants, eq(tenants.id, user_accesos.tenant_id))
      .innerJoin(plans, eq(plans.id, tenants.plan_id));

    // Usuarios únicos
    const userIds = [...new Set(accesos.map((a) => a.user_id))];
    if (userIds.length === 0) {
      res.json([]);
      return;
    }

    const usersRows = await db
      .select({ id: users.id, nombre: users.nombre, email: users.email })
      .from(users)
      .where(sql`${users.id} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(","))}]::uuid[])`);

    // Comisiones pendientes + pagadas por contador
    const comisiones = await db
      .select({
        contador_user_id: comisiones_contador.contador_user_id,
        pagada: comisiones_contador.pagada,
        valor: comisiones_contador.valor_cop,
      })
      .from(comisiones_contador);

    const comisionMap = new Map<string, { pendiente: number; pagada: number }>();
    for (const c of comisiones) {
      const prev = comisionMap.get(c.contador_user_id) ?? { pendiente: 0, pagada: 0 };
      if (c.pagada) prev.pagada += c.valor;
      else prev.pendiente += c.valor;
      comisionMap.set(c.contador_user_id, prev);
    }

    const resultado = usersRows.map((u) => {
      const misEmpresas = accesos.filter((a) => a.user_id === u.id);
      const com = comisionMap.get(u.id) ?? { pendiente: 0, pagada: 0 };
      return {
        ...u,
        empresas_gestionadas: misEmpresas.length,
        empresas: misEmpresas.map((a) => ({
          tenant_id: a.tenant_id,
          nombre: a.tenant_nombre,
          plan: a.tenant_plan,
          precio_anual: a.precio_anual,
        })),
        comision_pendiente: com.pendiente,
        comision_pagada: com.pagada,
      };
    });

    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// ── Gastos internos de Doravia ────────────────────────────────────────────────

router.get("/gastos", async (_req, res, next) => {
  try {
    const rows = await db.select().from(gastos_internos).orderBy(gastos_internos.created_at);
    const totalMensual = rows
      .filter((g) => g.activo)
      .reduce((s, g) => {
        if (g.frecuencia === "mensual") return s + g.monto_cop;
        if (g.frecuencia === "anual") return s + Math.round(g.monto_cop / 12);
        return s;
      }, 0);
    res.json({ gastos: rows, total_mensual: totalMensual, total_anual: anualizar(rows) });
  } catch (err) {
    next(err);
  }
});

router.post("/gastos", async (req, res, next) => {
  try {
    const { concepto, proveedor, monto_cop, frecuencia, notas } = req.body as {
      concepto: string;
      proveedor?: string;
      monto_cop: number;
      frecuencia: string;
      notas?: string;
    };
    if (!concepto || !monto_cop || !frecuencia) {
      res.status(400).json({ error: "Campos requeridos: concepto, monto_cop, frecuencia." });
      return;
    }
    const [g] = await db
      .insert(gastos_internos)
      .values({
        concepto,
        proveedor: proveedor ?? null,
        monto_cop,
        frecuencia: frecuencia as "mensual" | "anual" | "unico",
        notas: notas ?? null,
      })
      .returning();
    res.status(201).json(g);
  } catch (err) {
    next(err);
  }
});

router.patch("/gastos/:id/toggle", async (req, res, next) => {
  try {
    const [g] = await db.select().from(gastos_internos).where(eq(gastos_internos.id, req.params.id));
    if (!g) { res.status(404).json({ error: "Gasto no encontrado." }); return; }
    const [updated] = await db
      .update(gastos_internos)
      .set({ activo: !g.activo })
      .where(eq(gastos_internos.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/gastos/:id", async (req, res, next) => {
  try {
    await db.delete(gastos_internos).where(eq(gastos_internos.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Comisiones de contadores ──────────────────────────────────────────────────

router.get("/comisiones", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: comisiones_contador.id,
        tipo: comisiones_contador.tipo,
        ano_renovacion: comisiones_contador.ano_renovacion,
        porcentaje: comisiones_contador.porcentaje,
        base_cop: comisiones_contador.base_cop,
        valor_cop: comisiones_contador.valor_cop,
        pagada: comisiones_contador.pagada,
        fecha_pago: comisiones_contador.fecha_pago,
        notas: comisiones_contador.notas,
        created_at: comisiones_contador.created_at,
        contador_nombre: users.nombre,
        contador_email: users.email,
        empresa_nombre: tenants.nombre,
      })
      .from(comisiones_contador)
      .innerJoin(users, eq(users.id, comisiones_contador.contador_user_id))
      .innerJoin(tenants, eq(tenants.id, comisiones_contador.tenant_id))
      .orderBy(desc(comisiones_contador.created_at));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/comisiones", async (req, res, next) => {
  try {
    const { contador_user_id, tenant_id, tipo, ano_renovacion, porcentaje, base_cop, notas } = req.body as {
      contador_user_id: string;
      tenant_id: string;
      tipo: string;
      ano_renovacion?: number;
      porcentaje: number;
      base_cop: number;
      notas?: string;
    };
    if (!contador_user_id || !tenant_id || !tipo || !porcentaje || !base_cop) {
      res.status(400).json({ error: "Campos requeridos: contador_user_id, tenant_id, tipo, porcentaje, base_cop." });
      return;
    }
    const valor_cop = Math.round((base_cop * porcentaje) / 100);
    const [c] = await db
      .insert(comisiones_contador)
      .values({
        contador_user_id,
        tenant_id,
        tipo: tipo as "venta_inicial" | "renovacion",
        ano_renovacion: ano_renovacion ?? 1,
        porcentaje: String(porcentaje),
        base_cop,
        valor_cop,
        notas: notas ?? null,
      })
      .returning();
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
});

router.patch("/comisiones/:id/pagar", async (req, res, next) => {
  try {
    const [c] = await db
      .update(comisiones_contador)
      .set({ pagada: true, fecha_pago: new Date() })
      .where(and(eq(comisiones_contador.id, req.params.id), eq(comisiones_contador.pagada, false)))
      .returning();
    if (!c) { res.status(404).json({ error: "Comisión no encontrada o ya pagada." }); return; }
    res.json(c);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/fundador/marketing ───────────────────────────────────────────────

router.get("/marketing", async (_req, res, next) => {
  try {
    const allTenants = await db
      .select({
        id: tenants.id,
        activo: tenants.activo,
        onboarding_completado: tenants.onboarding_completado,
        created_at: tenants.created_at,
        plan_nombre: plans.nombre,
        plan_slug: plans.slug,
        nombre: tenants.nombre,
        correo: tenants.correo,
        telefono: tenants.telefono,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.plan_id));

    // Tenants con al menos 1 factura
    const conFacturas = await db
      .selectDistinct({ tenant_id: facturas.tenant_id })
      .from(facturas);
    const conFacturasSet = new Set(conFacturas.map((f) => f.tenant_id));

    const haceUnaS = new Date(Date.now() - 7 * 86400000);
    const haceUnM = new Date(Date.now() - 30 * 86400000);

    const nuevasSemana = allTenants.filter((t) => new Date(t.created_at) >= haceUnaS).length;
    const nuevasMes = allTenants.filter((t) => new Date(t.created_at) >= haceUnM).length;
    const mesAnteriorInicio = new Date(Date.now() - 60 * 86400000);
    const mesAnterior = allTenants.filter(
      (t) => new Date(t.created_at) >= mesAnteriorInicio && new Date(t.created_at) < haceUnM,
    ).length;

    // Distribución por plan
    const planDist: Record<string, number> = {};
    for (const t of allTenants) {
      planDist[t.plan_nombre] = (planDist[t.plan_nombre] ?? 0) + 1;
    }

    // Última actividad
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

    // Empresas en riesgo (para outreach de Rose)
    const empresasRiesgo = allTenants
      .filter((t) => t.activo)
      .map((t) => {
        const ultimo = loginMap.get(t.id);
        const diasSinLogin = ultimo
          ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000)
          : null;
        const { nivel, score } = calcularRiesgo({
          diasSinLogin,
          facturasUlt30: factMap.get(t.id) ?? 0,
          diasPlanVence: null, // simplificado para marketing
          onboardingCompletado: t.onboarding_completado,
        });
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
        nuevas_esta_semana: nuevasSemana,
        nuevas_este_mes: nuevasMes,
        mes_anterior: mesAnterior,
        variacion_pct: mesAnterior > 0 ? Math.round(((nuevasMes - mesAnterior) / mesAnterior) * 100) : null,
      },
      distribucion_planes: planDist,
      empresas_para_outreach: empresasRiesgo,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/fundador/ia — asistente de marketing para Rose ─────────────────

router.post("/ia", async (req, res, next) => {
  try {
    const { pregunta, contexto } = req.body as { pregunta: string; contexto?: string };
    if (!pregunta?.trim()) { res.status(400).json({ error: "Campo requerido: pregunta." }); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "Asistente IA no configurado." }); return; }

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `Eres un experto en marketing para SaaS B2B enfocado en el mercado colombiano de pymes.
Trabajas directamente con los fundadores de Doravia, un ERP contable y de facturación electrónica para empresas colombianas.
Tu trabajo es ayudar a la CEO de Marketing a crecer la base de clientes, mejorar la retención y generar contenido efectivo.
Responde siempre en español, sé concreto y orientado a la acción. Máximo 300 palabras por respuesta.
${contexto ? `\nContexto actual del negocio:\n${contexto}` : ""}`,
      messages: [{ role: "user", content: pregunta }],
    });

    const respuesta = msg.content[0]?.type === "text" ? msg.content[0].text : "Sin respuesta.";
    res.json({ respuesta });
  } catch (err) {
    next(err);
  }
});

export default router;
