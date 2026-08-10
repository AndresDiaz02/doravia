import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Coins, DollarSign, X } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";

interface ResumenTurno {
  turno: { id: string; monto_inicial: string; apertura_at: string };
  por_metodo: Record<string, number>;
  total_gastos_caja: number;
  total_devoluciones: number;
  total_ventas: number;
  cantidad_ventas: number;
}

interface Props { turnoId: string; cajaNombre: string; onCerrado: () => void; onCancelar: () => void; }

const BILLETES = [100000, 50000, 20000, 10000, 5000, 2000];
const MONEDAS = [1000, 500, 200, 100, 50];
const DENOMINACIONES = [...BILLETES, ...MONEDAS];

export default function CierreTurno({ turnoId, cajaNombre, onCerrado, onCancelar }: Props) {
  const [resumen, setResumen] = useState<ResumenTurno | null>(null);
  const [conteo, setConteo] = useState<Record<number, string>>({});
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ResumenTurno>(`/api/pos/turnos/${turnoId}/resumen`)
      .then(setResumen)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el resumen del turno."))
      .finally(() => setLoading(false));
  }, [turnoId]);

  const esperado = resumen
    ? Number(resumen.turno.monto_inicial) + (resumen.por_metodo.efectivo ?? 0) - resumen.total_gastos_caja - resumen.total_devoluciones
    : 0;
  const montoContado = useMemo(() => DENOMINACIONES.reduce(
    (total, denominacion) => total + denominacion * (Number(conteo[denominacion]) || 0), 0
  ), [conteo]);
  const diferencia = montoContado - esperado;

  function actualizarConteo(denominacion: number, valor: string) {
    if (valor !== "" && !/^\d+$/.test(valor)) return;
    setConteo((actual) => ({ ...actual, [denominacion]: valor }));
  }

  async function cerrar() {
    setCerrando(true); setError(null);
    try {
      const arqueo_efectivo = Object.fromEntries(DENOMINACIONES.map((denominacion) => [
        String(denominacion), Number(conteo[denominacion]) || 0,
      ]));
      await apiFetch(`/api/pos/turnos/${turnoId}/cerrar`, {
        method: "PATCH",
        body: JSON.stringify({ arqueo_efectivo, notas_cierre: notas || undefined }),
      });
      onCerrado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No fue posible cerrar el turno.");
      setCerrando(false);
    }
  }

  function GrupoDenominaciones({ titulo, icono, valores }: { titulo: string; icono: React.ReactNode; valores: number[] }) {
    return <section className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">{icono}{titulo}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {valores.map((denominacion) => {
          const cantidad = Number(conteo[denominacion]) || 0;
          return <label key={denominacion} className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
            <span className="block text-xs font-semibold text-gray-700 dark:text-slate-200">{cop(denominacion)}</span>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                value={conteo[denominacion] ?? ""}
                onChange={(event) => actualizarConteo(denominacion, event.target.value)}
                placeholder="0"
                aria-label={`Cantidad de ${cop(denominacion)}`}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-center text-sm font-bold text-gray-900 outline-none focus:border-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
              <span className="text-xs text-gray-400 dark:text-slate-500">u.</span>
            </div>
            <span className="mt-1 block text-right text-xs text-emerald-600 dark:text-emerald-400">{cantidad ? cop(cantidad * denominacion) : ""}</span>
          </label>;
        })}
      </div>
    </section>;
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800"><div><p className="text-lg font-bold text-gray-900 dark:text-white">Cierre de turno</p><p className="text-sm text-gray-400 dark:text-slate-500">{cajaNombre}</p></div><button onClick={onCancelar} aria-label="Cancelar cierre"><X className="h-5 w-5 text-gray-400" /></button></div>
    <div className="flex-1 overflow-y-auto p-5">{loading ? <p className="py-8 text-center text-sm text-gray-400">Cargando resumen...</p> : !resumen ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p> : <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-violet-50 p-3 text-center dark:bg-violet-950/30"><p className="text-xs text-violet-600 dark:text-violet-300">Ventas del turno</p><p className="font-bold text-violet-800 dark:text-violet-200">{cop(resumen.total_ventas)}</p></div><div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800"><p className="text-xs text-slate-500">Transacciones</p><p className="font-bold text-slate-800 dark:text-slate-200">{resumen.cantidad_ventas}</p></div></div>
      <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800"><p className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white"><DollarSign className="h-4 w-4" /> Cuadre de caja</p><div className="flex justify-between text-sm"><span>Base inicial</span><strong>{cop(resumen.turno.monto_inicial)}</strong></div><div className="flex justify-between text-sm"><span>Ventas en efectivo</span><strong>{cop(resumen.por_metodo.efectivo ?? 0)}</strong></div><div className="flex justify-between border-t pt-2 text-sm font-semibold"><span>Esperado en caja</span><span>{cop(esperado)}</span></div></div>
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="font-semibold text-gray-900 dark:text-white">Conteo de efectivo</p><p className="text-xs text-gray-500 dark:text-slate-400">Registra cuántas unidades hay de cada denominación.</p></div><p className="text-right text-lg font-black text-gray-900 dark:text-white">{cop(montoContado)}</p></div><div className="space-y-4"><GrupoDenominaciones titulo="Billetes" icono={<Banknote className="h-3.5 w-3.5" />} valores={BILLETES} /><GrupoDenominaciones titulo="Monedas" icono={<Coins className="h-3.5 w-3.5" />} valores={MONEDAS} /></div></div>
      <p className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${diferencia === 0 ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}><span className="flex items-center gap-1">{diferencia !== 0 && <AlertTriangle className="h-4 w-4" />}{diferencia === 0 ? "Cuadre perfecto" : diferencia > 0 ? "Sobrante" : "Faltante"}</span><span>{diferencia > 0 ? "+" : ""}{cop(diferencia)}</span></p>
      <textarea rows={2} value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Notas de cierre (opcional)" className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
    </div>}</div>
    <div className="flex gap-3 border-t p-4 dark:border-slate-800"><button onClick={onCancelar} className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 dark:border-slate-600 dark:text-slate-200">Cancelar</button><button onClick={() => void cerrar()} disabled={loading || cerrando || !resumen} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-40">{cerrando ? "Cerrando..." : "Cerrar turno"}</button></div>
  </div></div>;
}
