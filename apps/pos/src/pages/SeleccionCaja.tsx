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
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-gray-900">Selecciona una caja</p>
            <p className="text-sm text-gray-500">{user?.tenantNombre} · {user?.nombre}</p>
          </div>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600">Cerrar sesión</button>
        </div>

        {loading ? (
          <p className="text-center text-gray-400">Cargando cajas...</p>
        ) : cajas.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <Monitor className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No hay cajas configuradas</p>
            <p className="text-sm text-gray-400 mt-1">Un administrador debe crear las cajas desde el panel de configuración.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cajas.map((caja) => {
              const turno = turnosActivos[caja.id];
              return (
                <button
                  key={caja.id}
                  onClick={() => void handleAbrirTurno(caja)}
                  className="rounded-xl bg-white p-6 text-left shadow-sm hover:shadow-md hover:border-blue-300 border-2 border-transparent transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="rounded-lg bg-blue-50 p-3">
                      <Monitor className="h-6 w-6 text-blue-600" />
                    </div>
                    {turno && (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Turno abierto
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-base font-semibold text-gray-900">{caja.nombre}</p>
                  {caja.descripcion && <p className="text-xs text-gray-400 mt-0.5">{caja.descripcion}</p>}
                  {turno && (
                    <p className="text-xs text-gray-500 mt-2">
                      Ventas del turno: <span className="font-medium text-gray-700">{cop(turno.total_ventas)}</span>
                    </p>
                  )}
                  {!turno && (
                    <p className="flex items-center gap-1 text-xs text-blue-600 mt-2 font-medium">
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
              <p className="text-lg font-semibold text-gray-900">Abrir turno — {cajaSeleccionada.nombre}</p>
              <div className="space-y-1.5">
                <label className="text-sm text-gray-600">Monto inicial en caja ($)</label>
                <input
                  type="number" min="0" step="1000"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-xl font-semibold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setCajaSeleccionada(null)}
                  className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void confirmarApertura()}
                  disabled={!!abriendo}
                  className="flex-1 rounded-lg bg-blue-700 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
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
