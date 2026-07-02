import { useState } from "react";
import { ShoppingCart, TrendingUp, TrendingDown, AlertTriangle, Loader2, Sparkles, Package } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

interface ProductoAnalisis {
  nombre: string;
  codigo: string;
  stock_actual: number;
  unidad: string;
  costo_unitario: number;
  precio_venta: number;
  margen_pct: number;
  unidades_vendidas_30d: number;
  ingresos_30d: number;
}

interface Recomendacion {
  producto: string;
  cantidad_sugerida: number;
  motivo: string;
  costo_estimado: number;
  prioridad: "alta" | "media" | "baja";
}

interface ConsejoIA {
  resumen: string;
  alertas: string[];
  recomendaciones: Recomendacion[];
  costo_total_sugerido: number;
  presupuesto_restante: number;
  consejo_general: string;
}

interface Respuesta {
  consejo: ConsejoIA;
  analisis: ProductoAnalisis[];
}

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

const PRIORIDAD_COLORS: Record<string, string> = {
  alta: "bg-red-100 text-red-700 border-red-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  baja: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function AsesorPedidos() {
  const [presupuesto, setPresupuesto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    const monto = Number(presupuesto.replace(/\D/g, ""));
    if (!monto || monto <= 0) { setError("Ingresa un presupuesto válido."); return; }
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const data = await apiFetch<Respuesta>("/api/inventario/consejo-pedido", {
        method: "POST",
        body: JSON.stringify({ presupuesto: monto }),
      });
      setResultado(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al generar el consejo.");
    } finally {
      setCargando(false);
    }
  }

  const altaRotacion = resultado?.analisis.filter((p) => p.unidades_vendidas_30d > 0).slice(0, 10) ?? [];
  const sinVentas = resultado?.analisis.filter((p) => p.unidades_vendidas_30d === 0).slice(0, 8) ?? [];
  const mayorMargen = resultado ? [...resultado.analisis].filter((p) => p.precio_venta > 0).sort((a, b) => b.margen_pct - a.margen_pct).slice(0, 6) : [];
  const menorMargen = resultado ? [...resultado.analisis].filter((p) => p.precio_venta > 0).sort((a, b) => a.margen_pct - b.margen_pct).slice(0, 6) : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          Asesor de pedidos con IA
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Ingresa tu presupuesto y la IA analiza rotación, stock y márgenes para recomendarte qué pedir.
        </p>
      </div>

      {/* Input presupuesto */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium text-gray-700">Presupuesto disponible (COP)</label>
            <Input
              type="number"
              min="0"
              step="50000"
              placeholder="Ej: 2000000"
              value={presupuesto}
              onChange={(e) => setPresupuesto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void generar(); }}
            />
          </div>
          <Button onClick={() => void generar()} disabled={cargando} className="flex-shrink-0">
            {cargando ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Generar consejo</>
            )}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {cargando && (
          <p className="text-xs text-gray-400 text-center">
            Analizando {altaRotacion.length > 0 ? altaRotacion.length : "tus"} productos y generando recomendaciones...
          </p>
        )}
      </div>

      {resultado && (
        <>
          {/* Resumen IA */}
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-violet-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-violet-900">{resultado.consejo.resumen}</p>
                {resultado.consejo.alertas.length > 0 && (
                  <div className="space-y-1">
                    {resultado.consejo.alertas.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-sm text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                        {a}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-sm text-violet-700 italic">{resultado.consejo.consejo_general}</p>
              </div>
            </div>

            {/* Totales pedido */}
            <div className="flex items-center gap-6 pt-1 border-t border-violet-200">
              <div>
                <p className="text-xs text-violet-500">Costo total sugerido</p>
                <p className="text-lg font-bold text-violet-800">{cop(resultado.consejo.costo_total_sugerido)}</p>
              </div>
              <div>
                <p className="text-xs text-violet-500">Presupuesto restante</p>
                <p className={`text-lg font-bold ${resultado.consejo.presupuesto_restante >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {cop(resultado.consejo.presupuesto_restante)}
                </p>
              </div>
            </div>
          </div>

          {/* Lista de pedido recomendado */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-violet-600" />
              Lista de pedido recomendada
            </h2>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Producto</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-500">Cantidad</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-500">Costo est.</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-500">Prioridad</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 hidden md:table-cell">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resultado.consejo.recomendaciones.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.producto}</td>
                      <td className="px-3 py-3 text-center text-gray-700">{r.cantidad_sugerida}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900">{cop(r.costo_estimado)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PRIORIDAD_COLORS[r.prioridad] ?? PRIORIDAD_COLORS.baja}`}>
                          {r.prioridad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{r.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Análisis de inventario */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Alta rotación */}
            {altaRotacion.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-green-600" /> Mayor rotación (30 días)
                </h2>
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {altaRotacion.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                        <p className="text-xs text-gray-400">Stock: {p.stock_actual} {p.unidad}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-green-700">{p.unidades_vendidas_30d} {p.unidad}</p>
                        <p className="text-xs text-gray-400">en 30 días</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mayor margen */}
            {mayorMargen.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-violet-600" /> Mayor margen de ganancia
                </h2>
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {mayorMargen.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                        <p className="text-xs text-gray-400">{cop(p.costo_unitario)} costo</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-violet-700">{p.margen_pct}%</p>
                        <p className="text-xs text-gray-400">{cop(p.precio_venta)} venta</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Menor rotación */}
            {sinVentas.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <TrendingDown className="h-4 w-4 text-orange-500" /> Sin ventas en 30 días
                </h2>
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {sinVentas.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <Package className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{p.nombre}</p>
                        <p className="text-xs text-gray-400">Stock: {p.stock_actual} {p.unidad}</p>
                      </div>
                      <span className="text-xs text-orange-500 font-medium">Sin ventas</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Menor margen */}
            {menorMargen.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <TrendingDown className="h-4 w-4 text-red-500" /> Menor margen
                </h2>
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {menorMargen.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                        <p className="text-xs text-gray-400">{cop(p.costo_unitario)} costo</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${p.margen_pct < 10 ? "text-red-600" : "text-gray-700"}`}>
                          {p.margen_pct}%
                        </p>
                        <p className="text-xs text-gray-400">{cop(p.precio_venta)} venta</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
