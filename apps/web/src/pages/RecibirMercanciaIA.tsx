import { useState, useRef, type ChangeEvent } from "react";
import { Sparkles, Upload, Loader2, PackageCheck } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface ItemIA {
  nombre: string;
  codigo: string | null;
  cantidad: number;
  precio_costo: number;
}

interface ResultadoCompra {
  proveedor_nombre: string | null;
  proveedor_nit: string | null;
  fecha: string | null;
  confianza: "alta" | "media" | "baja";
  items: ItemIA[];
}

interface Bodega { id: string; nombre: string }
interface Producto { id: string; nombre: string; codigo: string }

interface FilaEditable {
  ia: ItemIA;
  producto_id: string;
  cantidad: number;
  precio_costo: number;
  precio_venta: number;
}

interface Props {
  bodegas: Bodega[];
  productos: Producto[];
  onSuccess: () => void;
}

const CONFIANZA_COLOR = { alta: "text-green-600", media: "text-yellow-600", baja: "text-red-500" };

export function RecibirMercanciaIA({ bodegas, productos, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCompra | null>(null);
  const [filas, setFilas] = useState<FilaEditable[]>([]);
  const [markup, setMarkup] = useState("30");
  const [bodegaId, setBodegaId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setResultado(null);
    setFilas([]);
    setError(null);
    setAnalizando(false);
    setGuardando(false);
  }

  function abrir() {
    reset();
    setBodegaId(bodegas[0]?.id ?? "");
    setOpen(true);
  }

  function calcPrecioVenta(costo: number, pct: number) {
    return Math.ceil(costo * (1 + pct / 100));
  }

  function buscarProducto(nombre: string, codigo: string | null): string {
    if (codigo) {
      const match = productos.find((p) => p.codigo.toLowerCase() === codigo.toLowerCase());
      if (match) return match.id;
    }
    const slug = nombre.toLowerCase().slice(0, 10);
    const match = productos.find(
      (p) => p.nombre.toLowerCase().includes(slug) || slug.includes(p.nombre.toLowerCase().slice(0, 8)),
    );
    return match?.id ?? "";
  }

  async function handleArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAnalizando(true);
    setError(null);
    setResultado(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const data = await apiFetch<ResultadoCompra>("/api/ia/analizar-compra", {
        method: "POST",
        body: JSON.stringify({ imagen_base64: base64, media_type: file.type }),
      });

      setResultado(data);
      const pct = Number(markup) || 30;
      setFilas(
        data.items.map((item) => ({
          ia: item,
          producto_id: buscarProducto(item.nombre, item.codigo),
          cantidad: item.cantidad,
          precio_costo: item.precio_costo,
          precio_venta: calcPrecioVenta(item.precio_costo, pct),
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al analizar el documento.");
    } finally {
      setAnalizando(false);
    }
  }

  function actualizarFila(idx: number, campo: Partial<FilaEditable>) {
    setFilas((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f;
        const merged = { ...f, ...campo };
        if ("precio_costo" in campo) {
          merged.precio_venta = calcPrecioVenta(merged.precio_costo, Number(markup) || 30);
        }
        return merged;
      }),
    );
  }

  function recalcularPrecios() {
    const pct = Number(markup) || 30;
    setFilas((prev) => prev.map((f) => ({ ...f, precio_venta: calcPrecioVenta(f.precio_costo, pct) })));
  }

  async function confirmar() {
    const validos = filas.filter((f) => f.producto_id && f.cantidad > 0 && f.precio_costo >= 0);
    if (validos.length === 0) {
      setError("Asigna al menos un producto con cantidad válida.");
      return;
    }
    if (!bodegaId) {
      setError("Selecciona una bodega.");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      await apiFetch("/api/inventario/recibir-lote", {
        method: "POST",
        body: JSON.stringify({
          bodega_id: bodegaId,
          items: validos.map((f) => ({
            producto_id: f.producto_id,
            cantidad: f.cantidad,
            precio_costo: f.precio_costo,
            nuevo_precio_venta: f.precio_venta > 0 ? f.precio_venta : undefined,
          })),
          proveedor_nombre: resultado?.proveedor_nombre ?? undefined,
          fecha: resultado?.fecha ?? undefined,
          crear_gasto: true,
        }),
      });
      setOpen(false);
      reset();
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al registrar la recepción.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={abrir}>
        <Sparkles className="w-4 h-4 mr-1 text-violet-500" />
        Recibir con IA
      </Button>

      <Dialog open={open} onClose={() => { setOpen(false); reset(); }} title="Recibir mercancía con IA">
        <div className="w-[680px] space-y-5">

          {/* Paso 1: carga de imagen */}
          {!resultado && (
            <div className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50 px-6 py-10 text-center">
              <Sparkles className="mx-auto mb-3 h-9 w-9 text-violet-400" />
              <p className="text-sm font-semibold text-gray-800 mb-1">
                Sube la foto de la factura del proveedor
              </p>
              <p className="text-xs text-gray-500 mb-5">
                La IA extrae ítems, cantidades y precios. Podrás editar antes de confirmar.
              </p>
              <Button onClick={() => fileInputRef.current?.click()} disabled={analizando}>
                {analizando ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analizando con IA…</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />Seleccionar imagen</>
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void handleArchivo(e)}
              />
            </div>
          )}

          {/* Paso 2: tabla de resultados */}
          {resultado && (
            <>
              {/* Cabecera proveedor */}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
                <div className="space-x-3">
                  {resultado.proveedor_nombre && (
                    <span className="font-medium text-gray-800">{resultado.proveedor_nombre}</span>
                  )}
                  {resultado.proveedor_nit && (
                    <span className="text-gray-400">NIT {resultado.proveedor_nit}</span>
                  )}
                  {resultado.fecha && <span className="text-gray-500">{resultado.fecha}</span>}
                  <span className={`text-xs font-semibold ${CONFIANZA_COLOR[resultado.confianza]}`}>
                    · Confianza {resultado.confianza}
                  </span>
                </div>
                <button
                  className="text-xs text-violet-600 underline"
                  onClick={() => { reset(); setTimeout(() => fileInputRef.current?.click(), 50); }}
                >
                  Cambiar imagen
                </button>
              </div>

              {/* Bodega + markup */}
              <div className="flex gap-4 items-end">
                <div className="space-y-1.5 flex-1">
                  <Label>Bodega destino *</Label>
                  <select
                    value={bodegaId}
                    onChange={(e) => setBodegaId(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— seleccionar —</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Markup de venta %</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={markup}
                      onChange={(e) => setMarkup(e.target.value)}
                      className="w-20 text-right"
                    />
                    <Button variant="secondary" type="button" onClick={recalcularPrecios} className="whitespace-nowrap">
                      Aplicar
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tabla de ítems */}
              <div className="overflow-auto max-h-60 rounded-md border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 w-40">Detectado por IA</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Producto en sistema</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 w-16">Cant.</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 w-28">Costo unit.</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 w-28">Precio venta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filas.map((fila, idx) => (
                      <tr key={idx} className={!fila.producto_id ? "bg-yellow-50" : ""}>
                        <td className="px-3 py-2 text-gray-700">
                          <p className="font-medium leading-tight">{fila.ia.nombre}</p>
                          {fila.ia.codigo && (
                            <p className="text-gray-400 font-mono mt-0.5">{fila.ia.codigo}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={fila.producto_id}
                            onChange={(e) => actualizarFila(idx, { producto_id: e.target.value })}
                            className="block w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">— omitir ítem —</option>
                            {productos.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0.01"
                            step="any"
                            value={fila.cantidad}
                            onChange={(e) => actualizarFila(idx, { cantidad: Number(e.target.value) })}
                            className="w-16 text-right h-7 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={fila.precio_costo}
                            onChange={(e) => actualizarFila(idx, { precio_costo: Number(e.target.value) })}
                            className="w-28 text-right h-7 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={fila.precio_venta}
                            onChange={(e) => actualizarFila(idx, { precio_venta: Number(e.target.value) })}
                            className="w-28 text-right h-7 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">
                Filas amarillas serán omitidas. El precio de venta actualiza el producto en el catálogo.
              </p>
            </>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
          )}

          {resultado && (
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => { setOpen(false); reset(); }}>
                Cancelar
              </Button>
              <Button onClick={() => void confirmar()} disabled={guardando}>
                {guardando ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Registrando…</>
                ) : (
                  <><PackageCheck className="w-4 h-4 mr-2" />Confirmar recepción</>
                )}
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
