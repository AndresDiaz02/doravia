import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Plus, PackagePlus, Trash2, Play } from "lucide-react";

interface Producto { id: string; codigo: string; nombre: string; precio_base: string }
interface Componente {
  id: string;
  cantidad: string;
  componente: { id: string; codigo: string; nombre: string; precio_base: string };
}

export default function Ensamble() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogComp, setDialogComp] = useState(false);
  const [formComp, setFormComp] = useState({ componente_id: "", cantidad: "" });
  const [guardando, setGuardando] = useState(false);

  const [dialogProducir, setDialogProducir] = useState(false);
  const [bodegas, setBodegas] = useState<{ id: string; nombre: string }[]>([]);
  const [formProducir, setFormProducir] = useState({ bodega_id: "", cantidad: "1" });
  const [produciendo, setProduciendo] = useState(false);
  const [resultadoProduccion, setResultadoProduccion] = useState<{ producidos: number; movimientos_registrados: number } | null>(null);

  async function cargarProductos() {
    try {
      const r = await apiFetch<{ data: Producto[] }>("/api/productos?limit=200");
      setProductos(r.data);
    } catch { setError("No se pudo cargar los productos."); }
    finally { setLoading(false); }
  }

  async function cargarComponentes(productoId: string) {
    try {
      const rows = await apiFetch<Componente[]>(`/api/ensamble/${productoId}/componentes`);
      setComponentes(rows);
    } catch { setError("No se pudo cargar la receta."); }
  }

  async function cargarBodegas() {
    try {
      const rows = await apiFetch<{ id: string; nombre: string }[]>("/api/bodegas");
      setBodegas(rows);
      if (rows.length > 0) setFormProducir((f) => ({ ...f, bodega_id: rows[0].id }));
    } catch { /* bodegas pueden no estar disponibles */ }
  }

  useEffect(() => { cargarProductos(); cargarBodegas(); }, []);

  function seleccionar(p: Producto) {
    setSeleccionado(p);
    setComponentes([]);
    void cargarComponentes(p.id);
  }

  async function agregarComponente() {
    if (!seleccionado || !formComp.componente_id || !formComp.cantidad) return;
    setGuardando(true);
    try {
      await apiFetch(`/api/ensamble/${seleccionado.id}/componentes`, {
        method: "POST",
        body: JSON.stringify({ componente_id: formComp.componente_id, cantidad: Number(formComp.cantidad) }),
      });
      setDialogComp(false);
      setFormComp({ componente_id: "", cantidad: "" });
      cargarComponentes(seleccionado.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al agregar componente.");
    } finally { setGuardando(false); }
  }

  async function eliminarComponente(compId: string) {
    if (!seleccionado) return;
    try {
      await apiFetch(`/api/ensamble/${seleccionado.id}/componentes/${compId}`, { method: "DELETE" });
      cargarComponentes(seleccionado.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al eliminar componente.");
    }
  }

  async function producir() {
    if (!seleccionado || !formProducir.bodega_id) return;
    setProduciendo(true);
    try {
      const r = await apiFetch<{ producidos: number; movimientos_registrados: number }>(
        `/api/ensamble/${seleccionado.id}/producir`,
        { method: "POST", body: JSON.stringify({ bodega_id: formProducir.bodega_id, cantidad: Number(formProducir.cantidad) }) }
      );
      setResultadoProduccion(r);
      cargarComponentes(seleccionado.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la producción.");
      setDialogProducir(false);
    } finally { setProduciendo(false); }
  }

  // Costo estimado de la receta
  const costoReceta = componentes.reduce(
    (s, c) => s + Number(c.cantidad) * Number(c.componente.precio_base),
    0
  );

  const productosDisponibles = productos.filter((p) => p.id !== seleccionado?.id);

  if (loading) return <p className="p-8 text-gray-500">Cargando productos…</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Ensamble de productos</h1>
        <p className="text-sm text-gray-500 mt-1">Define las recetas (BOM) de tus productos ensamblados</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Panel izquierdo: lista de productos */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">Selecciona un producto</p>
            </div>
            <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {productos.length === 0 && (
                <p className="text-sm text-gray-400 p-4">No hay productos registrados.</p>
              )}
              {productos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => seleccionar(p)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    seleccionado?.id === p.id ? "bg-green-50 border-l-2 border-l-green-600" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{p.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.codigo}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Panel derecho: receta del producto seleccionado */}
        <div className="lg:col-span-2">
          {!seleccionado ? (
            <Card>
              <CardContent className="py-20 flex flex-col items-center gap-3 text-gray-400">
                <PackagePlus className="w-14 h-14" />
                <p className="text-sm">Selecciona un producto para ver o editar su receta</p>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{seleccionado.nombre}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{seleccionado.codigo}</p>
                </div>
                <div className="flex gap-2">
                  {bodegas.length > 0 && (
                    <Button variant="secondary" onClick={() => { setResultadoProduccion(null); setDialogProducir(true); }}>
                      <Play className="w-4 h-4 mr-1" /> Producir
                    </Button>
                  )}
                  <Button onClick={() => { setFormComp({ componente_id: "", cantidad: "" }); setDialogComp(true); }}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar componente
                  </Button>
                </div>
              </div>

              {componentes.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
                  <p className="text-sm">Sin componentes. Agrega los insumos que forman este producto.</p>
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Componente</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Cantidad</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Costo unit.</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Subtotal</th>
                        <th className="px-4 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {componentes.map((c) => {
                        const subtotal = Number(c.cantidad) * Number(c.componente.precio_base);
                        return (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{c.componente.nombre}</p>
                              <p className="text-xs text-gray-400">{c.componente.codigo}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-700">{Number(c.cantidad).toLocaleString("es-CO", { maximumFractionDigits: 4 })}</td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {Number(c.componente.precio_base).toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-800">
                              {subtotal.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                onClick={() => void eliminarComponente(c.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-between text-sm font-medium">
                    <span className="text-gray-600">Costo total de la receta</span>
                    <span className="text-gray-900">{costoReceta.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 })}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialog agregar componente */}
      <Dialog open={dialogComp} onClose={() => setDialogComp(false)} title="Agregar componente">
        <div className="space-y-4">
          <div>
            <Label>Componente *</Label>
            <select
              value={formComp.componente_id}
              onChange={(e) => setFormComp({ ...formComp, componente_id: e.target.value })}
              className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
            >
              <option value="">Selecciona un producto/insumo</option>
              {productosDisponibles.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="cant">Cantidad requerida *</Label>
            <Input
              id="cant"
              type="number"
              step="0.0001"
              value={formComp.cantidad}
              onChange={(e) => setFormComp({ ...formComp, cantidad: e.target.value })}
              placeholder="Ej: 2.5"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogComp(false)}>Cancelar</Button>
            <Button onClick={() => void agregarComponente()} disabled={guardando || !formComp.componente_id || !formComp.cantidad}>
              {guardando ? "Guardando…" : "Agregar"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Dialog producir */}
      <Dialog open={dialogProducir} onClose={() => { setDialogProducir(false); setResultadoProduccion(null); }} title="Registrar producción">
        {resultadoProduccion ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-lg font-semibold text-green-800">✓ Producción registrada</p>
              <p className="text-sm text-green-700 mt-1">
                {resultadoProduccion.producidos} unidad(es) producida(s) — {resultadoProduccion.movimientos_registrados} movimiento(s) de inventario generado(s)
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { setDialogProducir(false); setResultadoProduccion(null); }}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Registra la producción de <strong>{seleccionado?.nombre}</strong>. Se descontarán automáticamente los componentes del inventario.
            </p>
            <div>
              <Label>Bodega *</Label>
              <select
                value={formProducir.bodega_id}
                onChange={(e) => setFormProducir({ ...formProducir, bodega_id: e.target.value })}
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
              >
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cantprod">Cantidad a producir *</Label>
              <Input
                id="cantprod"
                type="number"
                min="1"
                value={formProducir.cantidad}
                onChange={(e) => setFormProducir({ ...formProducir, cantidad: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialogProducir(false)}>Cancelar</Button>
              <Button onClick={() => void producir()} disabled={produciendo || !formProducir.bodega_id}>
                {produciendo ? "Registrando…" : "Confirmar producción"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
