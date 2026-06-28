import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle, Clock,
  Plus, Trash2, CheckCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Metricas {
  arr: number; mrr: number; acv: number;
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
}

interface Contador {
  id: string; nombre: string; email: string;
  empresas_gestionadas: number;
  empresas: { tenant_id: string; nombre: string; plan: string; precio_anual: number }[];
  comision_pendiente: number; comision_pagada: number;
}

interface GastoInterno {
  id: string; concepto: string; proveedor: string | null;
  monto_cop: number; frecuencia: string; activo: boolean; notas: string | null;
}

interface GastosRes { gastos: GastoInterno[]; total_mensual: number; total_anual: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const RIESGO_COLOR = {
  bajo: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medio: "bg-amber-50 text-amber-700 border border-amber-200",
  alto: "bg-red-50 text-red-700 border border-red-200",
};

const RIESGO_LABEL = { bajo: "Activo", medio: "En riesgo", alto: "Crítico" };

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function FundadorAdmin() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [gastosRes, setGastosRes] = useState<GastosRes | null>(null);
  const [loading, setLoading] = useState(true);

  const [showGastoForm, setShowGastoForm] = useState(false);
  const [gastoForm, setGastoForm] = useState({ concepto: "", proveedor: "", monto_cop: "", frecuencia: "mensual", notas: "" });
  const [savingGasto, setSavingGasto] = useState(false);

  const [contadorExpanded, setContadorExpanded] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      const [m, e, c, g] = await Promise.all([
        apiFetch<Metricas>("/api/fundador/metricas"),
        apiFetch<Empresa[]>("/api/fundador/empresas"),
        apiFetch<Contador[]>("/api/fundador/contadores"),
        apiFetch<GastosRes>("/api/fundador/gastos"),
      ]);
      setMetricas(m); setEmpresas(e); setContadores(c); setGastosRes(g);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void cargar(); }, []);

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
    } finally {
      setSavingGasto(false);
    }
  }

  async function toggleGasto(id: string) {
    await apiFetch(`/api/fundador/gastos/${id}/toggle`, { method: "PATCH" });
    const g = await apiFetch<GastosRes>("/api/fundador/gastos");
    setGastosRes(g);
  }

  async function deleteGasto(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await apiFetch(`/api/fundador/gastos/${id}`, { method: "DELETE" });
    const g = await apiFetch<GastosRes>("/api/fundador/gastos");
    setGastosRes(g);
  }

  if (loading || !metricas) {
    return <div className="p-8 text-center text-sm text-gray-400">Cargando panel...</div>;
  }

  const fmtDias = (d: number | null) => d === null ? "Sin actividad" : d === 0 ? "Hoy" : `Hace ${d} días`;
  const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO");

  return (
    <div className="p-6 space-y-6">

      {/* ── KPIs Revenue ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Revenue</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="MRR" value={cop(metricas.mrr)} sub="Ingresos mensuales recurrentes" color="text-emerald-600" />
          <KpiCard label="ARR" value={cop(metricas.arr)} sub="Ingresos anuales recurrentes" color="text-emerald-600" />
          <KpiCard label="ACV promedio" value={cop(metricas.acv)} sub="Valor anual por empresa" />
          <KpiCard
            label="Ganancia estimada"
            value={cop(metricas.ganancia_estimada)}
            sub={`ARR − gastos (${cop(metricas.gastos_anuales)}/año)`}
            color={metricas.ganancia_estimada >= 0 ? "text-emerald-600" : "text-red-600"}
          />
        </div>
      </div>

      {/* ── KPIs Empresas ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Empresas activas" value={String(metricas.empresas_activas)} sub={`${metricas.total_empresas} totales`} />
        <KpiCard label="Nuevas este mes" value={String(metricas.nuevas_este_mes)} color="text-blue-600" />
        <KpiCard label="Vencen en 30 días" value={String(metricas.vencen_pronto)} color={metricas.vencen_pronto > 0 ? "text-amber-600" : undefined} />
        <KpiCard
          label="En riesgo"
          value={`${metricas.empresas_riesgo_alto} críticas / ${metricas.empresas_riesgo_medio} alertas`}
          color={metricas.empresas_riesgo_alto > 0 ? "text-red-600" : "text-amber-600"}
        />
      </div>

      {/* ── Tabla empresas ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Empresas — salud y riesgo
        </h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Plan</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Última actividad</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Fact./30d</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Vence</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Riesgo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {empresas.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{e.nombre}</p>
                      <p className="text-xs text-gray-400">{e.nit} · {e.ciudad ?? ""}</p>
                      {!e.onboarding_completado && (
                        <span className="text-xs text-amber-600 font-medium">⚠ Onboarding incompleto</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{e.plan_nombre}</p>
                      <p className="text-xs text-gray-400">{cop(e.precio_anual)}/año</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDias(e.dias_sin_login)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={e.facturas_ult30 === 0 ? "text-red-600 font-medium" : "text-gray-900"}>
                        {e.facturas_ult30}
                      </span>
                      <p className="text-xs text-gray-400">{e.facturas_total} totales</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={e.dias_plan_vence < 15 ? "text-red-600 font-medium" : e.dias_plan_vence < 30 ? "text-amber-600" : "text-gray-600"}>
                        {e.dias_plan_vence < 0 ? "Vencido" : `${e.dias_plan_vence}d`}
                      </p>
                      <p className="text-xs text-gray-400">{fmtFecha(e.plan_ends_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${RIESGO_COLOR[e.riesgo_nivel]}`}>
                        {e.riesgo_nivel === "alto" && <AlertTriangle className="h-3 w-3" />}
                        {RIESGO_LABEL[e.riesgo_nivel]} ({e.riesgo_score})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {e.correo && <p>{e.correo}</p>}
                      {e.telefono && <p>{e.telefono}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {empresas.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-gray-400">No hay empresas registradas.</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── Bottom split: Gastos + Contadores ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Cuentas por pagar */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Cuentas por pagar (gastos Doravia)
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setShowGastoForm((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar
            </Button>
          </div>

          {showGastoForm && (
            <Card className="mb-3 p-4">
              <form onSubmit={(e) => void handleAddGasto(e)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Concepto *</Label>
                    <Input value={gastoForm.concepto} onChange={(e) => setGastoForm((f) => ({ ...f, concepto: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>Proveedor</Label>
                    <Input value={gastoForm.proveedor} onChange={(e) => setGastoForm((f) => ({ ...f, proveedor: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Monto COP *</Label>
                    <Input type="number" value={gastoForm.monto_cop} onChange={(e) => setGastoForm((f) => ({ ...f, monto_cop: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>Frecuencia *</Label>
                    <select
                      value={gastoForm.frecuencia}
                      onChange={(e) => setGastoForm((f) => ({ ...f, frecuencia: e.target.value }))}
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="mensual">Mensual</option>
                      <option value="anual">Anual</option>
                      <option value="unico">Único</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Notas</Label>
                  <Input value={gastoForm.notas} onChange={(e) => setGastoForm((f) => ({ ...f, notas: e.target.value }))} />
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
                            <button onClick={() => void toggleGasto(g.id)} title={g.activo ? "Pausar" : "Activar"}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded">
                              {g.activo ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                            </button>
                            <button onClick={() => void deleteGasto(g.id)} title="Eliminar"
                              className="p-1 text-gray-400 hover:text-red-500 rounded">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-gray-100 px-4 py-3 flex justify-between text-sm">
                  <span className="text-gray-500">Total mensual: <strong>{cop(gastosRes.total_mensual)}</strong></span>
                  <span className="text-gray-500">Anualizado: <strong>{cop(gastosRes.total_anual)}</strong></span>
                </div>
              </>
            ) : (
              <p className="px-6 py-8 text-center text-sm text-gray-400">Sin gastos registrados. Agrega tus gastos fijos (Railway, ALIADDO, dominios…).</p>
            )}
          </Card>
        </div>

        {/* Contadores */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Contadores aliados
          </h2>
          <Card>
            {contadores.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {contadores.map((c) => (
                  <div key={c.id}>
                    <button
                      onClick={() => setContadorExpanded(contadorExpanded === c.id ? null : c.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{c.nombre}</p>
                        <p className="text-xs text-gray-400">{c.email} · {c.empresas_gestionadas} empresa{c.empresas_gestionadas !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="text-right">
                        {c.comision_pendiente > 0 && (
                          <p className="text-sm font-medium text-amber-700">{cop(c.comision_pendiente)} pendiente</p>
                        )}
                        {c.comision_pagada > 0 && (
                          <p className="text-xs text-gray-400">{cop(c.comision_pagada)} pagado</p>
                        )}
                      </div>
                      {contadorExpanded === c.id
                        ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      }
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
              <p className="px-6 py-8 text-center text-sm text-gray-400">
                Los contadores aparecen aquí cuando gestionan empresas de otros tenants.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
