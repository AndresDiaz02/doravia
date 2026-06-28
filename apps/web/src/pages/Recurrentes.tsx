import { useEffect, useState } from "react";
import { apiFetch, cop, fecha } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Plus, Play, Pause, RefreshCw, CalendarClock } from "lucide-react";

const FRECUENCIAS = [
  { value: "diaria", label: "Diaria" },
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "bimestral", label: "Bimestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

interface Cliente { id: string; nombre: string }
interface Producto { id: string; nombre: string; codigo: string; precio_venta: number }

interface ItemLinea {
  producto_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  iva_pct: number;
}

interface Plantilla {
  id: string;
  nombre: string;
  frecuencia: string;
  dias_vencimiento: number;
  activo: boolean;
  proxima_ejecucion: string;
  ultima_ejecucion: string | null;
  items: ItemLinea[];
  observaciones: string | null;
  cliente: { id: string; nombre: string };
}

const itemVacio = (): ItemLinea => ({
  descripcion: "",
  cantidad: 1,
  precio_unitario: 0,
  descuento_pct: 0,
  iva_pct: 19,
});

export default function Recurrentes() {
  const { isContador } = useAuth();
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Plantilla | null>(null);
  const [ejecutando, setEjecutando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hoy = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    nombre: "",
    cliente_id: "",
    frecuencia: "mensual",
    dias_vencimiento: "30",
    proxima_ejecucion: hoy,
    observaciones: "",
  });
  const [items, setItems] = useState<ItemLinea[]>([itemVacio()]);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      const [plts, cls, prods] = await Promise.all([
        apiFetch<Plantilla[]>("/api/recurrentes"),
        apiFetch<{ data: Cliente[] }>("/api/clientes?limit=200"),
        apiFetch<{ data: Producto[] }>("/api/productos?limit=200"),
      ]);
      setPlantillas(plts);
      setClientes(cls.data);
      setProductos(prods.data);
    } catch {
      setError("No se pudo cargar los datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirCrear() {
    setEditando(null);
    setForm({ nombre: "", cliente_id: clientes[0]?.id ?? "", frecuencia: "mensual", dias_vencimiento: "30", proxima_ejecucion: hoy, observaciones: "" });
    setItems([itemVacio()]);
    setDialogOpen(true);
  }

  function abrirEditar(p: Plantilla) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      cliente_id: p.cliente.id,
      frecuencia: p.frecuencia,
      dias_vencimiento: String(p.dias_vencimiento),
      proxima_ejecucion: p.proxima_ejecucion,
      observaciones: p.observaciones ?? "",
    });
    setItems(p.items.map((i) => ({ ...i })));
    setDialogOpen(true);
  }

  function setItem(idx: number, campo: Partial<ItemLinea>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...campo } : it)));
  }

  function selectProducto(idx: number, productoId: string) {
    const prod = productos.find((p) => p.id === productoId);
    if (prod) {
      setItem(idx, {
        producto_id: prod.id,
        descripcion: prod.nombre,
        precio_unitario: prod.precio_venta ?? 0,
      });
    }
  }

  async function guardar() {
    if (!form.nombre || !form.cliente_id || items.some((i) => !i.descripcion || !i.cantidad)) return;
    setGuardando(true);
    try {
      const body = {
        nombre: form.nombre,
        cliente_id: form.cliente_id,
        frecuencia: form.frecuencia,
        dias_vencimiento: Number(form.dias_vencimiento),
        proxima_ejecucion: form.proxima_ejecucion,
        observaciones: form.observaciones || null,
        items: items.map((i) => ({
          producto_id: i.producto_id || undefined,
          descripcion: i.descripcion,
          cantidad: Number(i.cantidad),
          precio_unitario: Number(i.precio_unitario),
          descuento_pct: Number(i.descuento_pct),
          iva_pct: Number(i.iva_pct),
        })),
      };
      if (editando) {
        await apiFetch(`/api/recurrentes/${editando.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/recurrentes", { method: "POST", body: JSON.stringify(body) });
      }
      setDialogOpen(false);
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar la plantilla.");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(p: Plantilla) {
    try {
      await apiFetch(`/api/recurrentes/${p.id}`, { method: "PATCH", body: JSON.stringify({ activo: !p.activo }) });
      cargar();
    } catch {
      setError("No se pudo actualizar la plantilla.");
    }
  }

  async function ejecutarAhora(p: Plantilla) {
    setEjecutando(p.id);
    try {
      await apiFetch(`/api/recurrentes/${p.id}/ejecutar`, { method: "POST" });
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al ejecutar la plantilla.");
    } finally {
      setEjecutando(null);
    }
  }

  if (loading) return <p className="p-8 text-gray-500">Cargando plantillas…</p>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Facturación recurrente</h1>
          <p className="text-sm text-gray-500 mt-1">
            Genera facturas automáticamente según la frecuencia configurada.
          </p>
        </div>
        {!isContador && (
          <Button onClick={abrirCrear}>
            <Plus className="w-4 h-4 mr-1" /> Nueva plantilla
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {plantillas.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <CalendarClock className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">Todavía no hay plantillas de facturación recurrente.</p>
            {!isContador && <Button onClick={abrirCrear}><Plus className="w-4 h-4 mr-1" /> Crear primera plantilla</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plantillas.map((p) => (
            <Card key={p.id} className={p.activo ? "" : "opacity-60"}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{p.nombre}</CardTitle>
                      <Badge variant={p.activo ? "green" : "gray"}>
                        {p.activo ? "Activa" : "Pausada"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {p.cliente.nombre} · {FRECUENCIAS.find((f) => f.value === p.frecuencia)?.label ?? p.frecuencia}
                    </p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>Próxima ejecución: <strong className="text-gray-700">{fecha(p.proxima_ejecucion)}</strong></p>
                    {p.ultima_ejecucion && (
                      <p>Última: {fecha(p.ultima_ejecucion)}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => abrirEditar(p)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleActivo(p)}
                  title={p.activo ? "Pausar" : "Activar"}
                >
                  {p.activo ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {p.activo ? "Pausar" : "Activar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => ejecutarAhora(p)}
                  disabled={ejecutando === p.id || !p.activo}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ejecutando === p.id ? "animate-spin" : ""}`} />
                  {ejecutando === p.id ? "Generando…" : "Ejecutar ahora"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <h2 className="text-lg font-semibold mb-4">
          {editando ? "Editar plantilla" : "Nueva plantilla recurrente"}
        </h2>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="nombre">Nombre de la plantilla *</Label>
              <Input id="nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Arriendo mensual — Local 201" />
            </div>
            <div className="col-span-2">
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
            <div>
              <Label>Frecuencia *</Label>
              <select
                value={form.frecuencia}
                onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
              >
                {FRECUENCIAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="diasvenc">Días de vencimiento</Label>
              <Input id="diasvenc" type="number" min="0" value={form.dias_vencimiento} onChange={(e) => setForm({ ...form, dias_vencimiento: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="proxima">Primera / próxima ejecución *</Label>
              <Input id="proxima" type="date" value={form.proxima_ejecucion} onChange={(e) => setForm({ ...form, proxima_ejecucion: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="obs">Observaciones</Label>
              <Input id="obs" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Opcional" />
            </div>
          </div>

          {/* Líneas */}
          <div>
            <Label>Ítems *</Label>
            <div className="mt-2 space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                  <div className="col-span-4">
                    <select
                      value={item.producto_id ?? ""}
                      onChange={(e) => e.target.value ? selectProducto(idx, e.target.value) : setItem(idx, { producto_id: undefined })}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:ring-1 focus:ring-action"
                    >
                      <option value="">Texto libre</option>
                      {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <Input
                    className="col-span-3 text-xs py-1.5"
                    placeholder="Descripción"
                    value={item.descripcion}
                    onChange={(e) => setItem(idx, { descripcion: e.target.value })}
                  />
                  <Input
                    className="col-span-1 text-xs py-1.5"
                    type="number"
                    placeholder="Cant"
                    value={item.cantidad}
                    onChange={(e) => setItem(idx, { cantidad: Number(e.target.value) })}
                  />
                  <Input
                    className="col-span-2 text-xs py-1.5"
                    type="number"
                    placeholder="Precio"
                    value={item.precio_unitario}
                    onChange={(e) => setItem(idx, { precio_unitario: Number(e.target.value) })}
                  />
                  <Input
                    className="col-span-1 text-xs py-1.5"
                    type="number"
                    placeholder="IVA%"
                    value={item.iva_pct}
                    onChange={(e) => setItem(idx, { iva_pct: Number(e.target.value) })}
                  />
                  <button
                    className="col-span-1 text-gray-400 hover:text-red-500 text-lg font-bold text-center"
                    onClick={() => items.length > 1 && setItems((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="text-sm text-green-600 hover:text-green-700 font-medium"
                onClick={() => setItems((prev) => [...prev, itemVacio()])}
              >
                + Agregar línea
              </button>
            </div>
          </div>

          {/* Preview total */}
          <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm flex justify-between">
            <span className="text-gray-600">Total estimado por factura</span>
            <span className="font-semibold text-gray-900">
              {cop(items.reduce((s, i) => {
                const sub = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100);
                return s + sub + sub * (i.iva_pct / 100);
              }, 0))}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            onClick={guardar}
            disabled={guardando || !form.nombre || !form.cliente_id || !form.proxima_ejecucion}
          >
            {guardando ? "Guardando…" : "Guardar plantilla"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
