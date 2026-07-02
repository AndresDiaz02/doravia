import { useEffect, useState } from "react";
import { X, DollarSign, AlertTriangle } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { HelpTooltip } from "../components/HelpTooltip";

interface ResumenTurno {
  turno: {
    id: string;
    monto_inicial: string;
    total_ventas: string;
    apertura_at: string;
  };
  total_ventas: number;
  cantidad_ventas: number;
  por_metodo: Record<string, number>;
}

interface Props {
  turnoId: string;
  cajaNombre: string;
  onCerrado: () => void;
  onCancelar: () => void;
}

const METODO_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  nequi: "Nequi",
  daviplata: "Daviplata",
  mixto: "Mixto",
};

export default function CierreTurno({ turnoId, cajaNombre, onCerrado, onCancelar }: Props) {
  const [resumen, setResumen] = useState<ResumenTurno | null>(null);
  const [loading, setLoading] = useState(true);
  const [montoDeclarado, setMontoDeclarado] = useState("");
  const [notas, setNotas] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ResumenTurno>(`/api/pos/turnos/${turnoId}/resumen`)
      .then((data) => {
        setResumen(data);
        const efectivoEsperado = Number(data.turno.monto_inicial) + (data.por_metodo["efectivo"] ?? 0);
        setMontoDeclarado(String(efectivoEsperado));
      })
      .catch(() => setError("No se pudo cargar el resumen del turno. Recarga e intenta de nuevo."))
      .finally(() => setLoading(false));
  }, [turnoId]);

  const efectivoEsperado = resumen
    ? Number(resumen.turno.monto_inicial) + (resumen.por_metodo["efectivo"] ?? 0)
    : 0;

  const diferencia = montoDeclarado ? Number(montoDeclarado) - efectivoEsperado : 0;

  async function cerrar() {
    setCerrando(true);
    setError(null);
    try {
      await apiFetch(`/api/pos/turnos/${turnoId}/cerrar`, {
        method: "PATCH",
        body: JSON.stringify({
          monto_final_declarado: montoDeclarado ? Number(montoDeclarado) : undefined,
          notas_cierre: notas || undefined,
        }),
      });
      onCerrado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cerrar el turno.");
      setCerrando(false);
    }
  }

  const duracion = resumen
    ? Math.round((Date.now() - new Date(resumen.turno.apertura_at).getTime()) / 60000)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-lg">Cierre de turno</p>
            <p className="text-sm text-gray-400 dark:text-slate-500">{cajaNombre}</p>
          </div>
          <button onClick={onCancelar} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-gray-400 dark:text-slate-500">Cargando resumen...</p>
          </div>
        ) : error && !resumen ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-red-500 dark:text-red-400 text-sm text-center">{error}</p>
          </div>
        ) : resumen ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Duración */}
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
              Turno abierto {duracion >= 60 ? `${Math.floor(duracion / 60)}h ${duracion % 60}min` : `${duracion} min`} ·{" "}
              {new Date(resumen.turno.apertura_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} →{" "}
              ahora
            </p>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-3 text-center border border-blue-100 dark:border-blue-900/40">
                <p className="text-xs text-blue-500 dark:text-blue-400 font-medium">Total ventas</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{cop(resumen.total_ventas)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3 text-center border border-gray-100 dark:border-slate-700">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Transacciones</p>
                <p className="text-xl font-bold text-gray-700 dark:text-slate-200">{resumen.cantidad_ventas}</p>
              </div>
            </div>

            {/* Por método de pago */}
            {Object.keys(resumen.por_metodo).length > 0 && (
              <div className="rounded-xl border border-gray-100 dark:border-slate-700 divide-y divide-gray-50 dark:divide-slate-800">
                {Object.entries(resumen.por_metodo).map(([metodo, total]) => (
                  <div key={metodo} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-600 dark:text-slate-400">{METODO_LABELS[metodo] ?? metodo}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{cop(total)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Cuadre de caja */}
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-4 space-y-3 border border-gray-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" /> Cuadre de caja
                <HelpTooltip text="Cuenta el dinero físico en la caja y compáralo con lo esperado. La diferencia queda registrada en el reporte del turno." side="right" />
              </p>
              <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400">
                <span>Base inicial</span>
                <span className="font-medium text-gray-700 dark:text-slate-200">{cop(resumen.turno.monto_inicial)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400">
                <span>+ Ventas en efectivo</span>
                <span className="font-medium text-gray-700 dark:text-slate-200">{cop(resumen.por_metodo["efectivo"] ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-gray-800 dark:text-white border-t border-gray-200 dark:border-slate-700 pt-2">
                <span>Esperado en caja</span>
                <span>{cop(efectivoEsperado)}</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Monto contado en caja</label>
                <input
                  type="number" min="0" step="1000"
                  value={montoDeclarado}
                  onChange={(e) => setMontoDeclarado(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white px-3 py-2 text-base font-semibold text-center focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-violet-500"
                />
              </div>

              {montoDeclarado && (
                <div className={`flex justify-between text-sm font-semibold rounded-lg px-3 py-2 ${
                  diferencia === 0 ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400" :
                  diferencia > 0 ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400" :
                  "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                }`}>
                  <span className="flex items-center gap-1">
                    {diferencia !== 0 && <AlertTriangle className="h-4 w-4" />}
                    Diferencia
                  </span>
                  <span>{diferencia >= 0 ? "+" : ""}{cop(diferencia)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Notas de cierre (opcional)</label>
              <textarea
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-violet-500 placeholder-gray-400 dark:placeholder-slate-600"
                placeholder="Observaciones sobre el turno..."
              />
            </div>

            {error && <p className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/40 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
          </div>
        ) : null}

        <div className="p-4 border-t border-gray-100 dark:border-slate-800 flex gap-3 flex-shrink-0">
          <button onClick={onCancelar} className="flex-1 rounded-xl border border-gray-300 dark:border-slate-600 py-3 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => void cerrar()}
            disabled={cerrando || loading}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {cerrando ? "Cerrando..." : "Cerrar turno"}
          </button>
        </div>
      </div>
    </div>
  );
}
