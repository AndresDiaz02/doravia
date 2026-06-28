import { useEffect, useState, useRef } from "react";
import { Search, X, Plus, Minus, Trash2, Pause, Clock, Package } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { cn } from "../lib/cn";

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio_venta: string;
  iva_pct: string;
  stock_actual: string | null;
  unidad: string;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
}

interface PreCuenta {
  id: string;
  items: ItemCarrito[];
  nombre: string;
  creadaAt: Date;
}

interface Props {
  turnoId: string;
  cajaId: string;
  cajaNombre: string;
  onCerrarTurno?: () => void;
}

const METODOS = [
  { value: "efectivo",      label: "Efectivo" },
  { value: "tarjeta",       label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "nequi",         label: "Nequi" },
  { value: "daviplata",     label: "Daviplata" },
];

export default function Venta({ turnoId, cajaId, cajaNombre: _cajaNombre, onCerrarTurno: _onCerrarTurno }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [preCuentas, setPreCuentas] = useState<PreCuenta[]>([]);
  const [showPreCuentas, setShowPreCuentas] = useState(false);
  const [showPago, setShowPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<{ numero: string; total: number; vuelto: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busquedaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiFetch<Producto[]>("/api/pos/productos").then(setProductos);
  }, []);

  const productosVisibles = busqueda.trim()
    ? productos.filter((p) => {
        const q = busqueda.toLowerCase();
        return p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q);
      }).slice(0, 24)
    : productos;

  const totalCarrito = carrito.reduce((s, i) => {
    const base = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100);
    return s + base * (1 + Number(i.producto.iva_pct) / 100);
  }, 0);

  const subtotalCarrito = carrito.reduce((s, i) =>
    s + i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100), 0);

  const ivaCarrito = totalCarrito - subtotalCarrito;

  function agregarProducto(p: Producto) {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.id === p.id);
      if (idx >= 0) return prev.map((i, j) => j === idx ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { producto: p, cantidad: 1, precio_unitario: Number(p.precio_venta), descuento_pct: 0 }];
    });
    busquedaRef.current?.focus();
  }

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((prev) =>
      prev.map((i) => i.producto.id === id ? { ...i, cantidad: Math.max(0.5, i.cantidad + delta) } : i)
    );
  }

  function setCantidadDirecta(id: string, valor: number) {
    if (valor <= 0) { eliminarItem(id); return; }
    setCarrito((prev) => prev.map((i) => i.producto.id === id ? { ...i, cantidad: valor } : i));
  }

  function eliminarItem(id: string) {
    setCarrito((prev) => prev.filter((i) => i.producto.id !== id));
  }

  function pausarVenta() {
    if (carrito.length === 0) return;
    const nombre = `Mesa ${preCuentas.length + 1}`;
    setPreCuentas((prev) => [...prev, { id: crypto.randomUUID(), items: carrito, nombre, creadaAt: new Date() }]);
    setCarrito([]);
    setBusqueda("");
  }

  function retomarPreCuenta(pc: PreCuenta) {
    if (carrito.length > 0) {
      if (!confirm("Tienes ítems en el carrito. ¿Pausarlos y retomar esta pre-cuenta?")) return;
      pausarVenta();
    }
    setCarrito(pc.items);
    setPreCuentas((prev) => prev.filter((p) => p.id !== pc.id));
    setShowPreCuentas(false);
  }

  function abrirPago() {
    if (carrito.length === 0) return;
    setMontoRecibido(metodoPago === "efectivo" ? String(Math.ceil(totalCarrito / 1000) * 1000) : "");
    setShowPago(true);
    setError(null);
  }

  const vuelto = metodoPago === "efectivo" && montoRecibido
    ? Math.max(0, Number(montoRecibido) - totalCarrito)
    : 0;

  async function procesarVenta() {
    setProcesando(true);
    setError(null);
    try {
      const items = carrito.map((i) => {
        const base = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100);
        const ivaVal = base * (Number(i.producto.iva_pct) / 100);
        return {
          producto_id: i.producto.id,
          descripcion: i.producto.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          descuento_pct: i.descuento_pct,
          iva_pct: Number(i.producto.iva_pct),
          subtotal: base,
          iva_valor: ivaVal,
          total: base + ivaVal,
        };
      });

      const venta = await apiFetch<{ numero: string; total: string }>("/api/pos/ventas", {
        method: "POST",
        body: JSON.stringify({
          turno_id: turnoId,
          caja_id: cajaId,
          metodo_pago: metodoPago,
          monto_recibido: metodoPago === "efectivo" ? Number(montoRecibido) : null,
          vuelto: metodoPago === "efectivo" ? vuelto : null,
          items,
        }),
      });

      setUltimaVenta({ numero: venta.numero, total: Number(venta.total), vuelto });
      setCarrito([]);
      setShowPago(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al procesar la venta.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="h-full flex overflow-hidden bg-[#0B0E1A]">
      {/* ── Panel izquierdo: catálogo ── */}
      <div className="flex flex-col w-[58%] border-r border-slate-800">
        {/* Buscador */}
        <div className="px-3 py-2.5 border-b border-slate-800 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              ref={busquedaRef}
              autoFocus
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o código..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {preCuentas.length > 0 && (
            <button
              onClick={() => setShowPreCuentas(true)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-900/60 border border-violet-700/50 px-3 py-2 text-xs font-medium text-violet-300 hover:bg-violet-800/60 flex-shrink-0"
            >
              <Pause className="h-3.5 w-3.5" />
              {preCuentas.length}
            </button>
          )}
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto p-3">
          {productosVisibles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
              <Package className="h-12 w-12 opacity-40" />
              <p className="text-sm">{busqueda ? "Sin resultados" : "No hay productos"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {productosVisibles.map((p) => {
                const enCarrito = carrito.find((i) => i.producto.id === p.id);
                const stockBajo = p.stock_actual !== null && Number(p.stock_actual) < 5;
                return (
                  <button
                    key={p.id}
                    onClick={() => agregarProducto(p)}
                    className={cn(
                      "relative rounded-xl border p-3 text-left transition-all active:scale-95",
                      enCarrito
                        ? "bg-violet-900/40 border-violet-600/60 shadow-lg shadow-violet-900/20"
                        : "bg-slate-800/70 border-slate-700/50 hover:bg-slate-700/70 hover:border-slate-600"
                    )}
                  >
                    {enCarrito && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
                        {enCarrito.cantidad}
                      </span>
                    )}
                    <p className="text-sm font-medium text-white leading-tight line-clamp-2 pr-4">{p.nombre}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.codigo}</p>
                    <p className="text-sm font-bold text-emerald-400 mt-2">{cop(p.precio_venta)}</p>
                    {stockBajo && (
                      <p className="text-xs text-amber-400 font-medium mt-0.5">Stock: {p.stock_actual}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: carrito ── */}
      <div className="flex flex-col w-[42%] bg-[#0B0E1A]">
        {/* Header carrito */}
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Carrito {carrito.length > 0 && `· ${carrito.reduce((s, i) => s + i.cantidad, 0)} items`}
          </span>
          {carrito.length > 0 && (
            <button
              onClick={() => setCarrito([])}
              className="text-xs text-slate-600 hover:text-red-400 transition-colors"
            >
              Vaciar
            </button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-2">
              <p className="text-sm">Carrito vacío</p>
              <p className="text-xs text-slate-600">Toca un producto para agregar</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {carrito.map((item) => {
                const baseItem = item.cantidad * item.precio_unitario * (1 - item.descuento_pct / 100);
                const totalItem = baseItem * (1 + Number(item.producto.iva_pct) / 100);
                return (
                  <div key={item.producto.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white leading-tight truncate">{item.producto.nombre}</p>
                      <p className="text-xs text-slate-500">{cop(item.precio_unitario)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => cambiarCantidad(item.producto.id, -1)}
                        className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number" min="0.5" step="0.5"
                        value={item.cantidad}
                        onChange={(e) => setCantidadDirecta(item.producto.id, Number(e.target.value))}
                        className="w-10 text-center text-sm font-semibold bg-slate-800 border border-slate-700 rounded-lg py-1 text-white focus:outline-none focus:border-violet-500"
                      />
                      <button
                        onClick={() => cambiarCantidad(item.producto.id, 1)}
                        className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-right flex-shrink-0 w-20">
                      <p className="text-sm font-semibold text-white">{cop(totalItem)}</p>
                    </div>
                    <button
                      onClick={() => eliminarItem(item.producto.id)}
                      className="text-slate-700 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Totales + acciones */}
        <div className="border-t border-slate-800 p-4 flex-shrink-0 space-y-3 bg-[#0D1120]">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Subtotal</span><span>{cop(subtotalCarrito)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>IVA</span><span>{cop(ivaCarrito)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-800">
              <span className="text-sm font-semibold text-slate-300">TOTAL</span>
              <span className="text-2xl font-black text-white">{cop(totalCarrito)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={pausarVenta}
              disabled={carrito.length === 0}
              title="Pausar (pre-cuenta)"
              className="w-11 h-11 rounded-xl border border-slate-700 bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 transition-colors flex-shrink-0"
            >
              <Pause className="h-4 w-4" />
            </button>
            <button
              onClick={abrirPago}
              disabled={carrito.length === 0}
              className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-white font-bold text-base transition-colors"
            >
              {carrito.length === 0 ? "Cobrar" : `Cobrar ${cop(totalCarrito)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal pre-cuentas ── */}
      {showPreCuentas && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <p className="font-semibold text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-400" />
                Pre-cuentas ({preCuentas.length})
              </p>
              <button onClick={() => setShowPreCuentas(false)} className="text-slate-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
              {preCuentas.map((pc) => (
                <button
                  key={pc.id}
                  onClick={() => retomarPreCuenta(pc)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 text-left transition-colors"
                >
                  <div>
                    <p className="font-medium text-white text-sm">{pc.nombre}</p>
                    <p className="text-xs text-slate-500">{pc.items.length} ítems</p>
                  </div>
                  <p className="font-bold text-emerald-400 text-sm">
                    {cop(pc.items.reduce((s, i) => s + i.cantidad * i.precio_unitario * (1 + Number(i.producto.iva_pct) / 100), 0))}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal pago ── */}
      {showPago && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-white">Cobrar</p>
              <button onClick={() => setShowPago(false)} className="text-slate-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <p className="text-4xl font-black text-white text-center">{cop(totalCarrito)}</p>

            {/* Método de pago */}
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => {
                    setMetodoPago(m.value);
                    setMontoRecibido(m.value === "efectivo" ? String(Math.ceil(totalCarrito / 1000) * 1000) : "");
                  }}
                  className={cn(
                    "rounded-xl py-2.5 text-sm font-medium border transition-colors",
                    metodoPago === m.value
                      ? "border-violet-500 bg-violet-900/50 text-violet-300"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {metodoPago === "efectivo" && (
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Recibido</label>
                <input
                  type="number"
                  autoFocus
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-2xl font-bold text-center text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                <div className="flex justify-between text-sm bg-slate-800 rounded-xl px-4 py-2.5">
                  <span className="text-slate-400">Vuelto</span>
                  <span className={cn("font-bold text-lg", vuelto < 0 ? "text-red-400" : "text-emerald-400")}>
                    {cop(vuelto)}
                  </span>
                </div>
              </div>
            )}

            {error && <p className="rounded-xl bg-red-950/60 border border-red-800/50 px-3 py-2 text-sm text-red-400">{error}</p>}

            <button
              onClick={() => void procesarVenta()}
              disabled={procesando || (metodoPago === "efectivo" && Number(montoRecibido) < totalCarrito)}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 py-4 text-lg font-bold text-white transition-colors"
            >
              {procesando ? "Procesando..." : "Confirmar venta"}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal venta exitosa ── */}
      {ultimaVenta && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto">
              <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-white">¡Venta registrada!</p>
              <p className="text-xs text-slate-500 mt-0.5">{ultimaVenta.numero}</p>
            </div>
            <p className="text-3xl font-black text-white">{cop(ultimaVenta.total)}</p>
            {ultimaVenta.vuelto > 0 && (
              <div className="rounded-xl bg-emerald-900/40 border border-emerald-700/50 py-3">
                <p className="text-xs text-emerald-400 uppercase tracking-wide font-medium mb-0.5">Vuelto</p>
                <p className="text-2xl font-black text-emerald-300">{cop(ultimaVenta.vuelto)}</p>
              </div>
            )}
            <button
              onClick={() => { setUltimaVenta(null); busquedaRef.current?.focus(); }}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 py-3 text-base font-bold text-white transition-colors"
            >
              Nueva venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
