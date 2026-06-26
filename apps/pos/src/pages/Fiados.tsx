import { useEffect, useState } from "react";
import { Plus, ChevronRight, Search, X, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { cn } from "../lib/cn";

interface Fiado {
  id: string;
  nombre_cliente: string;
  telefono_cliente: string | null;
  monto_total: string;
  monto_pagado: string;
  estado: "pendiente" | "pagado" | "vencido";
  fecha_vencimiento: string | null;
  notas: string | null;
  created_at: string;
}

interface ItemFiado {
  id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  total: string;
}

interface AbonoFiado {
  id: string;
  monto: string;
  metodo_pago: string;
  notas: string | null;
  created_at: string;
}

interface FiadoDetalle extends Fiado {
  items: ItemFiado[];
  abonos: AbonoFiado[];
}

interface Props {
  cajaId: string;
}

const METODOS = [
  { value: "efectivo",      label: "Efectivo" },
  { value: "tarjeta",       label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "nequi",         label: "Nequi" },
  { value: "daviplata",     label: "Daviplata" },
];

export default function Fiados({ cajaId }: Props) {
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"pendiente" | "pagado" | "todos">("pendiente");
  const [detalle, setDetalle] = useState<FiadoDetalle | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [showAbono, setShowAbono] = useState(false);
  const [montoAbono, setMontoAbono] = useState("");
  const [metodoPagoAbono, setMetodoPagoAbono] = useState("efectivo");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form nuevo fiado
  const [nuevoForm, setNuevoForm] = useState({
    nombre_cliente: "",
    telefono_cliente: "",
    fecha_vencimiento: "",
    notas: "",
    items: [{ descripcion: "", cantidad: "1", precio_unitario: "", total: "" }],
  });

  useEffect(() => { void cargarFiados(); }, [filtro]);

  async function cargarFiados() {
    setLoading(true);
    try {
      const url = filtro === "todos" ? "/api/pos/fiados" : `/api/pos/fiados?estado=${filtro}`;
      const data = await apiFetch<Fiado[]>(url);
      setFiados(data);
    } finally {
      setLoading(false);
    }
  }

  async function abrirDetalle(id: string) {
    const data = await apiFetch<FiadoDetalle>(`/api/pos/fiados/${id}`);
    setDetalle(data);
  }

  function calcularItem(idx: number, field: "cantidad" | "precio_unitario", value: string) {
    setNuevoForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      const cant = Number(items[idx].cantidad) || 0;
      const precio = Number(items[idx].precio_unitario) || 0;
      items[idx].total = String(cant * precio);
      return { ...f, items };
    });
  }

  function agregarItemForm() {
    setNuevoForm((f) => ({
      ...f,
      items: [...f.items, { descripcion: "", cantidad: "1", precio_unitario: "", total: "" }],
    }));
  }

  function eliminarItemForm(idx: number) {
    setNuevoForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  const totalNuevoFiado = nuevoForm.items.reduce((s, i) => s + (Number(i.total) || 0), 0);

  async function crearFiado() {
    if (!nuevoForm.nombre_cliente.trim()) { setError("El nombre del cliente es requerido."); return; }
    const itemsValidos = nuevoForm.items.filter((i) => i.descripcion && Number(i.total) > 0);
    if (!itemsValidos.length) { setError("Agrega al menos un ítem con descripción y precio."); return; }

    setProcesando(true);
    setError(null);
    try {
      await apiFetch("/api/pos/fiados", {
        method: "POST",
        body: JSON.stringify({
          nombre_cliente: nuevoForm.nombre_cliente,
          telefono_cliente: nuevoForm.telefono_cliente || undefined,
          caja_id: cajaId,
          fecha_vencimiento: nuevoForm.fecha_vencimiento || undefined,
          notas: nuevoForm.notas || undefined,
          items: itemsValidos.map((i) => ({
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad),
            precio_unitario: Number(i.precio_unitario),
            total: Number(i.total),
          })),
        }),
      });
      setShowNuevo(false);
      setNuevoForm({ nombre_cliente: "", telefono_cliente: "", fecha_vencimiento: "", notas: "", items: [{ descripcion: "", cantidad: "1", precio_unitario: "", total: "" }] });
      void cargarFiados();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el fiado.");
    } finally {
      setProcesando(false);
    }
  }

  async function registrarAbono() {
    if (!detalle || !montoAbono || Number(montoAbono) <= 0) return;
    setProcesando(true);
    setError(null);
    try {
      await apiFetch<{ saldo: number; estado: string }>(`/api/pos/fiados/${detalle.id}/abonos`, {
        method: "POST",
        body: JSON.stringify({ monto: Number(montoAbono), metodo_pago: metodoPagoAbono }),
      });
      setShowAbono(false);
      setMontoAbono("");
      // Recarga detalle y lista
      void abrirDetalle(detalle.id);
      void cargarFiados();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al registrar abono.");
    } finally {
      setProcesando(false);
    }
  }

  const filtrados = fiados.filter((f) =>
    f.nombre_cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
    (f.telefono_cliente ?? "").includes(busqueda)
  );

  const saldo = (f: Fiado) => Number(f.monto_total) - Number(f.monto_pagado);

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="font-semibold text-gray-900">Fiados</p>
          <p className="text-xs text-gray-400">{filtrados.filter((f) => f.estado === "pendiente").length} pendientes</p>
        </div>
        <button
          onClick={() => { setError(null); setShowNuevo(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" /> Nuevo fiado
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        {(["pendiente", "pagado", "todos"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap",
              filtro === f ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {f === "pendiente" ? "Pendientes" : f === "pagado" ? "Pagados" : "Todos"}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <p className="text-center text-gray-400 py-8 text-sm">Cargando...</p>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay fiados {filtro === "todos" ? "" : filtro + "s"}</p>
          </div>
        ) : (
          filtrados.map((fiado) => (
            <button
              key={fiado.id}
              onClick={() => void abrirDetalle(fiado.id)}
              className="w-full rounded-xl bg-white border border-gray-100 p-3 text-left hover:shadow-sm hover:border-blue-200 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{fiado.nombre_cliente}</p>
                    <EstadoBadge estado={fiado.estado} />
                  </div>
                  {fiado.telefono_cliente && (
                    <p className="text-xs text-gray-400 mt-0.5">{fiado.telefono_cliente}</p>
                  )}
                  {fiado.fecha_vencimiento && fiado.estado === "pendiente" && (
                    <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Vence: {fiado.fecha_vencimiento}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{cop(saldo(fiado))}</p>
                  <p className="text-xs text-gray-400">de {cop(fiado.monto_total)}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
              </div>
              {Number(fiado.monto_pagado) > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-gray-100">
                    <div
                      className="h-1.5 rounded-full bg-green-400"
                      style={{ width: `${Math.min(100, (Number(fiado.monto_pagado) / Number(fiado.monto_total)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
              <div>
                <p className="font-bold text-gray-900">{detalle.nombre_cliente}</p>
                {detalle.telefono_cliente && <p className="text-xs text-gray-400">{detalle.telefono_cliente}</p>}
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {/* Saldo */}
              <div className="rounded-xl bg-gray-50 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Saldo pendiente</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {cop(Number(detalle.monto_total) - Number(detalle.monto_pagado))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total fiado</p>
                  <p className="text-sm font-semibold text-gray-700">{cop(detalle.monto_total)}</p>
                  <EstadoBadge estado={detalle.estado} />
                </div>
              </div>

              {/* Ítems */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Artículos fiados</p>
                <div className="space-y-1">
                  {detalle.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{item.cantidad}× {item.descripcion}</span>
                      <span className="font-medium text-gray-900">{cop(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Abonos */}
              {detalle.abonos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Abonos recibidos</p>
                  <div className="space-y-1.5">
                    {detalle.abonos.map((ab) => (
                      <div key={ab.id} className="flex items-center justify-between text-sm rounded-lg bg-green-50 px-3 py-1.5">
                        <div>
                          <span className="font-medium text-green-800">{cop(ab.monto)}</span>
                          <span className="text-green-600 text-xs ml-2">({ab.metodo_pago})</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(ab.created_at).toLocaleDateString("es-CO")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detalle.notas && (
                <p className="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">{detalle.notas}</p>
              )}
            </div>

            {detalle.estado !== "pagado" && (
              <div className="p-4 border-t flex-shrink-0">
                {showAbono ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-1.5">
                      {METODOS.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setMetodoPagoAbono(m.value)}
                          className={cn(
                            "rounded-lg py-2 text-xs font-medium border-2 transition-colors",
                            metodoPagoAbono === m.value
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-gray-200 text-gray-600"
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" autoFocus min="1"
                      value={montoAbono}
                      onChange={(e) => setMontoAbono(e.target.value)}
                      placeholder="Monto del abono"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl font-semibold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setShowAbono(false); setError(null); }}
                        className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700">
                        Cancelar
                      </button>
                      <button
                        onClick={() => void registrarAbono()}
                        disabled={procesando || !montoAbono}
                        className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        {procesando ? "Guardando..." : "Registrar abono"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAbono(true); setMontoAbono(String(Number(detalle.monto_total) - Number(detalle.monto_pagado))); setError(null); }}
                    className="w-full rounded-xl bg-green-600 py-3 text-base font-bold text-white hover:bg-green-700"
                  >
                    Registrar abono
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal nuevo fiado */}
      {showNuevo && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
              <p className="font-bold text-gray-900">Nuevo fiado</p>
              <button onClick={() => { setShowNuevo(false); setError(null); }} className="text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Nombre del cliente *</label>
                  <input
                    autoFocus
                    value={nuevoForm.nombre_cliente}
                    onChange={(e) => setNuevoForm((f) => ({ ...f, nombre_cliente: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Ej: Don Carlos"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Teléfono</label>
                  <input
                    type="tel"
                    value={nuevoForm.telefono_cliente}
                    onChange={(e) => setNuevoForm((f) => ({ ...f, telefono_cliente: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="3001234567"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Fecha límite pago</label>
                  <input
                    type="date"
                    value={nuevoForm.fecha_vencimiento}
                    onChange={(e) => setNuevoForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Ítems */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Artículos</p>
                  <button onClick={agregarItemForm} className="text-xs text-blue-600 font-medium flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Agregar ítem
                  </button>
                </div>
                <div className="space-y-2">
                  {nuevoForm.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                      <input
                        className="col-span-5 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="Descripción"
                        value={item.descripcion}
                        onChange={(e) => {
                          const items = [...nuevoForm.items];
                          items[idx] = { ...items[idx], descripcion: e.target.value };
                          setNuevoForm((f) => ({ ...f, items }));
                        }}
                      />
                      <input
                        className="col-span-2 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        type="number" min="0.5" step="0.5" placeholder="Cant"
                        value={item.cantidad}
                        onChange={(e) => calcularItem(idx, "cantidad", e.target.value)}
                      />
                      <input
                        className="col-span-3 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        type="number" min="0" placeholder="Precio"
                        value={item.precio_unitario}
                        onChange={(e) => calcularItem(idx, "precio_unitario", e.target.value)}
                      />
                      <span className="col-span-1 text-xs font-medium text-gray-700 text-right">
                        {item.total ? cop(item.total) : ""}
                      </span>
                      {nuevoForm.items.length > 1 && (
                        <button onClick={() => eliminarItemForm(idx)} className="col-span-1 text-gray-300 hover:text-red-500 flex justify-center">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {totalNuevoFiado > 0 && (
                <div className="flex justify-between items-center rounded-xl bg-blue-50 px-4 py-2">
                  <span className="text-sm font-medium text-blue-700">Total fiado</span>
                  <span className="text-lg font-bold text-blue-700">{cop(totalNuevoFiado)}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Notas</label>
                <textarea
                  rows={2}
                  value={nuevoForm.notas}
                  onChange={(e) => setNuevoForm((f) => ({ ...f, notas: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Observaciones opcionales..."
                />
              </div>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>

            <div className="p-4 border-t flex gap-3 flex-shrink-0">
              <button
                onClick={() => { setShowNuevo(false); setError(null); }}
                className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => void crearFiado()}
                disabled={procesando}
                className="flex-1 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-40"
              >
                {procesando ? "Guardando..." : `Registrar fiado ${totalNuevoFiado > 0 ? cop(totalNuevoFiado) : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "pagado") return (
    <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      <CheckCircle2 className="h-3 w-3" /> Pagado
    </span>
  );
  if (estado === "vencido") return (
    <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertCircle className="h-3 w-3" /> Vencido
    </span>
  );
  return (
    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
      Pendiente
    </span>
  );
}
