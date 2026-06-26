import { useEffect, useState, useRef } from "react";
import { Search, X, Plus, Minus, ShoppingCart, Trash2, Pause, Clock } from "lucide-react";
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
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "nequi", label: "Nequi" },
  { value: "daviplata", label: "Daviplata" },
];

export default function Venta({ turnoId, cajaId, cajaNombre, onCerrarTurno: _onCerrarTurno }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtrados, setFiltrados] = useState<Producto[]>([]);
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

  useEffect(() => {
    if (!busqueda.trim()) { setFiltrados([]); return; }
    const q = busqueda.toLowerCase();
    setFiltrados(
      productos.filter((p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q)
      ).slice(0, 12)
    );
  }, [busqueda, productos]);

  const totalCarrito = carrito.reduce((s, i) => {
    const base = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100);
    const iva = base * (Number(i.producto.iva_pct) / 100);
    return s + base + iva;
  }, 0);

  const subtotalCarrito = carrito.reduce((s, i) =>
    s + i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100), 0);

  const ivaCarrito = totalCarrito - subtotalCarrito;

  function agregarProducto(p: Producto) {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.id === p.id);
      if (idx >= 0) {
        return prev.map((i, j) => j === idx ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, { producto: p, cantidad: 1, precio_unitario: Number(p.precio_venta), descuento_pct: 0 }];
    });
    setBusqueda("");
    busquedaRef.current?.focus();
  }

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((prev) =>
      prev.map((i) => i.producto.id === id
        ? { ...i, cantidad: Math.max(0.5, i.cantidad + delta) }
        : i
      )
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
    const nombre = `Pre-cuenta ${preCuentas.length + 1}`;
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
    <div className="h-full flex flex-col bg-gray-100 overflow-hidden">
      {/* Sub-header con pre-cuentas */}
      <header className="bg-blue-600 text-white px-4 py-1.5 flex items-center justify-end flex-shrink-0">
        <div className="flex items-center gap-3">
          {preCuentas.length > 0 && (
            <button
              onClick={() => setShowPreCuentas(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1 text-sm font-medium hover:bg-blue-400"
            >
              <Pause className="h-4 w-4" />
              Pre-cuentas ({preCuentas.length})
            </button>
          )}
          <span className="text-blue-200 text-xs">{cajaNombre}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Panel izquierdo: búsqueda + productos */}
        <div className="flex flex-col w-[55%] bg-white border-r border-gray-200">
          {/* Buscador */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                ref={busquedaRef}
                autoFocus
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto por nombre o código..."
                className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {busqueda && (
                <button onClick={() => setBusqueda("")} className="absolute right-3 top-3 text-gray-400">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Resultados búsqueda */}
          {filtrados.length > 0 && (
            <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
              {filtrados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregarProducto(p)}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-left hover:bg-blue-50 hover:border-blue-200 transition-colors"
                >
                  <p className="font-medium text-gray-900 text-sm leading-tight">{p.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.codigo}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-semibold text-blue-700">{cop(p.precio_venta)}</p>
                    {p.stock_actual !== null && (
                      <p className={cn("text-xs", Number(p.stock_actual) < 5 ? "text-red-500 font-medium" : "text-gray-400")}>
                        Stock: {p.stock_actual}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!busqueda && (
            <div className="flex-1 flex items-center justify-center text-gray-300">
              <div className="text-center">
                <ShoppingCart className="h-16 w-16 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Busca o escanea un producto</p>
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho: carrito */}
        <div className="flex flex-col w-[45%] bg-white">
          {/* Lista items */}
          <div className="flex-1 overflow-y-auto">
            {carrito.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-300">
                <p className="text-sm">El carrito está vacío</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Producto</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 w-28">Cant.</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {carrito.map((item) => {
                    const baseItem = item.cantidad * item.precio_unitario * (1 - item.descuento_pct / 100);
                    const totalItem = baseItem * (1 + Number(item.producto.iva_pct) / 100);
                    return (
                      <tr key={item.producto.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900 leading-tight">{item.producto.nombre}</p>
                          <p className="text-xs text-gray-400">{cop(item.precio_unitario)}</p>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => cambiarCantidad(item.producto.id, -1)}
                              className="rounded-lg bg-gray-100 p-1 hover:bg-gray-200">
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number" min="0.5" step="0.5"
                              value={item.cantidad}
                              onChange={(e) => setCantidadDirecta(item.producto.id, Number(e.target.value))}
                              className="w-12 text-center text-sm font-semibold border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <button onClick={() => cambiarCantidad(item.producto.id, 1)}
                              className="rounded-lg bg-gray-100 p-1 hover:bg-gray-200">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{cop(totalItem)}</td>
                        <td className="pr-2">
                          <button onClick={() => eliminarItem(item.producto.id)} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Totales y acciones */}
          <div className="border-t border-gray-100 p-3 space-y-2 flex-shrink-0">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{cop(subtotalCarrito)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>IVA</span><span>{cop(ivaCarrito)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-2">
              <span>TOTAL</span><span className="text-blue-700">{cop(totalCarrito)}</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={pausarVenta}
                disabled={carrito.length === 0}
                className="flex-none rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                title="Pausar venta (pre-cuenta)"
              >
                <Pause className="h-5 w-5" />
              </button>
              <button
                onClick={abrirPago}
                disabled={carrito.length === 0}
                className="flex-1 rounded-xl bg-blue-700 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-30 transition-colors"
              >
                Cobrar {cop(totalCarrito)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal pre-cuentas */}
      {showPreCuentas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Pre-cuentas pausadas ({preCuentas.length})
              </p>
              <button onClick={() => setShowPreCuentas(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {preCuentas.map((pc) => (
                <button
                  key={pc.id}
                  onClick={() => retomarPreCuenta(pc)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">{pc.nombre}</p>
                    <p className="text-xs text-gray-400">{pc.items.length} ítems</p>
                  </div>
                  <p className="font-semibold text-blue-700">
                    {cop(pc.items.reduce((s, i) => s + i.cantidad * i.precio_unitario * (1 + Number(i.producto.iva_pct) / 100), 0))}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal pago */}
      {showPago && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl space-y-4 p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-gray-900">Cobrar</p>
              <button onClick={() => setShowPago(false)} className="text-gray-400"><X className="h-5 w-5" /></button>
            </div>

            <p className="text-3xl font-bold text-blue-700 text-center">{cop(totalCarrito)}</p>

            {/* Método de pago */}
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMetodoPago(m.value)}
                  className={cn(
                    "rounded-xl py-2.5 text-sm font-medium border-2 transition-colors",
                    metodoPago === m.value
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {metodoPago === "efectivo" && (
              <div className="space-y-1.5">
                <label className="text-sm text-gray-600">Recibido</label>
                <input
                  type="number" autoFocus
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl font-semibold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Vuelto:</span>
                  <span className={cn("font-bold", vuelto < 0 ? "text-red-500" : "text-green-600")}>
                    {cop(vuelto)}
                  </span>
                </div>
              </div>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              onClick={() => void procesarVenta()}
              disabled={procesando || (metodoPago === "efectivo" && Number(montoRecibido) < totalCarrito)}
              className="w-full rounded-xl bg-blue-700 py-4 text-lg font-bold text-white hover:bg-blue-800 disabled:opacity-40 transition-colors"
            >
              {procesando ? "Procesando..." : "Confirmar venta"}
            </button>
          </div>
        </div>
      )}

      {/* Modal venta exitosa */}
      {ultimaVenta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900">¡Venta registrada!</p>
            <p className="text-sm text-gray-500">{ultimaVenta.numero}</p>
            <p className="text-2xl font-bold text-blue-700">{cop(ultimaVenta.total)}</p>
            {ultimaVenta.vuelto > 0 && (
              <div className="rounded-xl bg-green-50 py-2">
                <p className="text-sm text-green-600">Vuelto: <span className="font-bold text-xl">{cop(ultimaVenta.vuelto)}</span></p>
              </div>
            )}
            <button
              onClick={() => { setUltimaVenta(null); busquedaRef.current?.focus(); }}
              className="w-full rounded-xl bg-blue-700 py-3 text-base font-semibold text-white hover:bg-blue-800"
            >
              Nueva venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
