import { useCallback, useEffect, useState } from "react";
import { Building2, CalendarDays, KanbanSquare, Plus, TrendingUp, Users } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const STAGES = ["new_lead", "contacted", "qualified", "discovery", "demo_scheduled", "demo_completed", "quote_sent", "negotiation", "payment_pending", "won", "lost"] as const;
const stageName: Record<string, string> = { new_lead: "Nuevo lead", contacted: "Contactado", qualified: "Calificado", discovery: "Discovery", demo_scheduled: "Demo agendada", demo_completed: "Demo realizada", quote_sent: "Cotizacion enviada", negotiation: "Negociacion", payment_pending: "Pago pendiente", won: "Ganada", lost: "Perdida" };
const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

interface Account { id: string; nombre_comercial: string; tipo: string; potential_acv: string; current_acv: string; }
interface Opportunity { id: string; account_id: string; nombre: string; etapa: string; expected_acv: string; probability: number; next_activity_at: string | null; }
interface Dashboard { revenue: { won_acv_month: number; pipeline_acv: number; weighted_pipeline_acv: number; open_opportunities: number }; funnel: Record<string, number>; }

export default function FundadorSales() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showOpportunity, setShowOpportunity] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, o, d] = await Promise.all([apiFetch<Account[]>("/api/fundador/sales/accounts"), apiFetch<Opportunity[]>("/api/fundador/sales/opportunities"), apiFetch<Dashboard>("/api/fundador/sales/dashboard")]);
      setAccounts(a); setOpportunities(o); setDashboard(d);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el CRM."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createAccount() {
    if (!accountName.trim()) return;
    setSaving(true); setError(null);
    try { await apiFetch("/api/fundador/sales/accounts", { method: "POST", body: JSON.stringify({ nombre_comercial: accountName }) }); setAccountName(""); setShowAccount(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el prospecto."); } finally { setSaving(false); }
  }
  async function createOpportunity() {
    if (!opportunityName.trim() || !accountId) return;
    setSaving(true); setError(null);
    try { await apiFetch("/api/fundador/sales/opportunities", { method: "POST", body: JSON.stringify({ account_id: accountId, nombre: opportunityName }) }); setOpportunityName(""); setShowOpportunity(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear la oportunidad."); } finally { setSaving(false); }
  }
  async function move(opportunity: Opportunity, etapa: string) {
    if (etapa === "lost") { setError("Para marcar una oportunidad como perdida usa su detalle e indica el motivo."); return; }
    try { await apiFetch(`/api/fundador/sales/opportunities/${opportunity.id}/stage`, { method: "PATCH", body: JSON.stringify({ etapa }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar la etapa."); }
  }

  return <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Sales Operating System</p><h1 className="text-2xl font-bold text-slate-900">Fundadores · Ventas</h1></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setShowAccount(!showAccount)}><Building2 className="h-4 w-4" />Nuevo prospecto</Button><Button onClick={() => setShowOpportunity(!showOpportunity)} disabled={!accounts.length}><Plus className="h-4 w-4" />Nueva oportunidad</Button></div></div>
    {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {showAccount && <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end"><div className="min-w-64 flex-1"><Label>Nombre comercial</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Ej. Comercializadora Andina" /></div><Button onClick={() => void createAccount()} disabled={saving || !accountName.trim()}>Guardar prospecto</Button></CardContent></Card>}
    {showOpportunity && <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end"><div className="min-w-56 flex-1"><Label>Cuenta</Label><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">Selecciona</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre_comercial}</option>)}</select></div><div className="min-w-64 flex-1"><Label>Oportunidad</Label><Input value={opportunityName} onChange={(e) => setOpportunityName(e.target.value)} placeholder="Ej. ERP + POS 2026" /></div><Button onClick={() => void createOpportunity()} disabled={saving || !accountId || !opportunityName.trim()}>Crear oportunidad</Button></CardContent></Card>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{label:"ACV ganado este mes",value:dashboard?.revenue.won_acv_month ?? 0, icon:TrendingUp},{label:"Pipeline abierto",value:dashboard?.revenue.pipeline_acv ?? 0,icon:KanbanSquare},{label:"Pipeline ponderado",value:dashboard?.revenue.weighted_pipeline_acv ?? 0,icon:TrendingUp},{label:"Oportunidades abiertas",value:dashboard?.revenue.open_opportunities ?? 0,icon:Users}].map(({label,value,icon:Icon})=><Card key={label}><CardContent className="p-4"><Icon className="h-4 w-4 text-slate-400 mb-2"/><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold">{label.includes("Oportunidades") ? value : cop(value)}</p></CardContent></Card>)}</div>
    <section><div className="flex items-center gap-2 mb-3"><KanbanSquare className="h-5 w-5 text-slate-600"/><h2 className="font-semibold">Pipeline comercial</h2><span className="text-xs text-slate-500">Cada movimiento queda auditado.</span></div><div className="flex gap-3 overflow-x-auto pb-3">{STAGES.map((stage) => <div key={stage} className="w-64 shrink-0 rounded-xl bg-slate-100 p-3"><div className="flex justify-between mb-3"><p className="text-sm font-semibold text-slate-700">{stageName[stage]}</p><Badge variant={stage === "won" ? "green" : stage === "lost" ? "red" : "gray"}>{opportunities.filter((o) => o.etapa === stage).length}</Badge></div><div className="space-y-2">{opportunities.filter((o) => o.etapa === stage).map((o) => <Card key={o.id}><CardContent className="p-3 space-y-2"><p className="font-medium text-sm">{o.nombre}</p><p className="text-xs text-slate-500">{cop(Number(o.expected_acv))} · {o.probability}%</p>{o.next_activity_at && <p className="text-xs text-amber-700 flex gap-1"><CalendarDays className="h-3 w-3" />{new Date(o.next_activity_at).toLocaleDateString("es-CO")}</p>}<select value={o.etapa} onChange={(e) => void move(o, e.target.value)} className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs">{STAGES.filter((s) => s !== "lost").map((s) => <option key={s} value={s}>{stageName[s]}</option>)}</select></CardContent></Card>)}{!opportunities.some((o) => o.etapa === stage) && <p className="py-5 text-center text-xs text-slate-400">Sin oportunidades</p>}</div></div>)}</div></section>
  </div>;
}
