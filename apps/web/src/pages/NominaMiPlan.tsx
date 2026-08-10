import { useEffect, useState } from "react";
import { Calendar, FileText } from "lucide-react";
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

  useEffect(() => {
    apiFetch<PoolNomina>("/api/nomina/pool")
      .then((p) => { setPool(p); setActiva(true); })
      .catch((err) => { if (err instanceof ApiError && err.status === 403) setActiva(false); })
      .finally(() => setLoading(false));
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
    </div>
  );
}
