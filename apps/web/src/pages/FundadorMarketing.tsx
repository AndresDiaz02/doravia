import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Users, TrendingUp, AlertTriangle, MessageSquare, Send,
  PhoneCall, Mail, ArrowUp, ArrowDown, Minus, Star,
  Calendar, Copy, Plus, Trash2, CheckCircle,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MarketingData {
  funnel: { total: number; activas: number; onboarding_completo: number; con_facturas: number; sin_facturas: number; };
  crecimiento: { nuevas_esta_semana: number; nuevas_este_mes: number; mes_anterior: number; variacion_pct: number | null; };
  distribucion_planes: Record<string, number>;
  distribucion_fuentes: Record<string, number>;
  sin_fuente: number;
  empresas_sin_fuente: { id: string; nombre: string }[];
  empresas_para_outreach: OutreachEmpresa[];
}

interface OutreachEmpresa {
  id: string; nombre: string; correo: string | null; telefono: string | null;
  dias_sin_login: number | null; riesgo_nivel: string; riesgo_score: number;
  plan_nombre: string; onboarding_completado: boolean; fuente_adquisicion?: string | null;
}

interface Renovacion {
  id: string; nombre: string; correo: string | null; telefono: string | null;
  plan_ends_at: string; plan_nombre: string; precio_anual: number;
  dias_para_vencer: number; ultimo_pago_confirmado_at: string | null;
}

interface Embajador {
  id: string; nombre: string; correo: string | null; telefono: string | null;
  plan_nombre: string; facturas_total: number; dias_sin_login: number; dias_activo: number;
}

interface Lead {
  id: string; empresa: string; contacto: string | null; email: string | null;
  telefono: string | null; fuente: string | null; etapa: string;
  valor_potencial_cop: number | null; notas: string | null; responsable: string | null;
  created_at: string;
}

interface MsgIA { role: "user" | "assistant"; content: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const ETAPAS_LEAD = [
  { key: "prospecto",     label: "Prospecto",    color: "bg-gray-100 text-gray-600" },
  { key: "interesado",    label: "Interesado",   color: "bg-blue-100 text-blue-700" },
  { key: "demo_agendada", label: "Demo",         color: "bg-violet-100 text-violet-700" },
  { key: "propuesta",     label: "Propuesta",    color: "bg-amber-100 text-amber-700" },
  { key: "convertido",    label: "Convertido ✓", color: "bg-emerald-100 text-emerald-700" },
  { key: "perdido",       label: "Perdido",      color: "bg-red-100 text-red-500" },
] as const;

const FUENTES = ["instagram", "linkedin", "google", "referido_contador", "referido_cliente", "whatsapp", "directo", "otro"];

const PLAN_COLORS = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
const CHAT_KEY = "fundador_ia_historial";

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value} <span className="text-gray-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function buildTemplate(tipo: number, empresa: OutreachEmpresa | null): string {
  const nombre = empresa?.nombre ?? "[Empresa]";
  const dias = empresa?.dias_sin_login ?? "varios";
  if (tipo === 1) {
    return `Hola equipo de ${nombre},\n\nNotamos que no han ingresado a Doravia en los últimos ${dias} días. ¿Podemos ayudarles con algo?\n\nSi tienen dudas sobre facturación electrónica o quieren una sesión de apoyo de 20 minutos, con gusto las agendamos.\n\nQuedamos atentos,\nDoravia`;
  }
  if (tipo === 2) {
    return `Hola equipo de ${nombre},\n\nVimos que aún no han emitido su primera factura electrónica en Doravia.\n\nTenemos una sesión de onboarding de 20 minutos para dejarlos listos. ¿Les agendamos para esta semana?\n\nSaludos,\nDoravia`;
  }
  return `Hola equipo de ${nombre},\n\nSu plan en Doravia está próximo a vencer. Para que continúen facturando sin interrupciones, los invitamos a renovar.\n\n¿Tienen alguna pregunta antes de renovar? Estamos disponibles.\n\nSaludos,\nDoravia`;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function FundadorMarketing() {
  const [data, setData] = useState<MarketingData | null>(null);
  const [renovaciones, setRenovaciones] = useState<Renovacion[]>([]);
  const [embajadores, setEmbajadores] = useState<Embajador[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEmpresa, setSelectedEmpresa] = useState<OutreachEmpresa | null>(null);
  const [templateTipo, setTemplateTipo] = useState(1);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState({ empresa: "", contacto: "", email: "", telefono: "", fuente: "", etapa: "prospecto", valor_potencial_cop: "", notas: "" });
  const [savingLead, setSavingLead] = useState(false);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);

  const [mensajes, setMensajes] = useState<MsgIA[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_KEY);
      if (saved) return JSON.parse(saved) as MsgIA[];
    } catch { /* ignore */ }
    return [{ role: "assistant", content: "Hola Rose 👋 Soy tu asistente de marketing para Doravia. ¿Con qué te ayudo hoy? Puedo darte ideas de contenido, estrategias de retención, copy para campañas o analizar los datos de clientes." }];
  });
  const [inputIA, setInputIA] = useState("");
  const [enviandoIA, setEnviandoIA] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const guardarChat = useCallback((msgs: MsgIA[]) => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<MarketingData>("/api/fundador/marketing"),
      apiFetch<Renovacion[]>("/api/fundador/renovaciones?dias=90"),
      apiFetch<Embajador[]>("/api/fundador/embajadores"),
      apiFetch<Lead[]>("/api/fundador/leads"),
    ]).then(([m, r, e, l]) => {
      setData(m); setRenovaciones(r); setEmbajadores(e); setLeads(l);
    }).catch(() => null).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensajes]);

  async function handleEnviarIA(e: FormEvent) {
    e.preventDefault();
    const pregunta = inputIA.trim();
    if (!pregunta || enviandoIA) return;
    const historial = mensajes.filter((m) => m.role !== "assistant" || mensajes.indexOf(m) > 0);
    const nuevos: MsgIA[] = [...mensajes, { role: "user", content: pregunta }];
    setMensajes(nuevos);
    guardarChat(nuevos);
    setInputIA("");
    setEnviandoIA(true);
    try {
      const contexto = data
        ? `Total empresas: ${data.funnel.total}, activas: ${data.funnel.activas}, con facturas: ${data.funnel.con_facturas}, nuevas este mes: ${data.crecimiento.nuevas_este_mes}, en riesgo: ${data.empresas_para_outreach.length}, distribución planes: ${JSON.stringify(data.distribucion_planes)}, principales fuentes: ${JSON.stringify(data.distribucion_fuentes)}`
        : "";
      const res = await apiFetch<{ respuesta: string }>("/api/fundador/ia", {
        method: "POST",
        body: JSON.stringify({ pregunta, contexto, historial: historial.slice(-8) }),
      });
      const withResp: MsgIA[] = [...nuevos, { role: "assistant", content: res.respuesta }];
      setMensajes(withResp);
      guardarChat(withResp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hubo un error. Intenta de nuevo.";
      const withErr: MsgIA[] = [...nuevos, { role: "assistant", content: `⚠️ ${msg}` }];
      setMensajes(withErr);
    } finally { setEnviandoIA(false); }
  }

  async function handleAddLead(e: FormEvent) {
    e.preventDefault();
    setSavingLead(true);
    try {
      const body = { ...leadForm, valor_potencial_cop: leadForm.valor_potencial_cop ? Number(leadForm.valor_potencial_cop) : undefined };
      if (editLeadId) {
        await apiFetch(`/api/fundador/leads/${editLeadId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/fundador/leads", { method: "POST", body: JSON.stringify(body) });
      }
      setLeadForm({ empresa: "", contacto: "", email: "", telefono: "", fuente: "", etapa: "prospecto", valor_potencial_cop: "", notas: "" });
      setShowLeadForm(false);
      setEditLeadId(null);
      const l = await apiFetch<Lead[]>("/api/fundador/leads");
      setLeads(l);
    } finally { setSavingLead(false); }
  }

  async function deleteLead(id: string) {
    if (!confirm("¿Eliminar este lead?")) return;
    await apiFetch(`/api/fundador/leads/${id}`, { method: "DELETE" });
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  function copyTemplate() {
    const text = buildTemplate(templateTipo, selectedEmpresa);
    void navigator.clipboard.writeText(text);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  }

  if (loading || !data) return <div className="p-8 text-center text-sm text-gray-400">Cargando panel de marketing...</div>;

  const { funnel, crecimiento, distribucion_planes, distribucion_fuentes } = data;
  const totalPlanes = Object.values(distribucion_planes).reduce((s, v) => s + v, 0);
  const variacion = crecimiento.variacion_pct;
  const VariacionIcon = variacion === null ? Minus : variacion > 0 ? ArrowUp : ArrowDown;
  const variacionColor = variacion === null ? "text-gray-400" : variacion > 0 ? "text-emerald-600" : "text-red-600";

  const renov30 = renovaciones.filter((r) => r.dias_para_vencer <= 30);
  const renov31_60 = renovaciones.filter((r) => r.dias_para_vencer > 30 && r.dias_para_vencer <= 60);
  const renov61_90 = renovaciones.filter((r) => r.dias_para_vencer > 60);

  const etapaMap = Object.fromEntries(ETAPAS_LEAD.map((e) => [e.key, e]));

  return (
    <div className="p-6 space-y-8">

      {/* ── Sección 1: Funnel + Crecimiento + Planes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Funnel de conversión</h2>
          <Card className="p-5 space-y-4">
            <FunnelBar label="Registradas" value={funnel.total} total={funnel.total} color="bg-blue-400" />
            <FunnelBar label="Activas" value={funnel.activas} total={funnel.total} color="bg-violet-500" />
            <FunnelBar label="Onboarding completo" value={funnel.onboarding_completo} total={funnel.total} color="bg-emerald-500" />
            <FunnelBar label="Con facturas emitidas" value={funnel.con_facturas} total={funnel.total} color="bg-teal-500" />
            <div className="pt-2 border-t border-gray-100 flex gap-4 text-sm">
              <div className="flex-1 bg-red-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-red-600">{funnel.sin_facturas}</p>
                <p className="text-xs text-red-500">Sin facturas</p>
              </div>
              <div className="flex-1 bg-amber-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-amber-600">{funnel.total - funnel.onboarding_completo}</p>
                <p className="text-xs text-amber-500">Onboarding pendiente</p>
              </div>
              <div className="flex-1 bg-emerald-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-emerald-600">
                  {funnel.total > 0 ? Math.round((funnel.con_facturas / funnel.total) * 100) : 0}%
                </p>
                <p className="text-xs text-emerald-600">Tasa de activación</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Crecimiento</h2>
            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{crecimiento.nuevas_este_mes}</p>
                  <p className="text-xs text-gray-400">Nuevas este mes</p>
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${variacionColor}`}>
                  <VariacionIcon className="h-4 w-4" />
                  {variacion !== null ? `${Math.abs(variacion)}%` : "—"}
                </div>
              </div>
              <p className="text-sm text-gray-600">Esta semana: <strong>{crecimiento.nuevas_esta_semana}</strong></p>
              <p className="text-sm text-gray-600">Mes anterior: <strong>{crecimiento.mes_anterior}</strong></p>
            </Card>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Planes</h2>
            <Card className="p-4 space-y-2">
              {Object.entries(distribucion_planes).map(([plan, n], i) => (
                <div key={plan} className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${PLAN_COLORS[i % PLAN_COLORS.length]}`} />
                  <span className="flex-1 text-sm text-gray-700">{plan}</span>
                  <span className="text-sm font-medium">{n}</span>
                  <span className="text-xs text-gray-400">({totalPlanes > 0 ? Math.round((n / totalPlanes) * 100) : 0}%)</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>

      {/* ── Sección 2: Fuentes de adquisición ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Fuentes de adquisición</h2>
          {data.sin_fuente > 0 && (
            <span className="text-xs text-amber-600 font-medium">{data.sin_fuente} empresa{data.sin_fuente > 1 ? "s" : ""} sin fuente registrada</span>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="space-y-3">
              {Object.entries(distribucion_fuentes).sort(([, a], [, b]) => b - a).map(([fuente, n]) => {
                const pct = funnel.total > 0 ? Math.round((n / funnel.total) * 100) : 0;
                return (
                  <div key={fuente}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 capitalize">{fuente.replace(/_/g, " ")}</span>
                      <span className="font-medium">{n} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {Object.keys(distribucion_fuentes).length === 0 && (
                <p className="text-sm text-gray-400">Sin datos de fuentes todavía.</p>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Empresas sin fuente asignada</p>
            {data.empresas_sin_fuente.length > 0 ? (
              <div className="space-y-1 text-sm text-gray-600">
                {data.empresas_sin_fuente.slice(0, 8).map((e) => (
                  <p key={e.id} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-300 inline-block" />
                    {e.nombre}
                  </p>
                ))}
                {data.empresas_sin_fuente.length > 8 && (
                  <p className="text-xs text-gray-400">+ {data.empresas_sin_fuente.length - 8} más</p>
                )}
                <p className="text-xs text-gray-400 mt-2">Edita la fuente desde el panel Admin → tabla de empresas.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle className="h-4 w-4" />
                <p className="text-sm">Todas las empresas tienen fuente registrada.</p>
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── Sección 3: Calendario de renovaciones ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-gray-400" />
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Calendario de renovaciones (próximos 90 días)</h2>
        </div>
        {renovaciones.length === 0 ? (
          <Card><p className="px-6 py-8 text-center text-sm text-gray-400">No hay renovaciones en los próximos 90 días.</p></Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { label: "0–30 días (urgente)", items: renov30, border: "border-red-200", badge: "bg-red-50 text-red-700" },
              { label: "31–60 días", items: renov31_60, border: "border-amber-200", badge: "bg-amber-50 text-amber-700" },
              { label: "61–90 días", items: renov61_90, border: "border-blue-200", badge: "bg-blue-50 text-blue-700" },
            ].map((grupo) => (
              <div key={grupo.label}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{grupo.label} ({grupo.items.length})</p>
                <div className="space-y-2">
                  {grupo.items.map((r) => (
                    <div key={r.id} className={`bg-white rounded-lg border ${grupo.border} p-3`}>
                      <p className="font-medium text-gray-900 text-sm">{r.nombre}</p>
                      <p className="text-xs text-gray-400">{r.plan_nombre} · {cop(r.precio_anual)}/año</p>
                      <p className="text-xs text-gray-500 mt-1">Vence: {new Date(r.plan_ends_at).toLocaleDateString("es-CO")}</p>
                      <div className="flex gap-2 mt-2">
                        {r.correo && (
                          <a href={`mailto:${r.correo}?subject=Renovación Doravia&body=Hola equipo de ${r.nombre},%0A%0ASu plan vence pronto. ¿Renovamos?%0A%0ASaludos,%0ADoravia`}
                            className="text-xs text-action hover:underline flex items-center gap-1">
                            <Mail className="h-3 w-3" />Email
                          </a>
                        )}
                        {r.telefono && (
                          <a href={`tel:${r.telefono}`} className="text-xs text-action hover:underline flex items-center gap-1">
                            <PhoneCall className="h-3 w-3" />{r.telefono}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {grupo.items.length === 0 && (
                    <div className={`rounded-lg border ${grupo.border} p-3 text-center text-xs text-gray-400`}>Sin renovaciones</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sección 4: Embajadores ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Clientes embajadores — candidatos a testimonio</h2>
        </div>
        <Card>
          {embajadores.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {embajadores.map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{e.nombre}</p>
                    <p className="text-xs text-gray-400">{e.plan_nombre} · {e.facturas_total} facturas · activo hace {e.dias_activo}d</p>
                  </div>
                  <div className="flex gap-2">
                    {e.correo && (
                      <a
                        href={`mailto:${e.correo}?subject=¡Nos gustaría contar tu historia!&body=Hola equipo de ${e.nombre},%0A%0AHemos visto que son usuarios muy activos de Doravia y nos encantaría contar su experiencia.%0A%0A¿Estarían dispuestos a compartir un testimonio o ser parte de un caso de éxito?%0A%0ASaludos,%0AEquipo Doravia`}
                        className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100 flex items-center gap-1"
                      >
                        <Star className="h-3 w-3" />
                        Pedir testimonio
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center">
              <Star className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Los embajadores aparecen cuando una empresa tiene más de 5 facturas y actividad reciente.</p>
            </div>
          )}
        </Card>
      </section>

      {/* ── Sección 5 + 6: Leads + Templates ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pipeline de leads */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Pipeline de leads</h2>
            <Button size="sm" variant="secondary" onClick={() => { setShowLeadForm((v) => !v); setEditLeadId(null); setLeadForm({ empresa: "", contacto: "", email: "", telefono: "", fuente: "", etapa: "prospecto", valor_potencial_cop: "", notas: "" }); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />Nuevo lead
            </Button>
          </div>

          {showLeadForm && (
            <Card className="mb-3 p-4">
              <form onSubmit={(e) => void handleAddLead(e)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Empresa *</Label><Input value={leadForm.empresa} onChange={(e) => setLeadForm((f) => ({ ...f, empresa: e.target.value }))} required /></div>
                  <div><Label>Contacto</Label><Input value={leadForm.contacto} onChange={(e) => setLeadForm((f) => ({ ...f, contacto: e.target.value }))} /></div>
                  <div><Label>Email</Label><Input type="email" value={leadForm.email} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} /></div>
                  <div><Label>Teléfono</Label><Input value={leadForm.telefono} onChange={(e) => setLeadForm((f) => ({ ...f, telefono: e.target.value }))} /></div>
                  <div>
                    <Label>Fuente</Label>
                    <select value={leadForm.fuente} onChange={(e) => setLeadForm((f) => ({ ...f, fuente: e.target.value }))} className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                      <option value="">— Seleccionar —</option>
                      {FUENTES.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Etapa</Label>
                    <select value={leadForm.etapa} onChange={(e) => setLeadForm((f) => ({ ...f, etapa: e.target.value }))} className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                      {ETAPAS_LEAD.map((et) => <option key={et.key} value={et.key}>{et.label}</option>)}
                    </select>
                  </div>
                  <div><Label>Valor potencial (COP)</Label><Input type="number" value={leadForm.valor_potencial_cop} onChange={(e) => setLeadForm((f) => ({ ...f, valor_potencial_cop: e.target.value }))} /></div>
                  <div><Label>Notas</Label><Input value={leadForm.notas} onChange={(e) => setLeadForm((f) => ({ ...f, notas: e.target.value }))} /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => { setShowLeadForm(false); setEditLeadId(null); }}>Cancelar</Button>
                  <Button type="submit" disabled={savingLead}>{savingLead ? "Guardando..." : editLeadId ? "Actualizar" : "Agregar"}</Button>
                </div>
              </form>
            </Card>
          )}

          <Card>
            {leads.length > 0 ? (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {leads.map((l) => {
                  const et = etapaMap[l.etapa];
                  return (
                    <div key={l.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-gray-900 text-sm truncate">{l.empresa}</p>
                          <span className={`text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${et?.color ?? "bg-gray-100 text-gray-600"}`}>{et?.label ?? l.etapa}</span>
                        </div>
                        {l.contacto && <p className="text-xs text-gray-500">{l.contacto}</p>}
                        {l.fuente && <p className="text-xs text-gray-400 capitalize">{l.fuente.replace(/_/g, " ")}</p>}
                        {l.valor_potencial_cop && <p className="text-xs text-blue-600">{cop(l.valor_potencial_cop)}</p>}
                        {l.notas && <p className="text-xs text-gray-400 italic truncate">{l.notas}</p>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {l.email && <a href={`mailto:${l.email}`} className="p-1 text-gray-400 hover:text-action"><Mail className="h-3.5 w-3.5" /></a>}
                        {l.telefono && <a href={`tel:${l.telefono}`} className="p-1 text-gray-400 hover:text-action"><PhoneCall className="h-3.5 w-3.5" /></a>}
                        <button onClick={() => { setEditLeadId(l.id); setLeadForm({ empresa: l.empresa, contacto: l.contacto ?? "", email: l.email ?? "", telefono: l.telefono ?? "", fuente: l.fuente ?? "", etapa: l.etapa, valor_potencial_cop: l.valor_potencial_cop ? String(l.valor_potencial_cop) : "", notas: l.notas ?? "" }); setShowLeadForm(true); }} className="p-1 text-gray-400 hover:text-gray-700">
                          <TrendingUp className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => void deleteLead(l.id)} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-6 py-10 text-center text-sm text-gray-400">Sin leads registrados. Agrega tus primeros prospectos.</p>
            )}
          </Card>
        </section>

        {/* Templates de outreach */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Templates de outreach</h2>
          <Card className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 1, label: "Sin actividad" },
                { id: 2, label: "Sin facturas" },
                { id: 3, label: "Renovación" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateTipo(t.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${templateTipo === t.id ? "border-slate-700 bg-slate-800 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div>
              <Label className="text-xs mb-1">Empresa (para personalizar)</Label>
              <select
                value={selectedEmpresa?.id ?? ""}
                onChange={(e) => setSelectedEmpresa(data.empresas_para_outreach.find((emp) => emp.id === e.target.value) ?? null)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Sin empresa (genérico) —</option>
                {data.empresas_para_outreach.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {buildTemplate(templateTipo, selectedEmpresa)}
              </pre>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copyTemplate} className="flex-1">
                {copiedTemplate ? <><CheckCircle className="h-4 w-4 mr-1 text-emerald-600" />¡Copiado!</> : <><Copy className="h-4 w-4 mr-1" />Copiar</>}
              </Button>
              {selectedEmpresa?.correo && (
                <Button size="sm" className="flex-1"
                  onClick={() => {
                    const body = encodeURIComponent(buildTemplate(templateTipo, selectedEmpresa));
                    window.open(`mailto:${selectedEmpresa.correo}?subject=Doravia - Te extrañamos&body=${body}`, "_blank");
                  }}>
                  <Mail className="h-4 w-4 mr-1" />Enviar email
                </Button>
              )}
            </div>
          </Card>
        </section>
      </div>

      {/* ── Sección 7: Empresas para contactar ── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Empresas en riesgo para contactar ({data.empresas_para_outreach.length})
        </h2>
        <Card>
          {data.empresas_para_outreach.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {data.empresas_para_outreach.map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                  {e.riesgo_nivel === "alto"
                    ? <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    : <TrendingUp className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{e.nombre}</p>
                    <p className="text-xs text-gray-400">
                      {e.plan_nombre} · {e.dias_sin_login !== null ? `sin actividad ${e.dias_sin_login}d` : "sin actividad"}
                      {!e.onboarding_completado && " · onboarding pendiente"}
                    </p>
                    <div className="flex gap-3 mt-1">
                      {e.correo && <a href={`mailto:${e.correo}`} className="flex items-center gap-1 text-xs text-action hover:underline"><Mail className="h-3 w-3" />{e.correo}</a>}
                      {e.telefono && <a href={`tel:${e.telefono}`} className="flex items-center gap-1 text-xs text-action hover:underline"><PhoneCall className="h-3 w-3" />{e.telefono}</a>}
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedEmpresa(e); setTemplateTipo(e.dias_sin_login !== null && e.dias_sin_login > 14 ? 1 : 2); document.getElementById("templates-section")?.scrollIntoView({ behavior: "smooth" }); }}
                    className="text-xs text-slate-600 hover:text-slate-800 border border-gray-200 rounded px-2 py-1 flex-shrink-0"
                  >
                    Usar template
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <Users className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">¡Todas las empresas están activas y saludables!</p>
            </div>
          )}
        </Card>
      </section>

      {/* ── Sección 8: Asistente IA ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />Asistente IA — Marketing Doravia
          </h2>
          <button onClick={() => { const reset = [{ role: "assistant" as const, content: "Chat reiniciado. ¿En qué te ayudo?" }]; setMensajes(reset); guardarChat(reset); }} className="text-xs text-gray-400 hover:text-gray-600">
            Limpiar chat
          </button>
        </div>
        <Card className="flex flex-col" style={{ height: "380px" }}>
          <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-800"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {enviandoIA && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-400 animate-pulse">Pensando...</div>
              </div>
            )}
          </div>
          <form onSubmit={(e) => void handleEnviarIA(e)} className="border-t border-gray-100 p-3 flex gap-2">
            <Input value={inputIA} onChange={(e) => setInputIA(e.target.value)} placeholder="Ej: Dame 3 ideas de posts para empresas pyme..." disabled={enviandoIA} className="flex-1" />
            <Button type="submit" disabled={enviandoIA || !inputIA.trim()} size="sm"><Send className="h-4 w-4" /></Button>
          </form>
        </Card>
      </section>
    </div>
  );
}
