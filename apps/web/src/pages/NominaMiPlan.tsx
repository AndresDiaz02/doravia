import { useEffect, useState, type FormEvent } from "react";
import { Calendar, CheckCircle2, CircleAlert, FileText } from "lucide-react";
import { apiFetch, ApiError, fecha } from "../lib/api";
import { Card } from "../components/ui/card";
import { NominaBanner } from "../components/NominaBanner";

interface PoolNomina {
  plan_slug: string;
  documentos_incluidos: number;
  documentos_consumidos_ciclo: number;
  documentos_acumulados_previos: number;
  documentos_adicionales_comprados: number;
  documentos_disponibles: number;
  fecha_renovacion: string;
  limite_acumulacion: number;
}

interface AlistamientoPlemsi {
  ambiente: "pruebas" | "produccion";
  token_configurado: boolean;
  habilitado: boolean;
  numeracion_individual_configurada: boolean;
  numeracion_ajuste_configurada: boolean;
  empleados_incompletos: Array<{ id: string; nombre: string }>;
  listo_para_prueba: boolean;
  resolucion_individual: string; prefijo_individual: string; siguiente_numero_individual: number;
  resolucion_ajuste: string; prefijo_ajuste: string; siguiente_numero_ajuste: number;
}

const PLAN_LABEL: Record<string, string> = {
  nomina_semilla: "Nómina Semilla",
  nomina_raiz: "Nómina Raíz",
  nomina_brote: "Nómina Brote",
  nomina_plus: "Nómina Plus",
  nomina_pro: "Nómina Pro",
};

export default function NominaMiPlan() {
  const [pool, setPool] = useState<PoolNomina | null>(null);
  const [activa, setActiva] = useState(true);
  const [loading, setLoading] = useState(true);
  const [alistamiento, setAlistamiento] = useState<AlistamientoPlemsi | null>(null);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ token: "", resolucion_individual: "", prefijo_individual: "", siguiente_numero_individual: "1", resolucion_ajuste: "", prefijo_ajuste: "", siguiente_numero_ajuste: "1", habilitado: false });
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    apiFetch<PoolNomina>("/api/nomina/pool")
      .then((p) => { setPool(p); setActiva(true); })
      .catch((err) => { if (err instanceof ApiError && err.status === 403) setActiva(false); })
      .finally(() => setLoading(false));
    void apiFetch<AlistamientoPlemsi>("/api/nomina/alistamiento-plemsi").then((data) => {
      setAlistamiento(data);
      setConfigForm((form) => ({ ...form, resolucion_individual: data.resolucion_individual, prefijo_individual: data.prefijo_individual, siguiente_numero_individual: String(data.siguiente_numero_individual), resolucion_ajuste: data.resolucion_ajuste, prefijo_ajuste: data.prefijo_ajuste, siguiente_numero_ajuste: String(data.siguiente_numero_ajuste), habilitado: data.habilitado }));
    }).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-action border-t-transparent" />
      </div>
    );
  }

  if (!activa || !pool) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <NominaBanner />
        <Card className="p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-gray-500 dark:text-slate-300">Tu empresa no tiene nómina electrónica activa.</p>
          <p className="text-sm text-gray-400 mt-1 dark:text-slate-500">Contacta a soporte para contratar un plan de nómina.</p>
        </Card>
      </div>
    );
  }

  const porcentajeUso = Math.min(100, (pool.documentos_consumidos_ciclo / pool.documentos_incluidos) * 100);

  async function guardarConfig(e: FormEvent) {
    e.preventDefault(); setGuardandoConfig(true);
    try {
      const data = await apiFetch<AlistamientoPlemsi>("/api/nomina/alistamiento-plemsi", { method: "PATCH", body: JSON.stringify({ ...configForm, siguiente_numero_individual: Number(configForm.siguiente_numero_individual), siguiente_numero_ajuste: Number(configForm.siguiente_numero_ajuste), ambiente: "pruebas" }) });
      void data;
      const actualizado = await apiFetch<AlistamientoPlemsi>("/api/nomina/alistamiento-plemsi"); setAlistamiento(actualizado); setConfigForm((form) => ({ ...form, token: "" }));
    } finally { setGuardandoConfig(false); }
  }

  async function sincronizarNumeraciones() {
    if (!confirm("Doravia creará las numeraciones faltantes en Plemsi PRUEBAS. ¿Continuar?")) return;
    setSincronizando(true);
    try {
      await apiFetch("/api/nomina/alistamiento-plemsi/sincronizar-numeraciones", { method: "POST" });
      const actualizado = await apiFetch<AlistamientoPlemsi>("/api/nomina/alistamiento-plemsi"); setAlistamiento(actualizado);
    } finally { setSincronizando(false); }
  }

  return (
    <div className="flex-1 space-y-6 p-6 max-w-2xl mx-auto">
      <NominaBanner />
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Mi plan de nómina</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">Estado de tu pool de documentos de nómina electrónica</p>
      </div>

      <Card className="p-5 space-y-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium dark:text-slate-400">Plan actual</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5 dark:text-white">{PLAN_LABEL[pool.plan_slug] ?? pool.plan_slug}</p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 dark:bg-emerald-950 dark:text-emerald-300">Activo</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
          <Calendar className="h-4 w-4 text-gray-400 dark:text-slate-500" />
          <span>Próxima renovación: <strong>{fecha(pool.fecha_renovacion)}</strong></span>
        </div>
      </Card>

      <Card className="p-5 space-y-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1 dark:text-slate-200">
          <FileText className="h-4 w-4 text-gray-400 dark:text-slate-500" /> Documentos de este ciclo
        </h2>
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-300">
          <span>{pool.documentos_consumidos_ciclo} usados</span>
          <span>de {pool.documentos_incluidos}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${
              porcentajeUso >= 90 ? "bg-red-500" : porcentajeUso >= 70 ? "bg-amber-500" : "bg-action"
            }`}
            style={{ width: `${porcentajeUso}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <p className="text-xs text-gray-500 dark:text-slate-400">Disponibles ahora</p>
            <p className="font-semibold text-gray-900 dark:text-white">{pool.documentos_disponibles}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <p className="text-xs text-gray-500 dark:text-slate-400">Acumulados de ciclos previos</p>
            <p className="font-semibold text-gray-900 dark:text-white">{pool.documentos_acumulados_previos}</p>
          </div>
        </div>
        {pool.documentos_adicionales_comprados > 0 && (
          <p className="text-xs text-gray-500 dark:text-slate-400">+ {pool.documentos_adicionales_comprados} documentos adicionales comprados este ciclo</p>
        )}
        <p className="text-xs text-gray-400 pt-1 dark:text-slate-500">
          Los documentos no usados se acumulan al siguiente ciclo hasta un máximo de {pool.limite_acumulacion} (2× tu plan).
        </p>
      </Card>

      {alistamiento && (
        <Card className="p-5 space-y-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Alistamiento para prueba DIAN</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">Entorno: {alistamiento.ambiente}. La emisión seguirá bloqueada hasta validar con Plemsi.</p>
            </div>
            {alistamiento.listo_para_prueba ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-500" />}
          </div>
          {[
            [alistamiento.token_configurado, "Token de nómina configurado"],
            [alistamiento.habilitado, "Integración habilitada para pruebas"],
            [alistamiento.numeracion_individual_configurada, "Numeración de nómina individual"],
            [alistamiento.numeracion_ajuste_configurada, "Numeración de ajustes"],
          ].map(([ok, label]) => (
            <div key={String(label)} className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
              {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-500" />} {String(label)}
            </div>
          ))}
          {alistamiento.empleados_incompletos.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Faltan datos Plemsi en {alistamiento.empleados_incompletos.length} empleado(s). Completa su ficha antes de emitir.</p>}
          <button type="button" onClick={() => setMostrarConfig((value) => !value)} className="text-xs font-medium text-action hover:underline">{mostrarConfig ? "Ocultar configuración" : "Configurar pruebas Plemsi"}</button>
          {mostrarConfig && <form onSubmit={(e) => void guardarConfig(e)} className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 dark:border-slate-700">
            <label className="col-span-2 text-xs text-gray-600 dark:text-slate-300">Bearer Token de pruebas (se cifra y no vuelve a mostrarse)<input type="password" value={configForm.token} onChange={(e) => setConfigForm({ ...configForm, token: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder={alistamiento.token_configurado ? "Token ya configurado; déjalo vacío para conservarlo" : "Token entregado por Plemsi"} /></label>
            <label className="text-xs text-gray-600 dark:text-slate-300">Resolución individual<input required value={configForm.resolucion_individual} onChange={(e) => setConfigForm({ ...configForm, resolucion_individual: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" /></label><label className="text-xs text-gray-600 dark:text-slate-300">Prefijo individual<input required value={configForm.prefijo_individual} onChange={(e) => setConfigForm({ ...configForm, prefijo_individual: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" /></label>
            <label className="text-xs text-gray-600 dark:text-slate-300">Resolución ajuste<input value={configForm.resolucion_ajuste} onChange={(e) => setConfigForm({ ...configForm, resolucion_ajuste: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" /></label><label className="text-xs text-gray-600 dark:text-slate-300">Prefijo ajuste<input value={configForm.prefijo_ajuste} onChange={(e) => setConfigForm({ ...configForm, prefijo_ajuste: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" /></label>
            <label className="col-span-2 flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300"><input type="checkbox" checked={configForm.habilitado} onChange={(e) => setConfigForm({ ...configForm, habilitado: e.target.checked })} /> Habilitar solo para pruebas</label><button disabled={guardandoConfig} className="col-span-2 rounded-md bg-action px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{guardandoConfig ? "Guardando…" : "Guardar configuración de pruebas"}</button>
            <button type="button" disabled={sincronizando || !alistamiento.token_configurado} onClick={() => void sincronizarNumeraciones()} className="col-span-2 rounded-md border border-action px-3 py-2 text-sm font-medium text-action disabled:opacity-50">{sincronizando ? "Sincronizando…" : "Crear/verificar numeraciones en Plemsi pruebas"}</button>
          </form>}
        </Card>
      )}
    </div>
  );
}
