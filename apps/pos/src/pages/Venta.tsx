import { useEffect, useState, useRef, useCallback } from "react";
import { Search, X, Plus, Minus, Trash2, Pause, Clock, Package, User, Percent, Printer, MessageCircle, Scale, Wifi, WifiOff } from "lucide-react";
import { TutorialOverlay } from "../components/TutorialOverlay";
import { apiFetch, ApiError, cop } from "../lib/api";
import { cn } from "../lib/cn";
import { useAuth } from "../lib/auth";
import { useGramera } from "../lib/gramera";
import type { CajaConfig } from "./SeleccionCaja";

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio_venta: string;
  iva_pct: string;
  stock_actual: string | null;
  unidad: string;
}

interface Cliente {
  id: string;
  nombre: string;
  nit_cedula: string;
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
  clienteNombre: string;
  creadaAt: Date;
}

interface Props {
  turnoId: string;
  cajaId: string;
  cajaNombre: string;
  cajaConfig?: CajaConfig | null;
  onCerrarTurno?: () => void;
}

const METODOS = [
  { value: "efectivo",      label: "Efectivo" },
  { value: "tarjeta",       label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "nequi",         label: "Nequi" },
  { value: "daviplata",     label: "Daviplata" },
];

const TUTORIAL_POS = [
  {
    titulo: "Bienvenido al Punto de Venta",
    descripcion: "Desde aquí registras cada venta. El catálogo de productos aparece a la izquierda, el carrito a la derecha.",
  },
  {
    titulo: "Busca y agrega productos",
    descripcion: "Escribe el nombre o código del producto en el buscador, o haz clic directamente en la tarjeta del producto para agregarlo al carrito.",
    selector: "input[placeholder*='Buscar']",
  },
  {
    titulo: "Procesa el cobro",
    descripcion: 'Una vez tengas los ítems en el carrito, haz clic en "Cobrar", elige el método de pago e ingresa el monto. El sistema calcula el vuelto automáticamente.',
  },
];

// Detecta barcode scanners de tipo "keyboard wedge" — emiten caracteres rápidos seguidos de Enter
function useBarcodeScanner(
  productos: Producto[],
  onProductoEscaneado: (p: Producto) => void,
  onClearBusqueda: () => void,
  inputRef: React.RefObject<HTMLInputElement | null>,
) {
  const bufferRef = useRef("");
  const lastKeyRef = useRef(0);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignorar si el foco está en un input que no sea el buscador (ej. cantidad, monto)
      const tag = (e.target as HTMLElement)?.tagName;
      const isBuscador = e.target === inputRef.current;
      if ((tag === "INPUT" || tag === "TEXTAREA") && !isBuscador) return;

      const now = Date.now();
      const gap = now - lastKeyRef.current;
      lastKeyRef.current = now;

      if (e.key === "Enter") {
        const codigo = bufferRef.current.trim();
        bufferRef.current = "";
        // Solo procesar si parece un código de barras (>2 chars, llegaron rápido)
        if (codigo.length > 2) {
          const prod = productos.find(
            (p) => p.codigo.toLowerCase() === codigo.toLowerCase()
          );
          if (prod) {
            e.preventDefault();
            onClearBusqueda();
            onProductoEscaneado(prod);
          }
        }
        return;
      }

      // Caracteres simples que llegan en ráfaga (< 80ms por tecla) = barcode scanner
      if (e.key.length === 1 && gap < 80) {
        bufferRef.current += e.key;
      } else if (e.key.length === 1) {
        // Tecla normal (usuario escribiendo) — reset buffer
        bufferRef.current = e.key;
      } else {
        bufferRef.current = "";
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [productos, onProductoEscaneado, onClearBusqueda, inputRef]);
}

export default function Venta({ turnoId, cajaId, cajaNombre, cajaConfig, onCerrarTurno: _onCerrarTurno }: Props) {
  const { user } = useAuth();
  const gramera = useGramera(cajaConfig);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarTutorial, setMostrarTutorial] = useState(false);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [preCuentas, setPreCuentas] = useState<PreCuenta[]>([]);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteQuery, setClienteQuery] = useState("");
  const [showClienteSug, setShowClienteSug] = useState(false);
  const [descuentoEditId, setDescuentoEditId] = useState<string | null>(null);
  const [showPreCuentas, setShowPreCuentas] = useState(false);
  const [showPago, setShowPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [showFiarForm, setShowFiarForm] = useState(false);
  const [nombreFiado, setNombreFiado] = useState("");
  const [ultimaVenta, setUltimaVenta] = useState<{
    numero: string; total: number; vuelto: number;
    items: ItemCarrito[]; clienteNombre: string; metodoPago: string;
    montoRecibido: number; subtotal: number; iva: number;
    cajaNombre: string;
  } | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busquedaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiFetch<Producto[]>("/api/pos/productos").then(setProductos);
    void apiFetch<{ data: Cliente[] }>("/api/clientes?limit=500").then((r) => setClientes(r.data));
    void apiFetch<Record<string, { completado: boolean; saltado: boolean }>>("/api/tutoriales/estado")
      .then((est) => { if (!est.pos?.completado && !est.pos?.saltado) setMostrarTutorial(true); })
      .catch(() => {});
  }, []);

  const agregarProducto = useCallback((p: Producto) => {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.id === p.id);
      if (idx >= 0) return prev.map((i, j) => j === idx ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { producto: p, cantidad: 1, precio_unitario: Number(p.precio_venta), descuento_pct: 0 }];
    });
    busquedaRef.current?.focus();
  }, []);

  useBarcodeScanner(productos, agregarProducto, () => setBusqueda(""), busquedaRef);

  const productosVisibles = busqueda.trim()
    ? productos.filter((p) => {
        const q = busqueda.toLowerCase();
        return p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q);
      }).slice(0, 24)
    : productos;

  const clientesFiltrados = clienteQuery.trim().length >= 2
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(clienteQuery.toLowerCase()) ||
        c.nit_cedula.includes(clienteQuery)
      ).slice(0, 6)
    : [];

  const totalCarrito = carrito.reduce((s, i) => {
    const base = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100);
    return s + base * (1 + Number(i.producto.iva_pct) / 100);
  }, 0);

  const subtotalCarrito = carrito.reduce((s, i) =>
    s + i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100), 0);

  const ivaCarrito = totalCarrito - subtotalCarrito;
  const descuentoTotal = carrito.reduce((s, i) =>
    s + i.cantidad * i.precio_unitario * (i.descuento_pct / 100), 0);

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((prev) =>
      prev.map((i) => i.producto.id === id ? { ...i, cantidad: Math.max(0.5, i.cantidad + delta) } : i)
    );
  }

  function setCantidadDirecta(id: string, valor: number) {
    if (valor <= 0) { eliminarItem(id); return; }
    setCarrito((prev) => prev.map((i) => i.producto.id === id ? { ...i, cantidad: valor } : i));
  }

  function setDescuento(id: string, pct: number) {
    const valor = Math.max(0, Math.min(100, pct));
    setCarrito((prev) => prev.map((i) => i.producto.id === id ? { ...i, descuento_pct: valor } : i));
  }

  function eliminarItem(id: string) {
    setCarrito((prev) => prev.filter((i) => i.producto.id !== id));
    if (descuentoEditId === id) setDescuentoEditId(null);
  }

  function pausarVenta() {
    if (carrito.length === 0) return;
    const nombre = `Mesa ${preCuentas.length + 1}`;
    setPreCuentas((prev) => [...prev, {
      id: crypto.randomUUID(), items: carrito, nombre,
      clienteNombre, creadaAt: new Date()
    }]);
    setCarrito([]);
    setBusqueda("");
    setClienteNombre("");
    setClienteId(null);
    setClienteQuery("");
  }

  function retomarPreCuenta(pc: PreCuenta) {
    if (carrito.length > 0) {
      if (!confirm("Tienes ítems en el carrito. ¿Pausarlos y retomar esta pre-cuenta?")) return;
      pausarVenta();
    }
    setCarrito(pc.items);
    setClienteNombre(pc.clienteNombre);
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
          cliente_id: clienteId ?? undefined,
          nombre_cliente: clienteNombre || undefined,
          metodo_pago: metodoPago,
          monto_recibido: metodoPago === "efectivo" ? Number(montoRecibido) : null,
          vuelto: metodoPago === "efectivo" ? vuelto : null,
          observaciones: observaciones.trim() || undefined,
          items,
        }),
      });

      setUltimaVenta({
        numero: venta.numero, total: Number(venta.total), vuelto,
        items: [...carrito], clienteNombre, metodoPago,
        montoRecibido: metodoPago === "efectivo" ? Number(montoRecibido) : Number(venta.total),
        subtotal: subtotalCarrito, iva: ivaCarrito, cajaNombre,
      });
      setCarrito([]);
      setShowPago(false);
      setClienteNombre("");
      setClienteId(null);
      setClienteQuery("");
      setObservaciones("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al procesar la venta.");
    } finally {
      setProcesando(false);
    }
  }

  async function procesarFiado() {
    if (!nombreFiado.trim() || procesando) return;
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
          total: base + ivaVal,
        };
      });

      await apiFetch("/api/pos/fiados", {
        method: "POST",
        body: JSON.stringify({
          caja_id: cajaId,
          nombre_cliente: nombreFiado.trim(),
          items,
        }),
      });

      setCarrito([]);
      setShowPago(false);
      setShowFiarForm(false);
      setNombreFiado("");
      setClienteNombre("");
      setClienteId(null);
      setClienteQuery("");
      setError(null);
      busquedaRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al registrar en cartera.");
    } finally {
      setProcesando(false);
    }
  }

  const handleClienteSelect = useCallback((c: Cliente) => {
    setClienteNombre(c.nombre);
    setClienteId(c.id);
    setClienteQuery(c.nombre);
    setShowClienteSug(false);
  }, []);

  function generarTextoWhatsApp(venta: NonNullable<typeof ultimaVenta>) {
    const empresa = user?.tenantNombre ?? "Doravia";
    const fecha = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
    const METODO_LABEL: Record<string, string> = {
      efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia",
      nequi: "Nequi", daviplata: "Daviplata",
    };
    const itemsTexto = venta.items.map((i) => {
      const subtotal = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100) * (1 + Number(i.producto.iva_pct) / 100);
      return `• ${i.producto.nombre} x${i.cantidad} — ${cop(subtotal)}`;
    }).join("\n");

    return `*${empresa}*\nVenta No. ${venta.numero}\n${fecha}\n\n${itemsTexto}\n\n*Subtotal:* ${cop(venta.subtotal)}\n*IVA:* ${cop(venta.iva)}\n*TOTAL:* ${cop(venta.total)}\n*Pago:* ${METODO_LABEL[venta.metodoPago] ?? venta.metodoPago}\n${venta.vuelto > 0 ? `*Vuelto:* ${cop(venta.vuelto)}\n` : ""}\n¡Gracias por su compra!`;
  }

  function enviarWhatsApp() {
    if (!ultimaVenta || !whatsappPhone.trim()) return;
    const phone = whatsappPhone.replace(/\D/g, "");
    const fullPhone = phone.startsWith("57") ? phone : `57${phone}`;
    const texto = generarTextoWhatsApp(ultimaVenta);
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(texto)}`, "_blank");
    setShowWhatsApp(false);
    setWhatsappPhone("");
  }

  function imprimirTirilla() {
    if (!ultimaVenta) return;
    const empresa = user?.tenantNombre ?? "Doravia";
    const fecha = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
    const METODO_LABEL: Record<string, string> = {
      efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia",
      nequi: "Nequi", daviplata: "Daviplata",
    };
    const itemsHTML = ultimaVenta.items.map((i) => {
      const subtotal = i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100) * (1 + Number(i.producto.iva_pct) / 100);
      return `
        <tr><td colspan="2" class="pt-1"><strong>${i.producto.nombre}</strong></td></tr>
        <tr>
          <td class="pl-2 text-gray-600">${i.cantidad} × ${cop(i.precio_unitario)}${i.descuento_pct > 0 ? ` (-${i.descuento_pct}%)` : ""}</td>
          <td class="text-right">${cop(subtotal)}</td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: 80mm auto; margin: 4mm 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; width: 72mm; margin: 0; }
  h1 { font-size: 14px; font-weight: bold; text-align: center; margin: 0 0 2px; }
  .center { text-align: center; }
  .sep { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .td-r { text-align: right; }
  .total-row td { font-size: 14px; font-weight: bold; padding-top: 4px; }
  .small { font-size: 9px; color: #555; }
  .gracias { text-align: center; margin-top: 8px; font-size: 10px; }
</style></head><body>
<h1>${empresa}</h1>
<p class="center small">${fecha} · Caja: ${ultimaVenta.cajaNombre}</p>
<hr class="sep">
<p class="center"><strong>No. ${ultimaVenta.numero}</strong></p>
${ultimaVenta.clienteNombre ? `<p class="center small">Cliente: ${ultimaVenta.clienteNombre}</p>` : ""}
<hr class="sep">
<table>${itemsHTML}</table>
<hr class="sep">
<table>
  <tr><td>Subtotal</td><td class="td-r">${cop(ultimaVenta.subtotal)}</td></tr>
  <tr><td>IVA</td><td class="td-r">${cop(ultimaVenta.iva)}</td></tr>
  <tr class="total-row"><td>TOTAL</td><td class="td-r">${cop(ultimaVenta.total)}</td></tr>
</table>
<hr class="sep">
<table>
  <tr><td>${METODO_LABEL[ultimaVenta.metodoPago] ?? ultimaVenta.metodoPago}</td><td class="td-r">${cop(ultimaVenta.montoRecibido)}</td></tr>
  ${ultimaVenta.vuelto > 0 ? `<tr><td>Vuelto</td><td class="td-r">${cop(ultimaVenta.vuelto)}</td></tr>` : ""}
</table>
<p class="gracias">¡Gracias por su compra!<br>Powered by Doravia</p>
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
</body></html>`;

    const w = window.open("", "_blank", "width=340,height=600,toolbar=no,menubar=no");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="h-full flex overflow-hidden bg-gray-50 dark:bg-[#0B0E1A]">
      {mostrarTutorial && (
        <TutorialOverlay
          slug="pos"
          titulo="Tu primera venta en POS"
          pasos={TUTORIAL_POS}
          onFin={() => setMostrarTutorial(false)}
        />
      )}
      {/* ── Panel izquierdo: catálogo ── */}
      <div className="flex flex-col w-[58%] border-r border-gray-200 dark:border-slate-800">
        {/* Buscador */}
        <div className="px-3 py-2.5 border-b border-gray-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-transparent">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-slate-500" />
            <input
              ref={busquedaRef}
              autoFocus
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o código..."
              className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="absolute right-2.5 top-2.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {preCuentas.length > 0 && (
            <button
              onClick={() => setShowPreCuentas(true)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-100 dark:bg-violet-900/60 border border-violet-300 dark:border-violet-700/50 px-3 py-2 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800/60 flex-shrink-0"
            >
              <Pause className="h-3.5 w-3.5" />
              {preCuentas.length}
            </button>
          )}
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto p-3">
          {productosVisibles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-600 gap-3">
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
                        ? "bg-violet-50 dark:bg-violet-900/40 border-violet-400 dark:border-violet-600/60 shadow-lg shadow-violet-100 dark:shadow-violet-900/20"
                        : "bg-white dark:bg-slate-800/70 border-gray-200 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/70 hover:border-gray-300 dark:hover:border-slate-600"
                    )}
                  >
                    {enCarrito && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
                        {enCarrito.cantidad}
                      </span>
                    )}
                    <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight line-clamp-2 pr-4">{p.nombre}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{p.codigo}</p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-2">{cop(p.precio_venta)}</p>
                    {stockBajo && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">Stock: {p.stock_actual}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: carrito ── */}
      <div className="flex flex-col w-[42%] bg-gray-50 dark:bg-[#0B0E1A]">
        {/* Campo cliente */}
        <div className="px-3 pt-2.5 pb-2 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-transparent relative">
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-300 dark:text-slate-600" />
            <input
              type="text"
              value={clienteQuery}
              onChange={(e) => {
                setClienteQuery(e.target.value);
                setClienteNombre(e.target.value);
                setClienteId(null);
                setShowClienteSug(true);
              }}
              onFocus={() => setShowClienteSug(true)}
              onBlur={() => setTimeout(() => setShowClienteSug(false), 150)}
              placeholder="Cliente (opcional)"
              className="w-full bg-gray-100 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/60"
            />
            {clienteQuery && (
              <button
                onClick={() => { setClienteQuery(""); setClienteNombre(""); setClienteId(null); }}
                className="absolute right-2.5 top-2.5 text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {showClienteSug && clientesFiltrados.length > 0 && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  onMouseDown={() => handleClienteSelect(c)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <p className="text-sm text-gray-900 dark:text-white font-medium">{c.nombre}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{c.nit_cedula}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Header carrito */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 bg-white dark:bg-transparent">
          <span className="text-xs font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
            Carrito {carrito.length > 0 && `· ${carrito.reduce((s, i) => s + i.cantidad, 0)} ítems`}
          </span>
          {carrito.length > 0 && (
            <button onClick={() => setCarrito([])} className="text-xs text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors">
              Vaciar
            </button>
          )}
        </div>

        {/* Gramera widget */}
        {gramera.soportada && (
          <div className={cn(
            "px-3 py-2 border-b flex items-center gap-2 text-xs flex-shrink-0",
            gramera.status === "lista"
              ? "bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/40"
              : "bg-gray-50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-800"
          )}>
            <Scale className={cn("h-3.5 w-3.5 flex-shrink-0", gramera.status === "lista" ? "text-violet-500" : "text-gray-400 dark:text-slate-500")} />
            {gramera.status === "lista" ? (
              <>
                <span className="text-violet-600 dark:text-violet-400 font-semibold min-w-[60px]">
                  {gramera.peso !== null ? `${gramera.peso} ${gramera.unidad}` : `— ${gramera.unidad}`}
                </span>
                {gramera.peso !== null && carrito.length > 0 && (
                  <button
                    onClick={() => {
                      const ultimo = carrito[carrito.length - 1];
                      if (!ultimo || gramera.peso === null) return;
                      setCantidadDirecta(ultimo.producto.id, gramera.peso);
                      gramera.limpiar();
                    }}
                    className="px-2 py-0.5 rounded-md bg-violet-600 text-white font-medium hover:bg-violet-500 transition-colors"
                  >
                    Aplicar
                  </button>
                )}
                <div className="flex-1" />
                {gramera.status === "lista" && cajaConfig?.gramera?.tipo === "serial" && (
                  <button onClick={gramera.desconectar} className="text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors">
                    <WifiOff className="h-3 w-3" />
                  </button>
                )}
              </>
            ) : gramera.status === "conectando" ? (
              <span className="text-gray-400 dark:text-slate-500">Conectando...</span>
            ) : gramera.status === "error" ? (
              <span className="text-red-500">Error al conectar</span>
            ) : (
              <>
                <span className="text-gray-400 dark:text-slate-500 flex-1">Gramera desconectada</span>
                {cajaConfig?.gramera?.tipo === "serial" && (
                  <button
                    onClick={() => void gramera.conectar()}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-600 text-white font-medium hover:bg-violet-500 transition-colors"
                  >
                    <Wifi className="h-3 w-3" /> Conectar
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 dark:text-slate-700 gap-2">
              <p className="text-sm">Carrito vacío</p>
              <p className="text-xs text-gray-300 dark:text-slate-600">Toca un producto para agregar</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800/60">
              {carrito.map((item) => {
                const baseItem = item.cantidad * item.precio_unitario * (1 - item.descuento_pct / 100);
                const totalItem = baseItem * (1 + Number(item.producto.iva_pct) / 100);
                const editandoDesc = descuentoEditId === item.producto.id;
                return (
                  <div key={item.producto.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight truncate">{item.producto.nombre}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">{cop(item.precio_unitario)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => cambiarCantidad(item.producto.id, -1)}
                          className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-500 transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number" min="0.5" step="0.5"
                          value={item.cantidad}
                          onChange={(e) => setCantidadDirecta(item.producto.id, Number(e.target.value))}
                          className="w-9 text-center text-xs font-bold bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg py-1 text-gray-900 dark:text-white focus:outline-none focus:border-violet-500"
                        />
                        <button
                          onClick={() => cambiarCantidad(item.producto.id, 1)}
                          className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-500 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="text-right flex-shrink-0 w-16">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{cop(totalItem)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setDescuentoEditId(editandoDesc ? null : item.producto.id)}
                          className={cn(
                            "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                            item.descuento_pct > 0
                              ? "bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700/60 text-amber-600 dark:text-amber-400"
                              : "bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-600 hover:text-gray-600 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500"
                          )}
                          title="Descuento"
                        >
                          <Percent className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => eliminarItem(item.producto.id)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 dark:text-slate-700 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {editandoDesc && (
                      <div className="mt-1.5 flex items-center gap-2 pl-1">
                        <label className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">Descuento %</label>
                        <input
                          type="number" min="0" max="100" step="1"
                          autoFocus
                          value={item.descuento_pct}
                          onChange={(e) => setDescuento(item.producto.id, Number(e.target.value))}
                          onBlur={() => setDescuentoEditId(null)}
                          className="w-16 text-center text-sm font-semibold bg-gray-100 dark:bg-slate-800 border border-amber-400 dark:border-amber-700/60 rounded-lg py-1 text-amber-600 dark:text-amber-300 focus:outline-none focus:border-amber-500"
                        />
                        {item.descuento_pct > 0 && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            − {cop(item.cantidad * item.precio_unitario * (item.descuento_pct / 100))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Totales + acciones */}
        <div className="border-t border-gray-200 dark:border-slate-800 p-3 flex-shrink-0 space-y-2.5 bg-gray-100 dark:bg-[#0D1120]">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
              <span>Subtotal</span><span>{cop(subtotalCarrito)}</span>
            </div>
            {descuentoTotal > 0 && (
              <div className="flex justify-between text-xs text-amber-600 dark:text-amber-500">
                <span>Descuento</span><span>− {cop(descuentoTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500">
              <span>IVA</span><span>{cop(ivaCarrito)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-200 dark:border-slate-800">
              <span className="text-sm font-semibold text-gray-600 dark:text-slate-300">TOTAL</span>
              <span className="text-2xl font-black text-gray-900 dark:text-white">{cop(totalCarrito)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={pausarVenta}
              disabled={carrito.length === 0}
              title="Pausar (pre-cuenta)"
              className="w-10 h-10 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:border-gray-400 dark:hover:border-slate-600 disabled:opacity-30 transition-colors flex-shrink-0"
            >
              <Pause className="h-4 w-4" />
            </button>
            <button
              onClick={abrirPago}
              disabled={carrito.length === 0}
              className="flex-1 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-white font-bold text-sm transition-colors"
            >
              {carrito.length === 0 ? "Cobrar" : `Cobrar ${cop(totalCarrito)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal pre-cuentas ── */}
      {showPreCuentas && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-40">
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-800">
              <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-500 dark:text-violet-400" />
                Pre-cuentas ({preCuentas.length})
              </p>
              <button onClick={() => setShowPreCuentas(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {preCuentas.map((pc) => (
                <button
                  key={pc.id}
                  onClick={() => retomarPreCuenta(pc)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{pc.nombre}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                      {pc.clienteNombre || "Sin cliente"} · {pc.items.length} ítems
                    </p>
                  </div>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {cop(pc.items.reduce((s, i) => s + i.cantidad * i.precio_unitario * (1 - i.descuento_pct / 100) * (1 + Number(i.producto.iva_pct) / 100), 0))}
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
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">Cobrar</p>
                {clienteNombre && <p className="text-xs text-gray-400 dark:text-slate-500">{clienteNombre}</p>}
              </div>
              <button onClick={() => setShowPago(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <p className="text-4xl font-black text-gray-900 dark:text-white text-center">{cop(totalCarrito)}</p>

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
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300"
                      : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600 hover:text-gray-700 dark:hover:text-slate-200"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {metodoPago === "efectivo" && (
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wide">Recibido</label>
                <input
                  type="number"
                  autoFocus
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl px-4 py-3 text-2xl font-bold text-center text-gray-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                <div className="flex justify-between text-sm bg-gray-100 dark:bg-slate-800 rounded-xl px-4 py-2.5">
                  <span className="text-gray-500 dark:text-slate-400">Vuelto</span>
                  <span className={cn("font-bold text-lg", vuelto < 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                    {cop(vuelto)}
                  </span>
                </div>
              </div>
            )}

            {/* Observaciones */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 dark:text-slate-500">Observaciones (opcional)</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Notas de la venta..."
                className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 resize-none focus:outline-none focus:border-gray-400 dark:focus:border-slate-500"
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/50 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              onClick={() => void procesarVenta()}
              disabled={procesando || (metodoPago === "efectivo" && Number(montoRecibido) < totalCarrito)}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 py-4 text-lg font-bold text-white transition-colors"
            >
              {procesando ? "Procesando..." : "Confirmar venta"}
            </button>

            {/* Fiar a cartera */}
            {!showFiarForm ? (
              <button
                onClick={() => setShowFiarForm(true)}
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-400 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
              >
                Registrar como cartera (sin cobro)
              </button>
            ) : (
              <div className="space-y-2 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">El inventario se descuenta pero el pago queda pendiente</p>
                <input
                  autoFocus
                  value={nombreFiado}
                  onChange={(e) => setNombreFiado(e.target.value)}
                  placeholder="Nombre del cliente *"
                  className="w-full bg-white dark:bg-slate-800 border border-amber-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setShowFiarForm(false); setNombreFiado(""); }} className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 py-2 text-sm text-gray-500 dark:text-slate-400">
                    Cancelar
                  </button>
                  <button
                    onClick={() => void procesarFiado()}
                    disabled={procesando || !nombreFiado.trim()}
                    className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-500 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {procesando ? "Guardando..." : "Confirmar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal venta exitosa ── */}
      {ultimaVenta && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border-2 border-emerald-400 dark:border-emerald-500 flex items-center justify-center mx-auto">
              <svg className="h-8 w-8 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">¡Venta registrada!</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{ultimaVenta.numero}</p>
            </div>
            <p className="text-3xl font-black text-gray-900 dark:text-white">{cop(ultimaVenta.total)}</p>
            {ultimaVenta.vuelto > 0 && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700/50 py-3">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wide font-medium mb-0.5">Vuelto</p>
                <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{cop(ultimaVenta.vuelto)}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={imprimirTirilla}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 py-2.5 text-sm font-semibold text-gray-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
              <button
                onClick={() => setShowWhatsApp(true)}
                className="flex-1 rounded-xl bg-green-500 hover:bg-green-400 py-2.5 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </button>
            </div>

            <button
              onClick={() => { setUltimaVenta(null); setShowWhatsApp(false); setWhatsappPhone(""); busquedaRef.current?.focus(); }}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 py-3 text-base font-bold text-white transition-colors"
            >
              Nueva venta
            </button>
          </div>
        </div>
      )}

      {/* ── Modal WhatsApp ── */}
      {showWhatsApp && ultimaVenta && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-500" />
                Enviar por WhatsApp
              </p>
              <button onClick={() => { setShowWhatsApp(false); setWhatsappPhone(""); }} className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400">Número de celular del cliente</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">+57</span>
                <input
                  type="tel"
                  autoFocus
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="3001234567"
                  maxLength={10}
                  className="flex-1 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-base font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
            <button
              onClick={enviarWhatsApp}
              disabled={whatsappPhone.replace(/\D/g, "").length < 10}
              className="w-full rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40 py-3 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Abrir WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
