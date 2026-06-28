import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { ArrowDown, ArrowUp, ArrowLeftRight } from "lucide-react";

interface Producto { id: string; nombre: string; codigo: string | null }
interface Bodega   { id: string; nombre: string }
interface Movimiento {
  id: string;
  tipo: "entrada" | "salida" | "ajuste";
  cantidad: string;
  costo_unitario: string | null;
  referencia_tipo: string | null;
  observaciones: string | null;
  created_at: string;
  bodega: Bodega;
  delta: number;
  saldo_acumulado: number;
}
interface KardexResponse { producto: Producto; kardex: Movimiento[] }
interface ProductoLista  { id: string; nombre: string; codigo: string | null }

export default function Kardex() {
  const [productos, setProductos] = useState<ProductoLista[]>([]);
  const [productoId, setProductoId] = useState("");
  const [data, setData] = useState<KardexResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ producto_id: string; producto_nombre: string; producto_codigo: string | null }[]>("/api/inventario")
      .then((stock) => {
        const unicos = new Map<string, ProductoLista>();
        for (const s of stock) {
          if (!unicos.has(s.producto_id))
            unicos.set(s.producto_id, { id: s.producto_id, nombre: s.producto_nombre, codigo: s.producto_codigo });
        }
        setProductos([...unicos.values()]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!productoId) { setData(null); return; }
    setLoading(true);
    apiFetch<KardexResponse>(`/api/inventario/kardex/${productoId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [productoId]);

  const iconTipo = (tipo: Movimiento["tipo"]) => {
    if (tipo === "entrada") return <ArrowDown className="h-3.5 w-3.5 text-green-600" />;
    if (tipo === "salida")  return <ArrowUp className="h-3.5 w-3.5 text-red-500" />;
    return <ArrowLeftRight className="h-3.5 w-3.5 text-blue-500" />;
  };

  const colorDelta = (delta: number) =>
    delta > 0 ? "text-green-700 font-medium" : delta < 0 ? "text-red-600 font-medium" : "text-gray-500";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Kardex de inventario</h1>
        <p className="text-sm text-gray-500 mt-0.5">Historial cronológico de movimientos con saldo acumulado</p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1 max-w-sm">
          <label className="block text-xs font-medium text-gray-600 mb-1">Producto</label>
          <select
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
          >
            <option value="">Selecciona un producto...</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo ? `[${p.codigo}] ` : ""}{p.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {data && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Bodega</th>
                  <th className="px-4 py-3 text-left">Referencia</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Costo unit.</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.kardex.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Sin movimientos registrados
                    </td>
                  </tr>
                )}
                {data.kardex.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString("es-CO", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 capitalize">
                        {iconTipo(m.tipo)} {m.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{m.bodega.nombre}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {m.referencia_tipo ?? "—"}
                      {m.observaciones && (
                        <span className="ml-1 text-gray-400">· {m.observaciones}</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${colorDelta(m.delta)}`}>
                      {m.delta > 0 ? "+" : ""}{m.delta.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">
                      {m.costo_unitario
                        ? `$${Number(m.costo_unitario).toLocaleString("es-CO")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                      {m.saldo_acumulado.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.kardex.length > 0 && (
            <p className="text-xs text-gray-400">
              {data.kardex.length} movimientos · Saldo actual:{" "}
              <span className="font-semibold text-gray-700">
                {data.kardex[data.kardex.length - 1].saldo_acumulado.toLocaleString("es-CO", { maximumFractionDigits: 2 })} unidades
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
