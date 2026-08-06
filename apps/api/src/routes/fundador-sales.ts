import { Router } from "express";
import { db, sales_accounts, sales_contacts, sales_opportunities, sales_activities, sales_timeline_events, SALES_STAGES, SALES_ACTIVITY_TYPES, SALES_ACTIVITY_STATUSES } from "@workspace/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

const router = Router();
const stages = new Set<string>(SALES_STAGES);

async function event(accountId: string, opportunityId: string | null, actorId: string, tipo: string, payload: Record<string, unknown> = {}) {
  await db.insert(sales_timeline_events).values({ account_id: accountId, opportunity_id: opportunityId, actor_id: actorId, tipo, payload });
}

router.get("/dashboard", async (_req, res, next) => {
  try {
    const opportunities = await db.select().from(sales_opportunities);
    const open = opportunities.filter((o) => !["won", "lost"].includes(o.etapa));
    const wonThisMonth = opportunities.filter((o) => o.won_at && new Date(o.won_at).getMonth() === new Date().getMonth() && new Date(o.won_at).getFullYear() === new Date().getFullYear());
    const byStage = Object.fromEntries(SALES_STAGES.map((stage) => [stage, opportunities.filter((o) => o.etapa === stage).length]));
    const sum = (rows: typeof opportunities) => rows.reduce((n, o) => n + Number(o.expected_acv), 0);
    res.json({ revenue: { won_acv_month: sum(wonThisMonth), pipeline_acv: sum(open), weighted_pipeline_acv: open.reduce((n, o) => n + Number(o.expected_acv) * o.probability / 100, 0), open_opportunities: open.length }, funnel: byStage });
  } catch (err) { next(err); }
});

router.get("/accounts", async (_req, res, next) => { try { res.json(await db.select().from(sales_accounts).orderBy(desc(sales_accounts.updated_at))); } catch (err) { next(err); } });
router.post("/accounts", async (req, res, next) => {
  try {
    const body = req.body as Partial<typeof sales_accounts.$inferInsert>;
    if (!body.nombre_comercial?.trim()) return res.status(400).json({ error: "nombre_comercial es requerido." });
    const [account] = await db.insert(sales_accounts).values({ ...body, owner_id: body.owner_id ?? req.userId, nombre_comercial: body.nombre_comercial.trim() }).returning();
    await event(account.id, null, req.userId, "sales_account_created", { tipo: account.tipo });
    res.status(201).json(account);
  } catch (err) { next(err); }
});
router.get("/accounts/:id", async (req, res, next) => {
  try {
    const [account] = await db.select().from(sales_accounts).where(eq(sales_accounts.id, req.params.id)).limit(1);
    if (!account) return res.status(404).json({ error: "Cuenta no encontrada." });
    const [contacts, opportunities, timeline] = await Promise.all([
      db.select().from(sales_contacts).where(eq(sales_contacts.account_id, account.id)),
      db.select().from(sales_opportunities).where(eq(sales_opportunities.account_id, account.id)).orderBy(desc(sales_opportunities.updated_at)),
      db.select().from(sales_timeline_events).where(eq(sales_timeline_events.account_id, account.id)).orderBy(desc(sales_timeline_events.created_at)).limit(100),
    ]);
    res.json({ ...account, contacts, opportunities, timeline });
  } catch (err) { next(err); }
});
router.post("/accounts/:id/contacts", async (req, res, next) => {
  try {
    const { nombres, ...body } = req.body as Partial<typeof sales_contacts.$inferInsert>;
    if (!nombres?.trim()) return res.status(400).json({ error: "nombres es requerido." });
    const [account] = await db.select({ id: sales_accounts.id }).from(sales_accounts).where(eq(sales_accounts.id, req.params.id)).limit(1);
    if (!account) return res.status(404).json({ error: "Cuenta no encontrada." });
    const [contact] = await db.insert(sales_contacts).values({ ...body, nombres: nombres.trim(), account_id: account.id }).returning();
    await event(account.id, null, req.userId, "sales_contact_created", { contact_id: contact.id });
    res.status(201).json(contact);
  } catch (err) { next(err); }
});

router.get("/opportunities", async (req, res, next) => { try { const stage = req.query.stage as string | undefined; res.json(await db.select().from(sales_opportunities).where(stage && stages.has(stage) ? eq(sales_opportunities.etapa, stage as typeof SALES_STAGES[number]) : undefined).orderBy(desc(sales_opportunities.updated_at))); } catch (err) { next(err); } });
router.post("/opportunities", async (req, res, next) => {
  try {
    const body = req.body as Partial<typeof sales_opportunities.$inferInsert>;
    if (!body.account_id || !body.nombre?.trim()) return res.status(400).json({ error: "account_id y nombre son requeridos." });
    if (body.etapa && !stages.has(body.etapa)) return res.status(400).json({ error: "Etapa no valida." });
    if (body.probability != null && (body.probability < 0 || body.probability > 100)) return res.status(400).json({ error: "probability debe estar entre 0 y 100." });
    const [account] = await db.select({ id: sales_accounts.id }).from(sales_accounts).where(eq(sales_accounts.id, body.account_id)).limit(1);
    if (!account) return res.status(404).json({ error: "Cuenta no encontrada." });
    const [opportunity] = await db.insert(sales_opportunities).values({
      account_id: body.account_id, nombre: body.nombre.trim(), contact_id: body.contact_id ?? null,
      owner_id: body.owner_id ?? req.userId, etapa: body.etapa, fuente: body.fuente,
      expected_acv: body.expected_acv, potential_acv: body.potential_acv, probability: body.probability,
      forecast_category: body.forecast_category, expected_close_date: body.expected_close_date,
      competitor: body.competitor, notes: body.notes, discovery: body.discovery,
    }).returning();
    await event(account.id, opportunity.id, req.userId, "opportunity_created", { etapa: opportunity.etapa });
    res.status(201).json(opportunity);
  } catch (err) { next(err); }
});
router.patch("/opportunities/:id/stage", async (req, res, next) => {
  try {
    const { etapa, loss_reason } = req.body as { etapa?: string; loss_reason?: string };
    if (!etapa || !stages.has(etapa)) return res.status(400).json({ error: "Etapa no valida." });
    const [current] = await db.select().from(sales_opportunities).where(eq(sales_opportunities.id, req.params.id)).limit(1);
    if (!current) return res.status(404).json({ error: "Oportunidad no encontrada." });
    if (etapa === "lost" && !loss_reason) return res.status(400).json({ error: "loss_reason es requerido al perder una oportunidad." });
    const now = new Date();
    const [updated] = await db.update(sales_opportunities).set({ etapa: etapa as typeof SALES_STAGES[number], loss_reason: loss_reason ?? current.loss_reason, won_at: etapa === "won" ? now : current.won_at, lost_at: etapa === "lost" ? now : current.lost_at, updated_at: now }).where(eq(sales_opportunities.id, current.id)).returning();
    await event(current.account_id, current.id, req.userId, "opportunity_stage_changed", { from: current.etapa, to: etapa, loss_reason });
    res.json(updated);
  } catch (err) { next(err); }
});

router.get("/opportunities/:id", async (req, res, next) => {
  try {
    const [opportunity] = await db.select().from(sales_opportunities).where(eq(sales_opportunities.id, req.params.id)).limit(1);
    if (!opportunity) return res.status(404).json({ error: "Oportunidad no encontrada." });
    const [account, contacts, activities, timeline] = await Promise.all([
      db.select().from(sales_accounts).where(eq(sales_accounts.id, opportunity.account_id)).limit(1),
      db.select().from(sales_contacts).where(eq(sales_contacts.account_id, opportunity.account_id)),
      db.select().from(sales_activities).where(eq(sales_activities.opportunity_id, opportunity.id)).orderBy(desc(sales_activities.scheduled_at)),
      db.select().from(sales_timeline_events).where(eq(sales_timeline_events.opportunity_id, opportunity.id)).orderBy(desc(sales_timeline_events.created_at)),
    ]);
    res.json({ ...opportunity, account: account ?? null, contacts, activities, timeline });
  } catch (err) { next(err); }
});
router.patch("/opportunities/:id", async (req, res, next) => {
  try {
    const body = req.body as Partial<typeof sales_opportunities.$inferInsert>;
    const [current] = await db.select().from(sales_opportunities).where(eq(sales_opportunities.id, req.params.id)).limit(1);
    if (!current) return res.status(404).json({ error: "Oportunidad no encontrada." });
    if (body.probability != null && (body.probability < 0 || body.probability > 100)) return res.status(400).json({ error: "probability debe estar entre 0 y 100." });
    const [updated] = await db.update(sales_opportunities).set({
      ...(body.nombre !== undefined && { nombre: body.nombre }), ...(body.expected_acv !== undefined && { expected_acv: body.expected_acv }),
      ...(body.potential_acv !== undefined && { potential_acv: body.potential_acv }), ...(body.probability !== undefined && { probability: body.probability }),
      ...(body.expected_close_date !== undefined && { expected_close_date: body.expected_close_date }), ...(body.competitor !== undefined && { competitor: body.competitor }),
      ...(body.notes !== undefined && { notes: body.notes }), ...(body.discovery !== undefined && { discovery: body.discovery }), updated_at: new Date(),
    }).where(eq(sales_opportunities.id, current.id)).returning();
    await event(current.account_id, current.id, req.userId, "opportunity_updated", { fields: Object.keys(body) });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post("/opportunities/:id/activities", async (req, res, next) => {
  try {
    const body = req.body as Partial<typeof sales_activities.$inferInsert>;
    if (!body.tipo || !SALES_ACTIVITY_TYPES.includes(body.tipo) || !body.scheduled_at) return res.status(400).json({ error: "tipo y scheduled_at validos son requeridos." });
    const [opportunity] = await db.select().from(sales_opportunities).where(eq(sales_opportunities.id, req.params.id)).limit(1);
    if (!opportunity) return res.status(404).json({ error: "Oportunidad no encontrada." });
    const [activity] = await db.insert(sales_activities).values({
      opportunity_id: opportunity.id, account_id: opportunity.account_id, contact_id: body.contact_id ?? null,
      owner_id: body.owner_id ?? req.userId, tipo: body.tipo, scheduled_at: body.scheduled_at,
      estado: body.estado, notas: body.notas, resultado: body.resultado,
    }).returning();
    await db.update(sales_opportunities).set({ next_activity_at: activity.scheduled_at, updated_at: new Date() }).where(eq(sales_opportunities.id, opportunity.id));
    await event(opportunity.account_id, opportunity.id, req.userId, "sales_activity_scheduled", { activity_id: activity.id, tipo: activity.tipo });
    res.status(201).json(activity);
  } catch (err) { next(err); }
});

router.get("/activities", async (req, res, next) => {
  try {
    const estado = req.query.estado as string | undefined;
    if (estado && !SALES_ACTIVITY_STATUSES.includes(estado as typeof SALES_ACTIVITY_STATUSES[number])) return res.status(400).json({ error: "Estado no valido." });
    const rows = await db.select().from(sales_activities).where(estado ? eq(sales_activities.estado, estado as typeof SALES_ACTIVITY_STATUSES[number]) : undefined).orderBy(sales_activities.scheduled_at);
    res.json(rows);
  } catch (err) { next(err); }
});
router.patch("/activities/:id", async (req, res, next) => {
  try {
    const { estado, resultado } = req.body as { estado?: string; resultado?: string };
    if (!estado || !SALES_ACTIVITY_STATUSES.includes(estado as typeof SALES_ACTIVITY_STATUSES[number])) return res.status(400).json({ error: "Estado no valido." });
    const [activity] = await db.select().from(sales_activities).where(eq(sales_activities.id, req.params.id)).limit(1);
    if (!activity) return res.status(404).json({ error: "Actividad no encontrada." });
    const [updated] = await db.update(sales_activities).set({ estado: estado as typeof SALES_ACTIVITY_STATUSES[number], resultado: resultado ?? activity.resultado, completed_at: estado === "completed" ? new Date() : null }).where(eq(sales_activities.id, activity.id)).returning();
    if (activity.account_id) await event(activity.account_id, activity.opportunity_id ?? null, req.userId, "sales_activity_updated", { activity_id: activity.id, estado });
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
