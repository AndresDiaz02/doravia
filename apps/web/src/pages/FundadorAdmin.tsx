import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle, Clock, Plus, Trash2, CheckCircle,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  DollarSign, CheckSquare, Phone, Mail,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Metricas {
  arr: number; mrr: number; acv: number; ltv_estimado: number | null;
  mrr_nuevo: number; mrr_churned_aprox: number; mrr_neto: number;
  revenue_confirmado_mes: number; revenue_pendiente_mes: number;
  cac_promedio: number | null; payback_meses: number | null;
  total_empresas: number; empresas_activas: number; nuevas_este_mes: number;
  vencen_pronto: number; gastos_anuales: number; ganancia_estimada: number;
  empresas_riesgo_alto: number; empresas_riesgo_medio: number;
}

interface Empresa {
  id: string; nombre: string; nit: string; activo: boolean;
  correo: string | null; telefono: string | null; ciudad: string | null;
  plan_nombre: string; precio_anual: number;
  ultimo_login: string | null; dias_sin_login: number | null;
  facturas_ult30: number; facturas_total: number; dias_plan_vence: number;
  riesgo_score: number; riesgo_nivel: "bajo" | "medio" | "alto";
  plan_ends_at: string; onboarding_completado: boolean;
  fuente_adquisicion: string | null; cac_cop: number | null;
  ltv_estimado: number | null; ultimo_pago_confirmado_at: string | null;
}

interface RetencionRow {
  id: string; etapa: string; notas: string | null; responsable: string | null;
  proxima_accion_at: string | null; updated_at: string;
  tenant_id: string; tenant_nombre: string;
  correo: string | null; telefono: string | null;
  plan_nombre: string; precio_anual: number; plan_ends_at: string;
}

interface Contador {
  id: string; nombre: string; email: string;
  empresas_gestionadas: number;
  empresas: { tenant_id: string; nombre: string; plan: string; precio_anual: number }[];
  comision_pendiente: number; comision_pagada: number;
}

interface GastoInterno {
  id: string; concepto: string; proveedor: string | null;
  monto_cop: number; frecuencia: string; activo: boolean;
}
interface GastosRes { gastos: GastoInterno[]; total_mensual: number; total_anual: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const RIESGO_CSS = {
  bajo: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medio: "bg-amber-50 text-amber-700 border border-amber-200",
  alto: "bg-red-50 text-red-700 border border-red-200",
};
const RIESGO_LABEL = { bajo: "Activo", medio: "En riesgo", alto: "Crítico" };

const ETAPAS_RETENCION = [
  { key: "en_riesgo",       label: "En riesgo",       color: "bg-red-100 text-red-700" },
  { key: "contactado",      label: "Contactado",       color: "bg-amber-100 text-amber-700" },
  { key: "en_negociacion",  label: "Negociación",      color: "bg-blue-100 text-blue-700" },
  { key: "renovado",        label: "Renovado ✓",       color: "bg-emerald-100 text-emerald-700" },
  { key: "cancelado",       label: "Cancelado ✗",      color: "bg-gray-100 text-gray-500" },
] as const;

function KpiCard({ label, value, sub, color, note }: { label: string; value: string; sub?: string; color?: string; note?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      {note && <p className="text-xs text-amber-600 font-medium">{note}</p>}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function FundadorAdmin() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [retencion, setRetencion] = useState<RetencionRow[]>([]);
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [gastosRes, setGastosRes] = useState<GastosRes | null>(null);
  const [loading, setLoading] = useState(true);

  const [etapaFiltro, setEtapaFiltro] = useState<string>("en_riesgo");
  const [editandoRet, setEditandoRet] = useState<string | null>(null);
  const [retNota, setRetNota] = useState("");

  const [showGastoForm, setShowGastoForm] = useState(false);
  const [gastoForm, setGastoForm] = useState({ concepto: "", proveedor: "", monto_cop: "", frecuencia: "mensual", notas: "" });
  const [savingGasto, setSavingGasto] = useState(false);

  const [contadorExpanded, setContadorExpanded] = useState<string | null>(null);
  const [editMetaId, setEditMetaId] = useState<string | null>(null);
  const [metaForm, setMetaForm] = useState({ fuente_adquisicion: "", cac_cop: "" });

  const FUENTES = ["instagram", "linkedin", "google", "referido_contador", "referido_cliente", "whatsapp", "directo", "otro"];

  async function cargar() {
    setLoading(true);
    try {
      const [m, e, r, c, g] = await Promise.all([
        apiFetch<Metricas>("/api/fundador/metricas"),
        apiFetch<Empresa[]>("/api/fundador/empresas"),
        apiFetch<RetencionRow[]>("/api/fundador/retencion"),
        apiFetch<Contador[]>("/api/fundador/contadores"),
        apiFetch<GastosRes>("/api/fundador/gastos"),
      ]);
      setMetricas(m); setEmpresas(e); setRetencion(r); setContadores(c); setGastosRes(g);
    } finally { setLoading(false); }
  }

  useEffect(() => { void cargar(); }, []);

  async function agregarARetencion(empresa: Empresa) {
    await apiFetch("/api/fundador/retencion", { method: "POST", body: JSON.stringify({ tenant_id: empresa.id }) });
    const r = await apiFetch<RetencionRow[]>("/api/fundador/retencion");
    setRetencion(r);
  }

  async function cambiarEtapa(tenantId: string, etapa: string, notas?: string) {
    await apiFetch("/api/fundador/retencion", {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId, etapa, notas }),
    });
    const r = await apiFetch<RetencionRow[]>("/api/fundador/retencion");
    setRetencion(r);
    setEditandoRet(null);
  }

  async function confirmarPago(id: string) {
    await apiFetch(`/api/fundador/empresas/${id}/confirmar-pago`, { method: "PATCH" });
    const e = await apiFetch<Empresa[]>("/api/fundador/empresas");
    setEmpresas(e);
  }

  async function guardarMeta(id: string) {
    await apiFetch(`/api/fundador/empresas/${id}/meta`, {
      method: "PATCH",
      body: JSON.stringify({
        fuente_adquisicion: metaForm.fuente_adquisicion || undefined,
        cac_cop: metaForm.cac_cop ? Number(metaForm.cac_cop) : undefined,
      }),
    });
    setEditMetaId(null);
    const e = await apiFetch<Empresa[]>("/api/fundador/empresas");
    setEmpresas(e);
  }

  async function handleAddGasto(e: FormEvent) {
    e.preventDefault();
    setSavingGasto(true);
    try {
      await apiFetch("/api/fundador/gastos", {
        method: "POST",
        body: JSON.stringify({ ...gastoForm, monto_cop: Number(gastoForm.monto_cop) }),
      });
      setGastoForm({ concepto: "", proveedor: "", monto_cop: "", frecuencia: "mensual", notas: "" });
      setShowGastoForm(false);
      const g = await apiFetch<GastosRes>("/api/fundador/gastos");
      setGastosRes(g);
    } finally { setSavingGasto(false); }
  }

  if (loading || !metricas) return <div className="p-8 text-center text-sm text-gray-400">Cargando panel...</div>;

  const fmtDias = (d: number | null) => d === null ? "Sin actividad" : d === 0 ? "Hoy" : `Hace ${d}d`;
  const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO");

  const empresasEnPipeline = new Set(retencion.map((r) => r.tenant_id));
  const empresasRiesgo = empresas.filter((e) => e.riesgo_nivel !== "bajo" && !empresasEnPipeline.has(e.id));
  const retFiltradas = retencion.filter((r) => r.etapa === etapaFiltro);

  const conteoEtapa = Object.fromEntries(
    ETAPAS_RETENCION.map((e) => [e.key, retencion.filter((r) => r.etapa === e.key).length]),
  );
  const mrrEtapa = Object.fromEntries(
    ETAPAS_RETENCION.map((e) => [
      e.key,
      Math.round(retencion.filter((r) => r.etapa === e.key).reduce((s, r) => s + r.precio_anual / 12, 0)),
    ]),
  );

  return (
    <div className="p-6 space-y-8">

      {/* ── Sección 1: Revenue ── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Revenue</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiCard label="MRR" value={cop(metricas.mrr)} sub="Ingresos mensuales" color="text-emerald-600" />
          <KpiCard label="ARR" value={cop(metricas.arr)} sub="Ingresos anuales" color="text-emerald-600" />
          <KpiCard label="ACV promedio" value={cop(metricas.acv)} sub="Valor anual por empresa" />
          <KpiCard
            label="Ganancia estimada"
            value={cop(metricas.ganancia_estimada)}
            sub={`Gastos: ${cop(metricas.gastos_anuales)}/año`}
            color={metricas.ganancia_estimada >= 0 ? "text-emerald-600" : "text-red-600"}
          />
        </div>

        {/* MRR Movements */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">MRR nuevo</p>
              <p className="text-lg font-bold text-emerald-600">{cop(metricas.mrr_nuevo)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400">MRR churned</p>
              <p className="text-lg font-bold text-red-500">{cop(metricas.mrr_churned_aprox)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <DollarSign className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Pagos confirmados</p>
              <p className="text-lg font-bold text-blue-600">{cop(metricas.revenue_confirmado_mes)}</p>
              {metricas.revenue_pendiente_mes > 0 && (
                <p className="text-xs text-amber-600">{cop(metricas.revenue_pendiente_mes)} pendiente</p>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
              <CheckSquare className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">LTV estimado</p>
              <p className="text-lg font-bold text-slate-700">
                {metricas.ltv_estimado ? cop(metricas.ltv_estimado) : "—"}
              </p>
              {metricas.cac_promedio && (
                <p className="text-xs text-gray-400">CAC prom: {cop(metricas.cac_promedio)}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Sección 2: Snapshot ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Empresas activas" value={String(metricas.empresas_activas)} sub={`${metricas.total_empresas} totales`} />
        <KpiCard label="Nuevas este mes" value={String(metricas.nuevas_este_mes)} color="text-blue-600" />
        <KpiCard label="Vencen en 30 días" value={String(metricas.vencen_pronto)} color={metricas.vencen_pronto > 0 ? "text-amber-600" : undefined} />
        <KpiCard
          label="Riesgo"
          value={`${metricas.empresas_riesgo_alto} críticas`}
          sub={`${metricas.empresas_riesgo_medio} en alerta`}
          color={metricas.empresas_riesgo_alto > 0 ? "text-red-600" : "text-amber-600"}
        />
      </div>

      {/* ── Sección 3: Pipeline de retención ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Pipeline de retención</h2>
        </div>

        {/* Stage summary cards */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {ETAPAS_RETENCION.map((e) => (
            <button
              key={e.key}
              onClick={() => setEtapaFiltro(e.key)}
              className={`rounded-xl border p-3 text-left transition-all ${
                etapaFiltro === e.key ? "border-slate-400 shadow-md" : "border-gray-200 hover:border-gray-300"
              } bg-white`}
            >
              <p className="text-xs text-gray-400 mb-1">{e.label}</p>
              <p className="text-xl font-bold text-gray-900">{conteoEtapa[e.key] ?? 0}</p>
              <p className="text-xs text-gray-400">{cop(mrrEtapa[e.key] ?? 0)}/mes</p>
            </button>
          ))}
        </div>

        {/* Empresas sin pipeline todavía (en riesgo pero sin seguimiento) */}
        {empresasRiesgo.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800 mb-2">
              {empresasRiesgo.length} empresa{empresasRiesgo.length > 1 ? "s" : ""} en riesgo sin seguimiento:
            </p>
            <div className="flex flex-wrap gap-2">
              {empresasRiesgo.map((e) => (
                <button
                  key={e.id}
                  onClick={() => void agregarARetencion(e)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${RIESGO_CSS[e.riesgo_nivel]}`}
                >
                  {e.nombre}
                  <Plus className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de seguimientos por etapa */}
        <Card>
          {retFiltradas.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Plan / MRR</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Vence</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Notas</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Mover a</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Contactar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {retFiltradas.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.tenant_nombre}</p>
                      <p className="text-xs text-gray-400">Actualizado: {fmtFecha(r.updated_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{r.plan_nombre}</p>
                      <p className="text-xs text-gray-400">{cop(Math.round(r.precio_anual / 12))}/mes</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmtFecha(r.plan_ends_at)}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {editandoRet === r.tenant_id ? (
                        <div className="flex gap-1">
                          <input
                            className="text-xs border rounded px-2 py-1 w-full"
                            value={retNota}
                            onChange={(e) => setRetNota(e.target.value)}
                            placeholder="Agregar nota..."
                            autoFocus
                          />
                          <button
                            onClick={() => void cambiarEtapa(r.tenant_id, r.etapa, retNota)}
                            className="text-xs text-action hover:underline whitespace-nowrap"
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        <p
                          onClick={() => { setEditandoRet(r.tenant_id); setRetNota(r.notas ?? ""); }}
                          className="text-xs text-gray-500 cursor-pointer hover:text-action"
                        >
                          {r.notas || <span className="italic text-gray-300">+ agregar nota</span>}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={r.etapa}
                        onChange={(e) => void cambiarEtapa(r.tenant_id, e.target.value)}
                        className="text-xs border rounded px-2 py-1 bg-white"
                      >
                        {ETAPAS_RETENCION.map((et) => (
                          <option key={et.key} value={et.key}>{et.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {r.correo && (
                          <a href={`mailto:${r.correo}`} className="text-action hover:underline" title={r.correo}>
                            <Mail className="h-4 w-4" />
                          </a>
                        )}
                        {r.telefono && (
                          <a href={`tel:${r.telefono}`} className="text-action hover:underline" title={r.telefono}>
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              No hay empresas en esta etapa.
              {etapaFiltro === "en_riesgo" && empresasRiesgo.length > 0 && " Usa los botones de arriba para agregar."}
            </p>
          )}
        </Card>
      </section>

      {/* ── Sección 4: Tabla empresas (con LTV/CAC/fuente/pago confirmado) ── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Empresas — detalle</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Plan</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Actividad</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Fact./30d</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Fuente / CAC</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Pago</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Riesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {empresas.map((e) => (
                  <>
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{e.nombre}</p>
                        <p className="text-xs text-gray-400">{e.nit}</p>
                        {!e.onboarding_completado && <p className="text-xs text-amber-600">⚠ Onboarding incompleto</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{e.plan_nombre}</p>
                        <p className="text-xs text-gray-400">{cop(e.precio_anual)}/año</p>
                        {e.ltv_estimado && <p className="text-xs text-blue-500">LTV ~{cop(e.ltv_estimado)}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmtDias(e.dias_sin_login)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={e.facturas_ult30 === 0 ? "text-red-600 font-medium" : "text-gray-900"}>
                          {e.facturas_ult30}
                        </span>
                        <p className="text-xs text-gray-400">{e.facturas_total} totales</p>
                      </td>
                      <td className="px-4 py-3">
                        {editMetaId === e.id ? (
                          <div className="space-y-1">
                            <select
                              value={metaForm.fuente_adquisicion}
                              onChange={(ev) => setMetaForm((f) => ({ ...f, fuente_adquisicion: ev.target.value }))}
                              className="text-xs border rounded px-2 py-1 w-full bg-white"
                            >
                              <option value="">-- Fuente --</option>
                              {FUENTES.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <input
                              type="number"
                              placeholder="CAC (COP)"
                              value={metaForm.cac_cop}
                              onChange={(ev) => setMetaForm((f) => ({ ...f, cac_cop: ev.target.value }))}
                              className="text-xs border rounded px-2 py-1 w-full"
                            />
                            <div className="flex gap-1">
                              <button onClick={() => void guardarMeta(e.id)} className="text-xs text-action hover:underline">Guardar</button>
                              <button onClick={() => setEditMetaId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => { setEditMetaId(e.id); setMetaForm({ fuente_adquisicion: e.fuente_adquisicion ?? "", cac_cop: e.cac_cop ? String(e.cac_cop) : "" }); }}
                            className="cursor-pointer hover:text-action"
                          >
                            <p className="text-xs text-gray-700">{e.fuente_adquisicion ?? <span className="italic text-gray-300">sin fuente</span>}</p>
                            {e.cac_cop && <p className="text-xs text-gray-400">CAC: {cop(e.cac_cop)}</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {e.ultimo_pago_confirmado_at ? (
                          <div>
                            <p className="text-xs text-emerald-600 font-medium">✓ Confirmado</p>
                            <p className="text-xs text-gray-400">{fmtFecha(e.ultimo_pago_confirmado_at)}</p>
                          </div>
                        ) : (
                          <button
                            onClick={() => void confirmarPago(e.id)}
                            className="text-xs text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            Confirmar pago
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${RIESGO_CSS[e.riesgo_nivel]}`}>
                          {e.riesgo_nivel === "alto" && <AlertTriangle className="h-3 w-3" />}
                          {RIESGO_LABEL[e.riesgo_nivel]}
                        </span>
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* ── Sección 5: Gastos + Contadores ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Gastos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Gastos fijos Doravia</h2>
            <Button size="sm" variant="secondary" onClick={() => setShowGastoForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Agregar
            </Button>
          </div>
          {showGastoForm && (
            <Card className="mb-3 p-4">
              <form onSubmit={(e) => void handleAddGasto(e)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Concepto *</Label><Input value={gastoForm.concepto} onChange={(e) => setGastoForm((f) => ({ ...f, concepto: e.target.value }))} required /></div>
                  <div><Label>Proveedor</Label><Input value={gastoForm.proveedor} onChange={(e) => setGastoForm((f) => ({ ...f, proveedor: e.target.value }))} /></div>
                  <div><Label>Monto COP *</Label><Input type="number" value={gastoForm.monto_cop} onChange={(e) => setGastoForm((f) => ({ ...f, monto_cop: e.target.value }))} required /></div>
                  <div>
                    <Label>Frecuencia *</Label>
                    <select value={gastoForm.frecuencia} onChange={(e) => setGastoForm((f) => ({ ...f, frecuencia: e.target.value }))} className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                      <option value="mensual">Mensual</option>
                      <option value="anual">Anual</option>
                      <option value="unico">Único</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowGastoForm(false)}>Cancelar</Button>
                  <Button type="submit" disabled={savingGasto}>{savingGasto ? "Guardando..." : "Guardar"}</Button>
                </div>
              </form>
            </Card>
          )}
          <Card>
            {gastosRes && gastosRes.gastos.length > 0 ? (
              <>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Concepto</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Monto</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Frec.</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {gastosRes.gastos.map((g) => (
                      <tr key={g.id} className={g.activo ? "" : "opacity-40"}>
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900">{g.concepto}</p>
                          {g.proveedor && <p className="text-xs text-gray-400">{g.proveedor}</p>}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-900">{cop(g.monto_cop)}</td>
                        <td className="px-4 py-2 text-gray-500 capitalize">{g.frecuencia}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => void apiFetch(`/api/fundador/gastos/${g.id}/toggle`, { method: "PATCH" }).then(() => apiFetch<GastosRes>("/api/fundador/gastos").then(setGastosRes))} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                              {g.activo ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                            </button>
                            <button onClick={() => { if (confirm("¿Eliminar?")) void apiFetch(`/api/fundador/gastos/${g.id}`, { method: "DELETE" }).then(() => apiFetch<GastosRes>("/api/fundador/gastos").then(setGastosRes)); }} className="p-1 text-gray-400 hover:text-red-500 rounded">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-gray-100 px-4 py-3 flex justify-between text-sm">
                  <span className="text-gray-500">Mensual: <strong>{cop(gastosRes.total_mensual)}</strong></span>
                  <span className="text-gray-500">Anualizado: <strong>{cop(gastosRes.total_anual)}</strong></span>
                </div>
              </>
            ) : (
              <p className="px-6 py-8 text-center text-sm text-gray-400">Sin gastos. Agrega Railway, ALIADDO, dominio…</p>
            )}
          </Card>
        </div>

        {/* Contadores */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contadores aliados</h2>
          <Card>
            {contadores.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {contadores.map((c) => (
                  <div key={c.id}>
                    <button onClick={() => setContadorExpanded(contadorExpanded === c.id ? null : c.id)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{c.nombre}</p>
                        <p className="text-xs text-gray-400">{c.email} · {c.empresas_gestionadas} empresa{c.empresas_gestionadas !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="text-right">
                        {c.comision_pendiente > 0 && <p className="text-sm font-medium text-amber-700">{cop(c.comision_pendiente)} pendiente</p>}
                        {c.comision_pagada > 0 && <p className="text-xs text-gray-400">{cop(c.comision_pagada)} pagado</p>}
                      </div>
                      {contadorExpanded === c.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </button>
                    {contadorExpanded === c.id && (
                      <div className="px-4 pb-3 bg-gray-50">
                        {c.empresas.map((emp) => (
                          <div key={emp.tenant_id} className="flex items-center justify-between py-1 text-sm">
                            <p className="text-gray-700">{emp.nombre}</p>
                            <p className="text-gray-400">{emp.plan} · {cop(emp.precio_anual)}/año</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-6 py-8 text-center text-sm text-gray-400">Los contadores aparecen cuando gestionan empresas de otros tenants.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
