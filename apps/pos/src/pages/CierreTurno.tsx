import { useEffect, useState } from "react";
import { AlertTriangle, DollarSign, X } from "lucide-react";
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

export default function CierreTurno({ turnoId, cajaNombre, onCerrado, onCancelar }: Props) {
  const [resumen, setResumen] = useState<ResumenTurno | null>(null);
  const [montoDeclarado, setMontoDeclarado] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ResumenTurno>(`/api/pos/turnos/${turnoId}/resumen`)
      .then((data) => {
        setResumen(data);
        const esperado = Number(data.turno.monto_inicial) + (data.por_metodo.efectivo ?? 0) - data.total_gastos_caja - data.total_devoluciones;
        setMontoDeclarado(String(esperado));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el resumen del turno."))
      .finally(() => setLoading(false));
  }, [turnoId]);

  const esperado = resumen ? Number(resumen.turno.monto_inicial) + (resumen.por_metodo.efectivo ?? 0) - resumen.total_gastos_caja - resumen.total_devoluciones : 0;
  const diferencia = montoDeclarado ? Number(montoDeclarado) - esperado : 0;

  async function cerrar() {
    if (!montoDeclarado.trim()) return setError("Ingresa el monto contado en caja.");
    setCerrando(true); setError(null);
    try {
      await apiFetch(`/api/pos/turnos/${turnoId}/cerrar`, { method: "PATCH", body: JSON.stringify({ monto_final_declarado: Number(montoDeclarado), notas_cierre: notas || undefined }) });
      onCerrado();
    } catch (err) { setError(err instanceof ApiError ? err.message : "No fue posible cerrar el turno."); setCerrando(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800"><div><p className="text-lg font-bold text-gray-900 dark:text-white">Cierre de turno</p><p className="text-sm text-gray-400">{cajaNombre}</p></div><button onClick={onCancelar} aria-label="Cancelar cierre"><X className="h-5 w-5 text-gray-400" /></button></div>
    <div className="flex-1 overflow-y-auto p-5">{loading ? <p className="py-8 text-center text-sm text-gray-400">Cargando resumen...</p> : !resumen ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-violet-50 p-3 text-center dark:bg-violet-950/30"><p className="text-xs text-violet-600">Ventas del turno</p><p className="font-bold text-violet-800 dark:text-violet-200">{cop(resumen.total_ventas)}</p></div><div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800"><p className="text-xs text-slate-500">Transacciones</p><p className="font-bold text-slate-800 dark:text-slate-200">{resumen.cantidad_ventas}</p></div></div>
      <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800"><p className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white"><DollarSign className="h-4 w-4" /> Cuadre de caja</p><div className="flex justify-between text-sm"><span>Base inicial</span><strong>{cop(resumen.turno.monto_inicial)}</strong></div><div className="flex justify-between text-sm"><span>Ventas en efectivo</span><strong>{cop(resumen.por_metodo.efectivo ?? 0)}</strong></div><div className="flex justify-between border-t pt-2 text-sm font-semibold"><span>Esperado en caja</span><span>{cop(esperado)}</span></div><label className="block pt-2 text-sm font-medium" htmlFor="monto">Monto contado en caja</label><input id="monto" type="number" min="0" step="0.01" value={montoDeclarado} onChange={(e) => setMontoDeclarado(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-center font-semibold text-gray-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />{montoDeclarado && <p className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${diferencia === 0 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}><span className="flex items-center gap-1">{diferencia !== 0 && <AlertTriangle className="h-4 w-4" />}{diferencia === 0 ? "Cuadre perfecto" : diferencia > 0 ? "Sobrante" : "Faltante"}</span><span>{diferencia > 0 ? "+" : ""}{cop(diferencia)}</span></p>}</div>
      <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas de cierre (opcional)" className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>}</div>
    <div className="flex gap-3 border-t p-4 dark:border-slate-800"><button onClick={onCancelar} className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium">Cancelar</button><button onClick={() => void cerrar()} disabled={loading || cerrando || !resumen} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-40">{cerrando ? "Cerrando..." : "Cerrar turno"}</button></div>
  </div></div>;
}
