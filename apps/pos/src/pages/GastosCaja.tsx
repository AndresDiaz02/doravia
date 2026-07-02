import { useEffect, useState } from "react";
import { Plus, Wallet, X } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";

interface GastoCaja {
  id: string;
  monto: string;
  concepto: string;
  descripcion: string | null;
  created_at: string;
}

interface Props {
  turnoId: string;
  cajaId: string;
}

const CONCEPTOS: { value: string; label: string }[] = [
  { value: "domicilio",     label: "Domicilio / mensajero" },
  { value: "cambio_moneda", label: "Cambio de moneda" },
  { value: "papeleria",     label: "Papelería" },
  { value: "aseo",          label: "Aseo" },
  { value: "transporte",    label: "Transporte" },
  { value: "otros",         label: "Otros" },
];

const CONCEPTO_LABELS: Record<string, string> = Object.fromEntries(CONCEPTOS.map((c) => [c.value, c.label]));

export default function GastosCaja({ turnoId, cajaId }: Props) {
  const [gastos, setGastos] = useState<GastoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("otros");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void cargar(); }, [turnoId]);

  async function cargar() {
    const data = await apiFetch<GastoCaja[]>(`/api/pos/gastos-caja?turno_id=${turnoId}`);
    setGastos(data);
    setLoading(false);
  }

  async function registrar() {
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) { setError("Ingresa un monto válido."); return; }
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/api/pos/gastos-caja", {
        method: "POST",
        body: JSON.stringify({
          turno_id: turnoId,
          caja_id: cajaId,
          monto: montoNum,
          concepto,
          descripcion: descripcion.trim() || undefined,
        }),
      });
      setMonto("");
      setDescripcion("");
      setConcepto("otros");
      setShowForm(false);
      void cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al registrar el gasto.");
    } finally {
      setGuardando(false);
    }
  }

  const totalGastos = gastos.reduce((s, g) => s + Number(g.monto), 0);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0B0E1A]">
      {/* Header */}
      <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm">Gastos de caja</p>
          {gastos.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-slate-500">
              {gastos.length} gasto{gastos.length !== 1 ? "s" : ""} · Total: <span className="text-red-500">{cop(totalGastos)}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="flex items-center gap-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar gasto
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-gray-400 dark:text-slate-600 text-sm py-8">Cargando...</p>
        ) : gastos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-slate-700 gap-2 py-12">
            <Wallet className="h-10 w-10" />
            <p className="text-sm">Sin gastos en este turno</p>
            <p className="text-xs text-gray-300 dark:text-slate-600">Registra aquí cualquier salida de dinero de la caja</p>
          </div>
        ) : (
          <div className="space-y-2">
            {gastos.map((g) => (
              <div key={g.id} className="rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
                  <Wallet className="h-4 w-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{CONCEPTO_LABELS[g.concepto] ?? g.concepto}</p>
                  {g.descripcion && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{g.descripcion}</p>}
                  <p className="text-xs text-gray-300 dark:text-slate-600">
                    {new Date(g.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="text-base font-bold text-red-500 flex-shrink-0">− {cop(g.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nuevo gasto */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900 dark:text-white">Registrar gasto de caja</p>
              <button onClick={() => setShowForm(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Monto ($)</label>
                <input
                  type="number" min="0" step="1000" autoFocus
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-2xl font-bold text-center text-gray-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  placeholder="0"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Concepto</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CONCEPTOS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setConcepto(c.value)}
                      className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors text-left ${
                        concepto === c.value
                          ? "bg-red-500 text-white border-red-500"
                          : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-red-300"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Descripción (opcional)</label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: domicilio calle 5 #12-30"
                  className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                />
              </div>
            </div>

            {error && <p className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/50 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-3 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void registrar()}
                disabled={guardando}
                className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 py-3 text-sm font-semibold text-white transition-colors"
              >
                {guardando ? "Guardando..." : "Registrar gasto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
