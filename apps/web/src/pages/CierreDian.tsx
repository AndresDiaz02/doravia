import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "../lib/api";
import { CheckCircle, Clock, Send, AlertTriangle } from "lucide-react";
import { Button } from "../components/ui/button";

interface VentaPendiente {
  id: string;
  numero: string;
  total: string;
  tipo_documento: "factura_electronica" | "tiquete_pos";
  estado_dian: string;
  fecha_limite_envio: string | null;
  created_at: string;
  nombre_cliente: string | null;
}

interface CierreDianResponse {
  ventas: VentaPendiente[];
  total: number;
  cantidad: number;
}

export default function CierreDian() {
  const [data, setData] = useState<CierreDianResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      const res = await apiFetch<CierreDianResponse>("/api/pos/cierre-dian");
      setData(res);
      setSeleccionadas(new Set(res.ventas.map((v) => v.id)));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void cargar(); }, []);

  function toggleTodas() {
    if (!data) return;
    if (seleccionadas.size === data.ventas.length) {
      setSeleccionadas(new Set());
    } else {
      setSeleccionadas(new Set(data.ventas.map((v) => v.id)));
    }
  }

  function toggleVenta(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function enviar() {
    if (seleccionadas.size === 0) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const res = await apiFetch<{ actualizadas: number; mensaje: string }>("/api/pos/cierre-dian/enviar", {
        method: "POST",
        body: JSON.stringify({ ids: [...seleccionadas] }),
      });
      setMensaje({ tipo: "ok", texto: res.mensaje });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof ApiError ? err.message : "Error al enviar." });
    } finally {
      setEnviando(false);
    }
  }

  const diasRestantes = () => {
    const hoy = new Date();
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return Math.ceil((finMes.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const dias = diasRestantes();
  const alertaNivel = dias <= 3 ? "error" : dias <= 7 ? "warn" : "ok";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cierre DIAN — POS</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Revisa y envía los documentos POS pendientes a la DIAN antes del cierre del mes
        </p>
      </div>

      {/* Alerta de días restantes */}
      <div className={`rounded-xl p-4 flex items-start gap-3 ${
        alertaNivel === "error" ? "bg-red-50 border border-red-200" :
        alertaNivel === "warn"  ? "bg-amber-50 border border-amber-200" :
        "bg-blue-50 border border-blue-200"
      }`}>
        {alertaNivel === "ok"
          ? <Clock className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          : <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${alertaNivel === "error" ? "text-red-500" : "text-amber-500"}`} />
        }
        <div>
          <p className={`text-sm font-medium ${
            alertaNivel === "error" ? "text-red-800" :
            alertaNivel === "warn"  ? "text-amber-800" : "text-blue-800"
          }`}>
            {dias === 0
              ? "Hoy es el último día del mes — envío obligatorio"
              : `Quedan ${dias} día${dias !== 1 ? "s" : ""} para el cierre del mes`}
          </p>
          <p className={`text-xs mt-0.5 ${
            alertaNivel === "error" ? "text-red-600" :
            alertaNivel === "warn"  ? "text-amber-600" : "text-blue-600"
          }`}>
            Los documentos pendientes deben enviarse a la DIAN antes del último día del mes.
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Cargando ventas pendientes...</p>}

      {!loading && data && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Documentos pendientes</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.cantidad}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total a reportar</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ${data.total.toLocaleString("es-CO")}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Seleccionados</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{seleccionadas.size}</p>
            </div>
          </div>

          {mensaje && (
            <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
              mensaje.tipo === "ok"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {mensaje.tipo === "ok" && <CheckCircle className="h-4 w-4" />}
              {mensaje.texto}
            </div>
          )}

          {data.ventas.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="font-medium text-gray-700">Sin documentos pendientes</p>
              <p className="text-sm text-gray-400 mt-1">Todos los documentos del mes ya fueron enviados a la DIAN.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seleccionadas.size === data.ventas.length && data.ventas.length > 0}
                    onChange={toggleTodas}
                    className="accent-green-600"
                  />
                  Seleccionar todos ({data.ventas.length})
                </label>
                <Button
                  disabled={seleccionadas.size === 0 || enviando}
                  onClick={() => void enviar()}
                  className="gap-1.5"
                >
                  <Send className="h-4 w-4" />
                  {enviando ? "Enviando..." : `Enviar ${seleccionadas.size} a la DIAN`}
                </Button>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-4 py-2.5 w-8"></th>
                    <th className="px-4 py-2.5 text-left">Número</th>
                    <th className="px-4 py-2.5 text-left">Cliente</th>
                    <th className="px-4 py-2.5 text-left">Tipo</th>
                    <th className="px-4 py-2.5 text-left">Fecha</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.ventas.map((v) => (
                    <tr
                      key={v.id}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${seleccionadas.has(v.id) ? "bg-green-50/40" : ""}`}
                      onClick={() => toggleVenta(v.id)}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(v.id)}
                          onChange={() => toggleVenta(v.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-green-600"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{v.numero}</td>
                      <td className="px-4 py-2.5 text-gray-600">{v.nombre_cliente ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          v.tipo_documento === "factura_electronica"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {v.tipo_documento === "factura_electronica" ? "Factura" : "Tiquete"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {new Date(v.created_at).toLocaleDateString("es-CO", {
                          day: "2-digit", month: "short",
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        ${Number(v.total).toLocaleString("es-CO")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
