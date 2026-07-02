import { useEffect, useState } from "react";
import { Search, ChevronRight, X, AlertTriangle, RotateCcw } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";

interface VentaPOS {
  id: string;
  numero: string;
  total: string;
  subtotal: string;
  iva_total: string;
  descuento_total: string;
  metodo_pago: string;
  nombre_cliente: string | null;
  estado: string;
  created_at: string;
}

interface ItemVenta {
  id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  total: string;
}

interface Devolucion {
  id: string;
  monto_devuelto: string;
  metodo_devolucion: string;
  motivo: string | null;
  created_at: string;
}

interface VentaDetalle extends VentaPOS {
  items: ItemVenta[];
}

interface Props {
  turnoId: string;
}

const METODO_LABELS: Record<string, string> = {
  efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia",
  nequi: "Nequi", daviplata: "Daviplata", mixto: "Mixto",
};

type AccionModal = "ninguna" | "anular" | "devolver";

export default function HistorialVentas({ turnoId }: Props) {
  const [ventas, setVentas] = useState<VentaPOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [accion, setAccion] = useState<AccionModal>("ninguna");

  // Anulación
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);

  // Devolución
  const [montoDevolucion, setMontoDevolucion] = useState("");
  const [motivoDevolucion, setMotivoDevolucion] = useState("");
  const [metodoDevolucion, setMetodoDevolucion] = useState("efectivo");
  const [procesandoDevolucion, setProcesandoDevolucion] = useState(false);
  const [errorDevolucion, setErrorDevolucion] = useState<string | null>(null);

  function recargar() {
    apiFetch<VentaPOS[]>(`/api/pos/ventas?turno_id=${turnoId}`).then(setVentas);
  }

  useEffect(() => {
    apiFetch<VentaPOS[]>(`/api/pos/ventas?turno_id=${turnoId}`)
      .then(setVentas)
      .finally(() => setLoading(false));
  }, [turnoId]);

  async function verDetalle(id: string) {
    const [data, devs] = await Promise.all([
      apiFetch<VentaDetalle>(`/api/pos/ventas/${id}`),
      apiFetch<Devolucion[]>(`/api/pos/devoluciones?venta_id=${id}`).catch(() => [] as Devolucion[]),
    ]);
    setDetalle(data);
    setDevoluciones(devs);
    setAccion("ninguna");
    setMotivoAnulacion("");
    setMontoDevolucion("");
    setMotivoDevolucion("");
    setMetodoDevolucion("efectivo");
    setErrorAnulacion(null);
    setErrorDevolucion(null);
  }

  async function anularVenta() {
    if (!detalle) return;
    setAnulandoId(detalle.id);
    setErrorAnulacion(null);
    try {
      await apiFetch(`/api/pos/ventas/${detalle.id}/anular`, {
        method: "PATCH",
        body: JSON.stringify({ motivo: motivoAnulacion || undefined }),
      });
      setDetalle(null);
      setAccion("ninguna");
      recargar();
    } catch (err) {
      setErrorAnulacion(err instanceof ApiError ? err.message : "Error al anular la venta.");
    } finally {
      setAnulandoId(null);
    }
  }

  async function registrarDevolucion() {
    if (!detalle) return;
    const monto = Number(montoDevolucion);
    if (!monto || monto <= 0) { setErrorDevolucion("Ingresa un monto válido."); return; }
    if (monto > Number(detalle.total)) { setErrorDevolucion("El monto no puede superar el total de la venta."); return; }
    setProcesandoDevolucion(true);
    setErrorDevolucion(null);
    try {
      await apiFetch("/api/pos/devoluciones", {
        method: "POST",
        body: JSON.stringify({
          venta_id: detalle.id,
          monto_devuelto: monto,
          metodo_devolucion: metodoDevolucion,
          motivo: motivoDevolucion.trim() || undefined,
        }),
      });
      // Refrescar devoluciones
      const devs = await apiFetch<Devolucion[]>(`/api/pos/devoluciones?venta_id=${detalle.id}`).catch(() => [] as Devolucion[]);
      setDevoluciones(devs);
      setAccion("ninguna");
      setMontoDevolucion("");
      setMotivoDevolucion("");
    } catch (err) {
      setErrorDevolucion(err instanceof ApiError ? err.message : "Error al registrar la devolución.");
    } finally {
      setProcesandoDevolucion(false);
    }
  }

  const filtradas = ventas.filter((v) =>
    v.numero.includes(busqueda) ||
    (v.nombre_cliente ?? "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const total = ventas.filter((v) => v.estado === "completada").reduce((s, v) => s + Number(v.total), 0);
  const totalDevuelto = devoluciones.reduce((s, d) => s + Number(d.monto_devuelto), 0);

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-[#0B0E1A]">
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-gray-900 dark:text-white">Ventas del turno</p>
          <div className="text-right">
            <p className="text-xs text-gray-400 dark:text-slate-500">{ventas.filter((v) => v.estado === "completada").length} ventas</p>
            <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{cop(total)}</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número o cliente..."
            className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-center text-gray-400 dark:text-slate-600 py-8 text-sm">Cargando...</p>
        ) : filtradas.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-slate-600 py-12 text-sm">Sin ventas en este turno</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400">Hora</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400">Número</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-400">Método</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-slate-400">Total</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
              {filtradas.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => void verDetalle(v.id)}
                  className={`cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800/60 transition-colors ${v.estado === "anulada" ? "opacity-40 line-through" : ""}`}
                >
                  <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">
                    {new Date(v.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-2 py-2.5 font-medium text-gray-800 dark:text-slate-200">{v.numero}</td>
                  <td className="px-2 py-2.5 text-gray-500 dark:text-slate-400">{METODO_LABELS[v.metodo_pago] ?? v.metodo_pago}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">{cop(v.total)}</td>
                  <td className="pr-2 text-gray-300 dark:text-slate-600"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal detalle venta */}
      {detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl max-h-[90vh] flex flex-col border-0 sm:border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-900 dark:text-white">{detalle.numero}</p>
                  {detalle.estado === "anulada" && (
                    <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">Anulada</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {new Date(detalle.created_at).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  {" · "}{METODO_LABELS[detalle.metodo_pago]}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 dark:text-slate-500"><X className="h-5 w-5" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {detalle.nombre_cliente && (
                <p className="text-sm text-gray-600 dark:text-slate-400">Cliente: <span className="font-medium text-gray-900 dark:text-white">{detalle.nombre_cliente}</span></p>
              )}
              <div className="space-y-1.5">
                {detalle.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-slate-300">{item.cantidad}× {item.descripcion}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{cop(item.total)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-slate-800 pt-2 space-y-1">
                <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400">
                  <span>Subtotal</span><span>{cop(detalle.subtotal)}</span>
                </div>
                {Number(detalle.descuento_total) > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>Descuento</span><span>-{cop(detalle.descuento_total)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400">
                  <span>IVA</span><span>{cop(detalle.iva_total)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 dark:text-white">
                  <span>Total</span><span className="text-blue-700 dark:text-blue-400">{cop(detalle.total)}</span>
                </div>
              </div>

              {/* Devoluciones previas */}
              {devoluciones.length > 0 && (
                <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Devoluciones registradas</p>
                  {devoluciones.map((d) => (
                    <div key={d.id} className="flex justify-between text-xs text-orange-700 dark:text-orange-300">
                      <span>{new Date(d.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} — {d.motivo ?? METODO_LABELS[d.metodo_devolucion]}</span>
                      <span className="font-semibold">− {cop(d.monto_devuelto)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-bold text-orange-800 dark:text-orange-300 border-t border-orange-200 dark:border-orange-800 pt-1">
                    <span>Total devuelto</span><span>− {cop(totalDevuelto)}</span>
                  </div>
                </div>
              )}

              {/* Acciones */}
              {detalle.estado !== "anulada" && accion === "ninguna" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setAccion("devolver")}
                    className="flex-1 rounded-xl border border-orange-200 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Devolución
                  </button>
                  <button
                    onClick={() => setAccion("anular")}
                    className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    Anular venta
                  </button>
                </div>
              )}

              {/* Form devolución */}
              {accion === "devolver" && (
                <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40 p-3 space-y-3">
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                    <RotateCcw className="h-4 w-4" /> Registrar devolución
                  </p>
                  <div className="space-y-1">
                    <label className="text-xs text-orange-700 dark:text-orange-400">Monto a devolver</label>
                    <input
                      type="number" min="0" step="100" max={detalle.total}
                      autoFocus
                      value={montoDevolucion}
                      onChange={(e) => setMontoDevolucion(e.target.value)}
                      placeholder={`Máx. ${cop(detalle.total)}`}
                      className="w-full rounded-lg border border-orange-200 dark:border-orange-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-white px-3 py-2 text-base font-semibold text-center focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-orange-700 dark:text-orange-400">Método de devolución</label>
                    <div className="grid grid-cols-2 gap-1">
                      {["efectivo", "nequi", "daviplata", "transferencia"].map((m) => (
                        <button
                          key={m}
                          onClick={() => setMetodoDevolucion(m)}
                          className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            metodoDevolucion === m
                              ? "bg-orange-500 text-white border-orange-500"
                              : "bg-white dark:bg-slate-800 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300"
                          }`}
                        >
                          {METODO_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={motivoDevolucion}
                    onChange={(e) => setMotivoDevolucion(e.target.value)}
                    placeholder="Motivo (opcional)"
                    className="w-full rounded-lg border border-orange-200 dark:border-orange-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  {errorDevolucion && <p className="text-xs text-red-700 dark:text-red-400">{errorDevolucion}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setAccion("ninguna")} className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 py-2 text-sm text-gray-600 dark:text-slate-400">
                      Cancelar
                    </button>
                    <button
                      onClick={() => void registrarDevolucion()}
                      disabled={procesandoDevolucion}
                      className="flex-1 rounded-lg bg-orange-500 hover:bg-orange-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {procesandoDevolucion ? "Registrando..." : "Confirmar"}
                    </button>
                  </div>
                </div>
              )}

              {/* Form anulación */}
              {accion === "anular" && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    ¿Anular esta venta completa?
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400">Se revertirá el stock. Para devolver un monto parcial usa "Devolución".</p>
                  <input
                    className="w-full rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-400"
                    placeholder="Motivo (opcional)"
                    value={motivoAnulacion}
                    onChange={(e) => setMotivoAnulacion(e.target.value)}
                  />
                  {errorAnulacion && <p className="text-xs text-red-700 dark:text-red-400">{errorAnulacion}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setAccion("ninguna")} className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 py-2 text-sm text-gray-600 dark:text-slate-400">
                      Cancelar
                    </button>
                    <button
                      onClick={() => void anularVenta()}
                      disabled={!!anulandoId}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {anulandoId ? "Anulando..." : "Anular"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
