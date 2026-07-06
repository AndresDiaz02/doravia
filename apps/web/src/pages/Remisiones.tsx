import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronRight, FileDown } from "lucide-react";
import { apiFetch, ApiError, cop, fecha, descargarExcel } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";

interface Cliente {
  id: string;
  nombre: string;
  nit_cc: string | null;
}

interface Producto {
  id: string;
  nombre: string;
  codigo: string | null;
  precio_venta: string | null;
}

interface ItemRemisionForm {
  producto_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

interface Remision {
  id: string;
  numero: string;
  consecutivo: number;
  cliente_id: string | null;
  nombre_cliente: string | null;
  fecha: string;
  fecha_entrega: string | null;
  total: string;
  estado: "borrador" | "enviada" | "entregada" | "anulada";
  observaciones: string | null;
}

const ESTADO_BADGE: Record<string, "yellow" | "blue" | "green" | "red" | "gray"> = {
  borrador: "yellow",
  enviada: "blue",
  entregada: "green",
  anulada: "red",
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  entregada: "Entregada",
  anulada: "Anulada",
};

const ESTADO_SIGUIENTE: Record<string, "enviada" | "entregada" | null> = {
  borrador: "enviada",
  enviada: "entregada",
  entregada: null,
  anulada: null,
};

const ESTADO_SIGUIENTE_LABEL: Record<string, string> = {
  borrador: "Marcar como enviada",
  enviada: "Marcar como entregada",
};

const TABS = [
  { value: "", label: "Todas" },
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Enviada" },
  { value: "entregada", label: "Entregada" },
];

export default function Remisiones() {
  const [remisiones, setRemisiones] = useState<Remision[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Datos de referencia
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  // Modal nueva remisión
  const [modalNuevo, setModalNuevo] = useState(false);
  const [form, setForm] = useState({
    cliente_id: "",
    nombre_cliente: "",
    direccion_entrega: "",
    fecha: new Date().toISOString().slice(0, 10),
    fecha_entrega: "",
    observaciones: "",
  });
  const [items, setItems] = useState<ItemRemisionForm[]>([
    { descripcion: "", cantidad: 1, precio_unitario: 0 },
  ]);
  const [guardando, setGuardando] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  // Modal detalle / cambio de estado
  const [modalDetalle, setModalDetalle] = useState<Remision | null>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  async function cargarRemisiones() {
    setCargando(true);
    setError(null);
    try {
      const url = filtroEstado ? `/api/remisiones?estado=${filtroEstado}` : "/api/remisiones";
      const data = await apiFetch<Remision[]>(url);
      setRemisiones(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar remisiones.");
    } finally {
      setCargando(false);
    }
  }

  async function cargarReferencias() {
    try {
      const [cs, ps] = await Promise.all([
        apiFetch<Cliente[]>("/api/clientes"),
        apiFetch<Producto[]>("/api/productos"),
      ]);
      setClientes(cs);
      setProductos(ps);
    } catch {
      // Silencioso: no es bloqueante
    }
  }

  useEffect(() => { void cargarRemisiones(); }, [filtroEstado]);
  useEffect(() => { void cargarReferencias(); }, []);

  const totalItems = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);

  function agregarItem() {
    setItems((prev) => [...prev, { descripcion: "", cantidad: 1, precio_unitario: 0 }]);
  }

  function eliminarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function actualizarItem(idx: number, campo: keyof ItemRemisionForm, valor: string | number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, [campo]: valor } : item,
      ),
    );
  }

  function seleccionarProducto(idx: number, productoId: string) {
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) return;
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              producto_id: prod.id,
              descripcion: prod.nombre,
              precio_unitario: prod.precio_venta ? Number(prod.precio_venta) : 0,
            }
          : item,
      ),
    );
  }

  function abrirModalNuevo() {
    setForm({
      cliente_id: "",
      nombre_cliente: "",
      direccion_entrega: "",
      fecha: new Date().toISOString().slice(0, 10),
      fecha_entrega: "",
      observaciones: "",
    });
    setItems([{ descripcion: "", cantidad: 1, precio_unitario: 0 }]);
    setErrorNuevo(null);
    setModalNuevo(true);
  }

  async function handleCrear() {
    setErrorNuevo(null);
    const itemsValidos = items.filter((i) => i.descripcion.trim());
    if (itemsValidos.length === 0) {
      setErrorNuevo("Agrega al menos un ítem con descripción.");
      return;
    }
    if (!form.fecha) {
      setErrorNuevo("La fecha es requerida.");
      return;
    }

    setGuardando(true);
    try {
      await apiFetch("/api/remisiones", {
        method: "POST",
        body: JSON.stringify({
          cliente_id: form.cliente_id || undefined,
          nombre_cliente: form.nombre_cliente || undefined,
          direccion_entrega: form.direccion_entrega || undefined,
          fecha: form.fecha,
          fecha_entrega: form.fecha_entrega || undefined,
          observaciones: form.observaciones || undefined,
          items: itemsValidos,
        }),
      });
      setModalNuevo(false);
      void cargarRemisiones();
    } catch (err) {
      setErrorNuevo(err instanceof ApiError ? err.message : "Error al crear remisión.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleCambiarEstado(remision: Remision, nuevoEstado: string) {
    setCambiandoEstado(true);
    try {
      await apiFetch(`/api/remisiones/${remision.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      setModalDetalle(null);
      void cargarRemisiones();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Error al cambiar estado.");
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function handleEliminar(remision: Remision) {
    if (!window.confirm(`¿Eliminar la remisión ${remision.numero}? Esta acción no se puede deshacer.`)) return;
    try {
      await apiFetch(`/api/remisiones/${remision.id}`, { method: "DELETE" });
      setModalDetalle(null);
      void cargarRemisiones();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Error al eliminar.");
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Remisiones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Documentos de entrega sin valor fiscal. No reemplazan a la factura electrónica.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void descargarExcel("/api/exportar/remisiones", "remisiones.xlsx")}>
            <FileDown className="h-4 w-4" />
            Excel
          </Button>
          <Button onClick={abrirModalNuevo}>
            <Plus className="h-4 w-4" />
            Nueva remisión
          </Button>
        </div>
      </div>

      {/* Pestañas de filtro */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFiltroEstado(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filtroEstado === tab.value
                ? "border-action text-action"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">Cargando...</div>
      ) : error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : remisiones.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-400">
          <p className="text-sm">No hay remisiones{filtroEstado ? ` en estado "${ESTADO_LABEL[filtroEstado]}"` : ""}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Número</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {remisiones.map((rem) => (
                <tr key={rem.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setModalDetalle(rem)}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{rem.numero}</td>
                  <td className="px-4 py-3 text-gray-600">{fecha(rem.fecha)}</td>
                  <td className="px-4 py-3 text-gray-700">{rem.nombre_cliente ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{cop(rem.total)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={ESTADO_BADGE[rem.estado] ?? "gray"}>{ESTADO_LABEL[rem.estado] ?? rem.estado}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Nueva remisión */}
      <Dialog
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="Nueva remisión"
        className="max-w-3xl"
      >
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
          {/* Datos del cliente */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rem-cliente">Cliente</Label>
              <select
                id="rem-cliente"
                value={form.cliente_id}
                onChange={(e) => {
                  const cli = clientes.find((c) => c.id === e.target.value);
                  setForm((p) => ({
                    ...p,
                    cliente_id: e.target.value,
                    nombre_cliente: cli?.nombre ?? "",
                  }));
                }}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Sin cliente registrado —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-nombre-cliente">Nombre cliente (texto libre)</Label>
              <Input
                id="rem-nombre-cliente"
                placeholder="Opcional si se seleccionó cliente"
                value={form.nombre_cliente}
                onChange={(e) => setForm((p) => ({ ...p, nombre_cliente: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-fecha">Fecha *</Label>
              <Input
                id="rem-fecha"
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-fecha-entrega">Fecha de entrega (opcional)</Label>
              <Input
                id="rem-fecha-entrega"
                type="date"
                value={form.fecha_entrega}
                onChange={(e) => setForm((p) => ({ ...p, fecha_entrega: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rem-direccion">Dirección de entrega (opcional)</Label>
              <Input
                id="rem-direccion"
                placeholder="Calle 123 # 45-67, Bogotá"
                value={form.direccion_entrega}
                onChange={(e) => setForm((p) => ({ ...p, direccion_entrega: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rem-obs">Observaciones (opcional)</Label>
              <Input
                id="rem-obs"
                placeholder="Condiciones de entrega, referencias, etc."
                value={form.observaciones}
                onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))}
              />
            </div>
          </div>

          {/* Tabla de ítems */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Ítems</h3>
              <Button type="button" variant="secondary" onClick={agregarItem}>
                <Plus className="h-3.5 w-3.5" />
                Agregar ítem
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  {/* Buscador de producto */}
                  <div className="col-span-3">
                    {idx === 0 && <p className="text-xs text-gray-400 mb-1">Producto</p>}
                    <select
                      value={item.producto_id ?? ""}
                      onChange={(e) => seleccionarProducto(idx, e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                    >
                      <option value="">— Libre —</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {/* Descripción */}
                  <div className="col-span-4">
                    {idx === 0 && <p className="text-xs text-gray-400 mb-1">Descripción *</p>}
                    <Input
                      placeholder="Descripción del ítem"
                      value={item.descripcion}
                      onChange={(e) => actualizarItem(idx, "descripcion", e.target.value)}
                    />
                  </div>
                  {/* Cantidad */}
                  <div className="col-span-2">
                    {idx === 0 && <p className="text-xs text-gray-400 mb-1">Cantidad</p>}
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={item.cantidad}
                      onChange={(e) => actualizarItem(idx, "cantidad", Number(e.target.value))}
                    />
                  </div>
                  {/* Precio unitario */}
                  <div className="col-span-2">
                    {idx === 0 && <p className="text-xs text-gray-400 mb-1">Precio unit.</p>}
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={item.precio_unitario}
                      onChange={(e) => actualizarItem(idx, "precio_unitario", Number(e.target.value))}
                    />
                  </div>
                  {/* Botón eliminar */}
                  <div className="col-span-1">
                    {idx === 0 && <p className="text-xs text-gray-400 mb-1">&nbsp;</p>}
                    <button
                      type="button"
                      onClick={() => eliminarItem(idx)}
                      disabled={items.length === 1}
                      className="flex h-9 w-full items-center justify-center rounded-md text-gray-400 hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <p className="text-sm font-semibold text-gray-900">
                Total: {cop(totalItems)}
              </p>
            </div>
          </div>

          {errorNuevo && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorNuevo}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button disabled={guardando} onClick={() => void handleCrear()}>
              {guardando ? "Guardando..." : "Crear remisión"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal: Detalle / acciones */}
      {modalDetalle && (
        <Dialog
          open={modalDetalle !== null}
          onClose={() => setModalDetalle(null)}
          title={`Remisión ${modalDetalle.numero}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Fecha</p>
                <p className="font-medium">{fecha(modalDetalle.fecha)}</p>
              </div>
              {modalDetalle.fecha_entrega && (
                <div>
                  <p className="text-gray-500">Fecha entrega</p>
                  <p className="font-medium">{fecha(modalDetalle.fecha_entrega)}</p>
                </div>
              )}
              <div>
                <p className="text-gray-500">Cliente</p>
                <p className="font-medium">{modalDetalle.nombre_cliente ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-500">Total</p>
                <p className="font-medium">{cop(modalDetalle.total)}</p>
              </div>
              <div>
                <p className="text-gray-500">Estado</p>
                <Badge variant={ESTADO_BADGE[modalDetalle.estado] ?? "gray"}>
                  {ESTADO_LABEL[modalDetalle.estado] ?? modalDetalle.estado}
                </Badge>
              </div>
              {modalDetalle.observaciones && (
                <div className="col-span-2">
                  <p className="text-gray-500">Observaciones</p>
                  <p>{modalDetalle.observaciones}</p>
                </div>
              )}
            </div>

            {/* Acciones de estado */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {ESTADO_SIGUIENTE[modalDetalle.estado] && (
                <Button
                  disabled={cambiandoEstado}
                  onClick={() => void handleCambiarEstado(modalDetalle, ESTADO_SIGUIENTE[modalDetalle.estado]!)}
                >
                  {cambiandoEstado ? "Actualizando..." : ESTADO_SIGUIENTE_LABEL[modalDetalle.estado]}
                </Button>
              )}
              {modalDetalle.estado !== "anulada" && modalDetalle.estado !== "entregada" && (
                <Button
                  variant="secondary"
                  disabled={cambiandoEstado}
                  onClick={() => void handleCambiarEstado(modalDetalle, "anulada")}
                >
                  Anular
                </Button>
              )}
              {modalDetalle.estado === "borrador" && (
                <Button
                  variant="secondary"
                  onClick={() => void handleEliminar(modalDetalle)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
