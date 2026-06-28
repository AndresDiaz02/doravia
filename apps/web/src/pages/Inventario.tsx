import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { ArrowDown, ArrowUp, SlidersHorizontal, PackageSearch } from "lucide-react";

interface StockItem {
  producto_id: string;
  bodega_id: string;
  producto_nombre: string;
  producto_codigo: string;
  bodega_nombre: string;
  stock: number;
}

interface Movimiento {
  id: string;
  tipo: "entrada" | "salida" | "ajuste";
  cantidad: string;
  costo_unitario: string | null;
  referencia_tipo: string | null;
  observaciones: string | null;
  created_at: string;
  producto: { id: string; nombre: string; codigo: string };
  bodega: { id: string; nombre: string };
}

interface Bodega { id: string; nombre: string }
interface Producto { id: string; nombre: string; codigo: string }

type TabActiva = "stock" | "movimientos";
type TipoMovimiento = "entrada" | "salida" | "ajuste";

export default function Inventario() {
  const [tab, setTab] = useState<TabActiva>("stock");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimiento>("entrada");
  const [form, setForm] = useState({
    bodega_id: "",
    producto_id: "",
    cantidad: "",
    costo_unitario: "",
    observaciones: "",
  });
  const [guardando, setGuardando] = useState(false);

  async function cargarDatos() {
    try {
      const [stockData, movsData, bodData, prodData] = await Promise.all([
        apiFetch<StockItem[]>("/api/inventario"),
        apiFetch<Movimiento[]>("/api/inventario/movimientos"),
        apiFetch<Bodega[]>("/api/bodegas"),
        apiFetch<{ data: { id: string; nombre: string; codigo: string }[] }>("/api/productos?limit=200").then((r) => r.data),
      ]);
      setStock(stockData);
      setMovimientos(movsData);
      setBodegas(bodData);
      setProductos(prodData);
    } catch {
      setError("No se pudo cargar el inventario.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargarDatos(); }, []);

  function abrirDialog(tipo: TipoMovimiento) {
    setTipoMovimiento(tipo);
    setForm({ bodega_id: bodegas[0]?.id ?? "", producto_id: "", cantidad: "", costo_unitario: "", observaciones: "" });
    setDialogOpen(true);
  }

  async function registrarMovimiento() {
    if (!form.bodega_id || !form.producto_id || !form.cantidad) return;
    setGuardando(true);
    try {
      await apiFetch(`/api/inventario/${tipoMovimiento}`, {
        method: "POST",
        body: JSON.stringify({
          bodega_id: form.bodega_id,
          producto_id: form.producto_id,
          cantidad: Number(form.cantidad),
          costo_unitario: form.costo_unitario ? Number(form.costo_unitario) : undefined,
          observaciones: form.observaciones || undefined,
        }),
      });
      setDialogOpen(false);
      cargarDatos();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar el movimiento.");
    } finally {
      setGuardando(false);
    }
  }

  const TIPO_BADGE: Record<TipoMovimiento, { label: string; variant: "green" | "red" | "blue" }> = {
    entrada: { label: "Entrada", variant: "green" },
    salida:  { label: "Salida",  variant: "red" },
    ajuste:  { label: "Ajuste",  variant: "blue" },
  };

  if (loading) return <p className="p-8 text-gray-500">Cargando inventario…</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">Control de existencias por bodega</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => abrirDialog("salida")}>
            <ArrowUp className="w-4 h-4 mr-1" /> Salida
          </Button>
          <Button variant="secondary" onClick={() => abrirDialog("ajuste")}>
            <SlidersHorizontal className="w-4 h-4 mr-1" /> Ajuste
          </Button>
          <Button onClick={() => abrirDialog("entrada")}>
            <ArrowDown className="w-4 h-4 mr-1" /> Entrada
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {(["stock", "movimientos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "stock" ? "Stock actual" : "Historial de movimientos"}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          {stock.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center gap-3">
                <PackageSearch className="w-12 h-12 text-gray-300" />
                <p className="text-gray-500">Sin movimientos registrados. Crea una entrada para empezar.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Producto</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Bodega</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stock.map((s) => (
                    <tr key={`${s.producto_id}-${s.bodega_id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.producto_codigo}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.producto_nombre}</td>
                      <td className="px-4 py-3 text-gray-600">{s.bodega_nombre}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${s.stock < 0 ? "text-red-600" : "text-gray-900"}`}>
                        {s.stock.toLocaleString("es-CO", { maximumFractionDigits: 4 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "movimientos" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {movimientos.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-gray-500 gap-2">
              <p>Sin movimientos registrados.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Producto</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Bodega</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Cantidad</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movimientos.map((m) => {
                  const info = TIPO_BADGE[m.tipo];
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={info.variant}>{info.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{m.producto.nombre}</td>
                      <td className="px-4 py-3 text-gray-600">{m.bodega.nombre}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {m.tipo === "salida" ? "-" : ""}
                        {Number(m.cantidad).toLocaleString("es-CO", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{m.observaciones ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Dialog nuevo movimiento */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <h2 className="text-lg font-semibold mb-1 capitalize">
          {tipoMovimiento === "entrada" ? "Registrar entrada" :
           tipoMovimiento === "salida" ? "Registrar salida" : "Ajuste de inventario"}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {tipoMovimiento === "ajuste"
            ? "Usa cantidades negativas para reducir el stock."
            : "La cantidad debe ser mayor a cero."}
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="bodega">Bodega *</Label>
            <select
              id="bodega"
              value={form.bodega_id}
              onChange={(e) => setForm({ ...form, bodega_id: e.target.value })}
              className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
            >
              <option value="">Selecciona bodega</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="producto">Producto *</Label>
            <select
              id="producto"
              value={form.producto_id}
              onChange={(e) => setForm({ ...form, producto_id: e.target.value })}
              className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
            >
              <option value="">Selecciona producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="cantidad">Cantidad *</Label>
            <Input
              id="cantidad"
              type="number"
              value={form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
              placeholder={tipoMovimiento === "ajuste" ? "Ej: -5 para reducir, 10 para aumentar" : "Ej: 100"}
            />
          </div>
          {tipoMovimiento === "entrada" && (
            <div>
              <Label htmlFor="costo">Costo unitario (COP)</Label>
              <Input
                id="costo"
                type="number"
                value={form.costo_unitario}
                onChange={(e) => setForm({ ...form, costo_unitario: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          )}
          <div>
            <Label htmlFor="obs">Observaciones</Label>
            <Input
              id="obs"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={registrarMovimiento}
              disabled={guardando || !form.bodega_id || !form.producto_id || !form.cantidad}
            >
              {guardando ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
