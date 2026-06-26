import { useEffect, useState } from "react";
import { Search, ChevronRight, X, AlertTriangle } from "lucide-react";
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

export default function HistorialVentas({ turnoId }: Props) {
  const [ventas, setVentas] = useState<VentaPOS[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);
  const [confirmAnular, setConfirmAnular] = useState(false);

  function recargar() {
    apiFetch<VentaPOS[]>(`/api/pos/ventas?turno_id=${turnoId}`).then(setVentas);
  }

  useEffect(() => {
    apiFetch<VentaPOS[]>(`/api/pos/ventas?turno_id=${turnoId}`)
      .then(setVentas)
      .finally(() => setLoading(false));
  }, [turnoId]);

  async function verDetalle(id: string) {
    const data = await apiFetch<VentaDetalle>(`/api/pos/ventas/${id}`);
    setDetalle(data);
    setConfirmAnular(false);
    setMotivoAnulacion("");
    setErrorAnulacion(null);
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
      setConfirmAnular(false);
      recargar();
    } catch (err) {
      setErrorAnulacion(err instanceof ApiError ? err.message : "Error al anular la venta.");
    } finally {
      setAnulandoId(null);
    }
  }

  const filtradas = ventas.filter((v) =>
    v.numero.includes(busqueda) ||
    (v.nombre_cliente ?? "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const total = ventas.filter((v) => v.estado === "completada").reduce((s, v) => s + Number(v.total), 0);

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-gray-900">Ventas del turno</p>
          <div className="text-right">
            <p className="text-xs text-gray-400">{ventas.filter((v) => v.estado === "completada").length} ventas</p>
            <p className="text-sm font-bold text-blue-700">{cop(total)}</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número o cliente..."
            className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-center text-gray-400 py-8 text-sm">Cargando...</p>
        ) : filtradas.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Sin ventas en este turno</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Hora</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Número</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Método</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => void verDetalle(v.id)}
                  className={`cursor-pointer hover:bg-blue-50 ${v.estado === "anulada" ? "opacity-40 line-through" : ""}`}
                >
                  <td className="px-4 py-2.5 text-gray-500">
                    {new Date(v.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-2 py-2.5 font-medium text-gray-800">{v.numero}</td>
                  <td className="px-2 py-2.5 text-gray-500">{METODO_LABELS[v.metodo_pago] ?? v.metodo_pago}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{cop(v.total)}</td>
                  <td className="pr-2 text-gray-300"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal detalle venta */}
      {detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-900">{detalle.numero}</p>
                  {detalle.estado === "anulada" && (
                    <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">Anulada</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(detalle.created_at).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  {" · "}{METODO_LABELS[detalle.metodo_pago]}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400"><X className="h-5 w-5" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {detalle.nombre_cliente && (
                <p className="text-sm text-gray-600">Cliente: <span className="font-medium">{detalle.nombre_cliente}</span></p>
              )}
              <div className="space-y-1.5">
                {detalle.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.cantidad}× {item.descripcion}</span>
                    <span className="font-medium text-gray-900">{cop(item.total)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-2 space-y-1">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span><span>{cop(detalle.subtotal)}</span>
                </div>
                {Number(detalle.descuento_total) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Descuento</span><span>-{cop(detalle.descuento_total)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-500">
                  <span>IVA</span><span>{cop(detalle.iva_total)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900">
                  <span>Total</span><span className="text-blue-700">{cop(detalle.total)}</span>
                </div>
              </div>

              {/* Anulación */}
              {detalle.estado !== "anulada" && !confirmAnular && (
                <button
                  onClick={() => setConfirmAnular(true)}
                  className="w-full mt-2 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Anular venta
                </button>
              )}

              {detalle.estado !== "anulada" && confirmAnular && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    ¿Anular esta venta?
                  </div>
                  <p className="text-xs text-red-600">Se revertirá el stock. Esta acción no se puede deshacer.</p>
                  <input
                    className="w-full rounded-lg border border-red-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                    placeholder="Motivo (opcional)"
                    value={motivoAnulacion}
                    onChange={(e) => setMotivoAnulacion(e.target.value)}
                  />
                  {errorAnulacion && <p className="text-xs text-red-700">{errorAnulacion}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmAnular(false)}
                      className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => void anularVenta()}
                      disabled={!!anulandoId}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {anulandoId ? "Anulando..." : "Confirmar"}
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
