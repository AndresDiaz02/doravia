import { useEffect, useState } from "react";
import { Monitor, Plus } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Caja { id: string; nombre: string; descripcion: string | null; activo: boolean; }
interface TurnoActivo { id: string; caja_id: string; apertura_at: string; monto_inicial: string; total_ventas: string; }

interface Props {
  onTurnoAbierto: (turnoId: string, cajaId: string, cajaNombre: string) => void;
}

export default function SeleccionCaja({ onTurnoAbierto }: Props) {
  const { user, logout } = useAuth();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [turnosActivos, setTurnosActivos] = useState<Record<string, TurnoActivo>>({});
  const [loading, setLoading] = useState(true);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [montoInicial, setMontoInicial] = useState("0");
  const [cajaSeleccionada, setCajaSeleccionada] = useState<Caja | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Caja[]>("/api/pos/cajas"),
      apiFetch<TurnoActivo[]>("/api/pos/turnos/activos"),
    ]).then(([cajasData, turnosData]) => {
      setCajas(cajasData.filter((c) => c.activo));
      const map: Record<string, TurnoActivo> = {};
      for (const t of turnosData) map[t.caja_id] = t;
      setTurnosActivos(map);
    }).finally(() => setLoading(false));
  }, []);

  async function handleAbrirTurno(caja: Caja) {
    const turnoExistente = turnosActivos[caja.id];
    if (turnoExistente) {
      onTurnoAbierto(turnoExistente.id, caja.id, caja.nombre);
      return;
    }
    setCajaSeleccionada(caja);
  }

  async function confirmarApertura() {
    if (!cajaSeleccionada) return;
    setAbriendo(cajaSeleccionada.id);
    setError(null);
    try {
      const turno = await apiFetch<TurnoActivo>("/api/pos/turnos", {
        method: "POST",
        body: JSON.stringify({ caja_id: cajaSeleccionada.id, monto_inicial: Number(montoInicial) }),
      });
      onTurnoAbierto(turno.id, cajaSeleccionada.id, cajaSeleccionada.nombre);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al abrir turno.");
    } finally {
      setAbriendo(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0E1A] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-900/40">
              <span className="text-white text-lg font-black">D</span>
            </div>
            <div>
              <p className="text-base font-bold text-gray-900 dark:text-white">Selecciona una caja</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{user?.tenantNombre} · {user?.nombre}</p>
            </div>
          </div>
          <button onClick={logout} className="text-xs text-gray-400 dark:text-slate-600 hover:text-gray-700 dark:hover:text-slate-300 transition-colors">
            Cerrar sesión
          </button>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 dark:text-slate-600 text-sm py-8">Cargando cajas...</p>
        ) : cajas.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-10 text-center">
            <Monitor className="h-12 w-12 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-slate-300 font-medium">No hay cajas configuradas</p>
            <p className="text-sm text-gray-400 dark:text-slate-600 mt-1">Un administrador debe crear las cajas desde el panel ERP.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cajas.map((caja) => {
              const turno = turnosActivos[caja.id];
              return (
                <button
                  key={caja.id}
                  onClick={() => void handleAbrirTurno(caja)}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 text-left hover:border-violet-400 dark:hover:border-violet-700/60 hover:bg-violet-50 dark:hover:bg-slate-800/60 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="rounded-xl bg-gray-100 dark:bg-slate-800 p-2.5 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/40 transition-colors">
                      <Monitor className="h-5 w-5 text-gray-400 dark:text-slate-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors" />
                    </div>
                    {turno && (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700/50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Turno abierto
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-base font-semibold text-gray-900 dark:text-white">{caja.nombre}</p>
                  {caja.descripcion && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{caja.descripcion}</p>}
                  {turno && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                      Ventas del turno: <span className="font-semibold text-gray-700 dark:text-slate-300">{cop(turno.total_ventas)}</span>
                    </p>
                  )}
                  {!turno && (
                    <p className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 mt-2 font-medium">
                      <Plus className="h-3 w-3" /> Abrir turno
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Modal monto inicial */}
        {cajaSeleccionada && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">Abrir turno — {cajaSeleccionada.nombre}</p>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wide">Monto inicial en caja ($)</label>
                <input
                  type="number" min="0" step="1000"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl px-4 py-3 text-2xl font-bold text-center text-gray-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  autoFocus
                />
              </div>
              {error && <p className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/50 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setCajaSeleccionada(null)}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 py-3 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void confirmarApertura()}
                  disabled={!!abriendo}
                  className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 py-3 text-sm font-semibold text-white transition-colors"
                >
                  {abriendo ? "Abriendo..." : "Abrir turno"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
