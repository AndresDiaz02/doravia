import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch, apiFetchPaged, cop, fecha } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Plus, Lock, ExternalLink, FileText, Download } from "lucide-react";

interface Cliente { id: string; nombre: string }
interface Producto { id: string; nombre: string; codigo: string; precio_venta: number }

interface CotizacionItem {
  producto_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  iva_pct: number;
}

interface Cotizacion {
  id: string;
  numero: string;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  total: string;
  factura_id: string | null;
  cliente: { id: string; nombre: string };
}

const ESTADO_BADGE: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  borrador:   "yellow",
  enviada:    "blue",
  aceptada:   "green",
  rechazada:  "red",
  vencida:    "gray",
  convertida: "green",
};

const ESTADO_LABEL: Record<string, string> = {
  borrador:   "Borrador",
  enviada:    "Enviada",
  aceptada:   "Aceptada",
  rechazada:  "Rechazada",
  vencida:    "Vencida",
  convertida: "Convertida a factura",
};

const itemVacio = (): CotizacionItem => ({
  descripcion: "", cantidad: 1, precio_unitario: 0, descuento_pct: 0, iva_pct: 19,
});

export default function Cotizaciones() {
  const { plan, isContador } = useAuth();
  const [searchParams] = useSearchParams();
  const puedeConvertir = (plan?.features as Record<string, boolean> | undefined)?.cotizacion_a_factura === true;

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [convertirId, setConvertirId] = useState<string | null>(null);
  const [convertirFechaVenc, setConvertirFechaVenc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const clientePreseleccionado = searchParams.get("cliente_id") ?? "";

  const [form, setForm] = useState({
    cliente_id: clientePreseleccionado,
    fecha_vencimiento: "",
    observaciones: "",
  });
  const [items, setItems] = useState<CotizacionItem[]>([itemVacio()]);

  async function cargar() {
    try {
      const [cots, cls, prods] = await Promise.all([
        apiFetchPaged<Cotizacion>("/api/cotizaciones", 1, 50),
        apiFetch<{ data: Cliente[] }>("/api/clientes?limit=200"),
        apiFetch<{ data: Producto[] }>("/api/productos?limit=200"),
      ]);
      setCotizaciones(cots.data);
      setClientes(cls.data);
      setProductos(prods.data);
    } catch {
      setError("No se pudo cargar las cotizaciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function setItem(idx: number, campo: Partial<CotizacionItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...campo } : it)));
  }

  function selectProducto(idx: number, productoId: string) {
    const prod = productos.find((p) => p.id === productoId);
    if (prod) {
      setItem(idx, { producto_id: prod.id, descripcion: prod.nombre, precio_unitario: prod.precio_venta ?? 0 });
    }
  }

  const totalEstimado = items.reduce((s, i) => {
    const sub = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100);
    return s + sub + sub * (i.iva_pct / 100);
  }, 0);

  async function guardar() {
    if (!form.cliente_id || items.some((i) => !i.descripcion || !i.cantidad)) return;
    setGuardando(true);
    try {
      await apiFetch("/api/cotizaciones", {
        method: "POST",
        body: JSON.stringify({
          cliente_id: form.cliente_id,
          fecha_vencimiento: form.fecha_vencimiento || null,
          observaciones: form.observaciones || null,
          items: items.map((i) => ({
            ...i,
            producto_id: i.producto_id || undefined,
          })),
        }),
      });
      setDialogOpen(false);
      setForm({ cliente_id: "", fecha_vencimiento: "", observaciones: "" });
      setItems([itemVacio()]);
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear la cotización.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(id: string, estado: string) {
    try {
      await apiFetch(`/api/cotizaciones/${id}`, { method: "PATCH", body: JSON.stringify({ estado }) });
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al actualizar el estado.");
    }
  }

  async function convertir(id: string) {
    setGuardando(true);
    try {
      await apiFetch(`/api/cotizaciones/${id}/convertir`, {
        method: "POST",
        body: JSON.stringify({ fecha_vencimiento: convertirFechaVenc || null }),
      });
      setConvertirId(null);
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al convertir la cotización.");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) return <p className="p-8 text-gray-500">Cargando cotizaciones…</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cotizaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Crea y gestiona propuestas comerciales para tus clientes</p>
        </div>
        {!isContador && (
          <Button onClick={() => { setForm({ cliente_id: clientePreseleccionado, fecha_vencimiento: "", observaciones: "" }); setItems([itemVacio()]); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nueva cotización
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {cotizaciones.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <FileText className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">
              {isContador ? "Aún no hay cotizaciones registradas en el sistema." : "No hay cotizaciones todavía."}
            </p>
            {!isContador && <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-1" /> Crear primera cotización</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vence</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cotizaciones.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.numero}</td>
                  <td className="px-4 py-3 text-gray-700">{c.cliente.nombre}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fecha(c.fecha_emision)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {c.fecha_vencimiento ? fecha(c.fecha_vencimiento) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.estado === "convertida" && c.factura_id ? (
                      <Link to={`/facturas/${c.factura_id}`} className="flex items-center gap-1">
                        <Badge variant="green">{ESTADO_LABEL[c.estado]}</Badge>
                        <ExternalLink className="w-3 h-3 text-green-600" />
                      </Link>
                    ) : (
                      <Badge variant={ESTADO_BADGE[c.estado] ?? "gray"}>{ESTADO_LABEL[c.estado] ?? c.estado}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{cop(c.total)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {c.estado !== "convertida" && c.estado !== "rechazada" && c.estado !== "vencida" && (
                        <>
                          {c.estado === "borrador" && (
                            <button
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => cambiarEstado(c.id, "enviada")}
                            >
                              Marcar enviada
                            </button>
                          )}
                          {c.estado === "enviada" && (
                            <>
                              <button className="text-xs text-green-600 hover:underline" onClick={() => cambiarEstado(c.id, "aceptada")}>Aceptada</button>
                              <span className="text-gray-300">|</span>
                              <button className="text-xs text-red-500 hover:underline" onClick={() => cambiarEstado(c.id, "rechazada")}>Rechazada</button>
                            </>
                          )}
                          {(c.estado === "aceptada" || c.estado === "enviada") && (
                            <>
                              {puedeConvertir ? (
                                <button
                                  className="text-xs text-green-700 font-medium hover:underline ml-1"
                                  onClick={() => { setConvertirId(c.id); setConvertirFechaVenc(""); }}
                                >
                                  → Convertir a factura
                                </button>
                              ) : (
                                <span className="text-xs text-gray-300 flex items-center gap-0.5 ml-1" title="Requiere plan Raíz">
                                  <Lock className="w-3 h-3" /> Convertir
                                </span>
                              )}
                            </>
                          )}
                        </>
                      )}
                      <a
                        href={`/api/documentos/cotizaciones/${c.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 ml-1"
                        title="Descargar PDF"
                        onClick={(e) => {
                          e.preventDefault();
                          const token = localStorage.getItem("access_token") ?? "";
                          fetch(`/api/documentos/cotizaciones/${c.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
                            .then((r) => r.blob())
                            .then((b) => {
                              const url = URL.createObjectURL(b);
                              Object.assign(document.createElement("a"), { href: url, download: `${c.numero}.pdf` }).click();
                              URL.revokeObjectURL(url);
                            });
                        }}
                      >
                        <Download className="w-3 h-3" /> PDF
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog nueva cotización */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Nueva cotización">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>Cliente *</Label>
            <select
              value={form.cliente_id}
              onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
              className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
            >
              <option value="">Selecciona cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fechavenc">Vencimiento</Label>
              <Input id="fechavenc" type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="obs">Observaciones</Label>
              <Input id="obs" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Opcional" />
            </div>
          </div>

          {/* Ítems */}
          <div>
            <Label>Ítems *</Label>
            <div className="mt-2 space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                  <div className="col-span-4">
                    <select
                      value={item.producto_id ?? ""}
                      onChange={(e) => e.target.value ? selectProducto(idx, e.target.value) : setItem(idx, { producto_id: undefined })}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                    >
                      <option value="">Texto libre</option>
                      {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <Input className="col-span-3 text-xs py-1.5" placeholder="Descripción" value={item.descripcion} onChange={(e) => setItem(idx, { descripcion: e.target.value })} />
                  <Input className="col-span-1 text-xs py-1.5" type="number" placeholder="Cant" value={item.cantidad} onChange={(e) => setItem(idx, { cantidad: Number(e.target.value) })} />
                  <Input className="col-span-2 text-xs py-1.5" type="number" placeholder="Precio" value={item.precio_unitario} onChange={(e) => setItem(idx, { precio_unitario: Number(e.target.value) })} />
                  <Input className="col-span-1 text-xs py-1.5" type="number" placeholder="IVA%" value={item.iva_pct} onChange={(e) => setItem(idx, { iva_pct: Number(e.target.value) })} />
                  <button className="col-span-1 text-gray-400 hover:text-red-500 text-lg font-bold text-center" onClick={() => items.length > 1 && setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}>×</button>
                </div>
              ))}
              <button className="text-sm text-green-600 hover:text-green-700 font-medium" onClick={() => setItems((prev) => [...prev, itemVacio()])}>+ Agregar línea</button>
            </div>
          </div>

          <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm flex justify-between">
            <span className="text-gray-600">Total estimado</span>
            <span className="font-semibold">{cop(totalEstimado)}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || !form.cliente_id}>{guardando ? "Creando…" : "Crear cotización"}</Button>
        </div>
      </Dialog>

      {/* Dialog convertir a factura */}
      <Dialog open={convertirId !== null} onClose={() => setConvertirId(null)} title="Convertir cotización a factura">
        <p className="text-sm text-gray-500 mb-4">Se generará una factura electrónica con los mismos ítems de la cotización.</p>
        <div>
          <Label htmlFor="convvenc">Fecha de vencimiento de la factura</Label>
          <Input id="convvenc" type="date" value={convertirFechaVenc} onChange={(e) => setConvertirFechaVenc(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-4 mt-4">
          <Button variant="secondary" onClick={() => setConvertirId(null)}>Cancelar</Button>
          <Button onClick={() => convertirId && convertir(convertirId)} disabled={guardando}>
            {guardando ? "Convirtiendo…" : "Convertir y emitir factura"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
