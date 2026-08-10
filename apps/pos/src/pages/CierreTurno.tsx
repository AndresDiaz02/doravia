import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, DollarSign, LockKeyhole, X } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";

interface TurnoAbierto {
  turno: {
    id: string;
    caja_id: string;
    apertura_at: string;
    estado: "abierto" | "cerrado";
  };
}

interface ResultadoCierre {
  arqueo: {
    montoEsperado: string;
    montoDeclarado: string;
    diferencia: string;
  };
}

interface Props {
  turnoId: string;
  cajaNombre: string;
  onCerrado: () => void;
  onCancelar: () => void;
}

export default function CierreTurno({ turnoId, cajaNombre, onCerrado, onCancelar }: Props) {
  const [turno, setTurno] = useState<TurnoAbierto["turno"] | null>(null);
  const [montoDeclarado, setMontoDeclarado] = useState("");
  const [motivoDiferencia, setMotivoDiferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [requiereMotivo, setRequiereMotivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCierre["arqueo"] | null>(null);

  useEffect(() => {
    apiFetch<TurnoAbierto>(`/api/pos/turnos/${turnoId}/cierre-ciego`)
      .then((data) => setTurno(data.turno))
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo preparar el cierre."))
      .finally(() => setLoading(false));
  }, [turnoId]);

  async function cerrar() {
    if (!montoDeclarado.trim()) {
      setError("Ingresa el efectivo contado en caja.");
      return;
    }
    const monto = Number(montoDeclarado);
    if (!Number.isFinite(monto) || monto < 0) {
      setError("Ingresa un monto válido igual o mayor a cero.");
      return;
    }

    setCerrando(true);
    setError(null);
    try {
      const data = await apiFetch<ResultadoCierre>(`/api/pos/turnos/${turnoId}/cerrar`, {
        method: "PATCH",
        body: JSON.stringify({
          monto_final_declarado: monto,
          motivo_diferencia: motivoDiferencia.trim() || undefined,
          notas_cierre: notas.trim() || undefined,
        }),
      });
      setResultado(data.arqueo);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setRequiereMotivo(true);
      setError(err instanceof ApiError ? err.message : "No fue posible cerrar el turno.");
    } finally {
      setCerrando(false);
    }
  }

  const diferencia = resultado ? Number(resultado.diferencia) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800">
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">Arqueo de caja</p>
            <p className="text-sm text-gray-400 dark:text-slate-500">{cajaNombre}</p>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300" aria-label="Cancelar cierre">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Preparando cierre seguro...</p>
          ) : error && !turno ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
          ) : resultado ? (
            <div className="space-y-4">
              <div className={`rounded-xl border p-4 ${diferencia === 0 ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"}`}>
                <div className="mb-2 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  {diferencia === 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  {diferencia === 0 ? "Caja cuadrada" : "Diferencia registrada"}
                </div>
                <div className="space-y-1 text-sm text-gray-600 dark:text-slate-300">
                  <div className="flex justify-between"><span>Declarado</span><strong>{cop(resultado.montoDeclarado)}</strong></div>
                  <div className="flex justify-between"><span>Esperado</span><strong>{cop(resultado.montoEsperado)}</strong></div>
                  <div className="flex justify-between border-t border-current/10 pt-2 font-semibold"><span>{diferencia > 0 ? "Sobrante" : diferencia < 0 ? "Faltante" : "Diferencia"}</span><span>{diferencia > 0 ? "+" : ""}{cop(diferencia)}</span></div>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">El resultado y las observaciones quedaron registrados en la auditoría del turno.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 dark:border-violet-900/50 dark:bg-violet-950/30">
                <div className="mb-1 flex items-center gap-2 font-semibold text-violet-900 dark:text-violet-200"><LockKeyhole className="h-4 w-4" /> Arqueo ciego</div>
                <p className="text-sm text-violet-800 dark:text-violet-300">Cuenta el efectivo físico antes de declararlo. El valor esperado se calcula y revela únicamente después del cierre.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor="monto-contado">Efectivo contado en caja</label>
                <div className="relative"><DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input id="monto-contado" type="number" min="0" step="0.01" inputMode="decimal" autoFocus value={montoDeclarado} onChange={(e) => setMontoDeclarado(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-lg font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="0" /></div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor="motivo">Motivo de diferencia {requiereMotivo ? "(obligatorio)" : "(si aplica)"}</label>
                <textarea id="motivo" rows={2} value={motivoDiferencia} onChange={(e) => setMotivoDiferencia(e.target.value)} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="Ej.: cambio entregado, gasto no registrado..." />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor="notas">Notas de cierre (opcional)</label>
                <textarea id="notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-950 dark:text-white" placeholder="Observaciones del turno..." />
              </div>
              {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-100 p-4 dark:border-slate-800">
          <button onClick={resultado ? onCerrado : onCancelar} className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">{resultado ? "Finalizar" : "Cancelar"}</button>
          {!resultado && <button onClick={() => void cerrar()} disabled={cerrando || loading || !turno} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40">{cerrando ? "Cerrando..." : "Cerrar turno"}</button>}
        </div>
      </div>
    </div>
  );
}
