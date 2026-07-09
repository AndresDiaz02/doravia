import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, FileText, Package, Truck, X } from "lucide-react";
import { apiFetch } from "../lib/api";

interface BuscarResultados {
  clientes:    { id: string; nombre: string; nit: string }[];
  facturas:    { id: string; numero_factura: string; cliente_nombre: string; total: string }[];
  productos:   { id: string; nombre: string; codigo: string; precio_venta: string }[];
  proveedores: { id: string; nombre: string }[];
}

const EMPTY: BuscarResultados = { clientes: [], facturas: [], productos: [], proveedores: [] };

function sinResultados(r: BuscarResultados) {
  return r.clientes.length + r.facturas.length + r.productos.length + r.proveedores.length === 0;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<BuscarResultados>(EMPTY);
  const [cargando, setCargando] = useState(false);
  const [seleccionado, setSeleccionado] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Ctrl+K abre el buscador
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Foco al abrir
  useEffect(() => {
    if (open) {
      setQuery("");
      setResultados(EMPTY);
      setSeleccionado(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Búsqueda con debounce
  const buscar = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResultados(EMPTY); return; }
    timerRef.current = setTimeout(async () => {
      setCargando(true);
      try {
        const data = await apiFetch<BuscarResultados>(`/api/buscar?q=${encodeURIComponent(q)}`);
        setResultados(data);
        setSeleccionado(-1);
      } catch {
        setResultados(EMPTY);
      } finally {
        setCargando(false);
      }
    }, 250);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    buscar(v);
  }

  // Lista plana de resultados para navegación con teclado
  const items = [
    ...resultados.clientes.map((c) => ({ label: c.nombre, sub: c.nit, url: `/clientes/${c.id}` })),
    ...resultados.facturas.map((f) => ({ label: f.numero_factura, sub: f.cliente_nombre, url: `/facturas/${f.id}` })),
    ...resultados.productos.map((p) => ({ label: p.nombre, sub: p.codigo, url: `/productos/${p.id}` })),
    ...resultados.proveedores.map((p) => ({ label: p.nombre, sub: "", url: `/proveedores/${p.id}` })),
  ];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSeleccionado((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSeleccionado((s) => Math.max(s - 1, -1)); }
    if (e.key === "Enter" && seleccionado >= 0 && items[seleccionado]) {
      navigate(items[seleccionado].url);
      setOpen(false);
    }
  }

  function ir(url: string) {
    navigate(url);
    setOpen(false);
  }

  if (!open) return null;

  const hayBusqueda = query.trim().length >= 2;
  const hayResultados = !sinResultados(resultados);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, facturas, productos…"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
          />
          {cargando && (
            <span className="h-4 w-4 rounded-full border-2 border-action border-t-transparent animate-spin flex-shrink-0" />
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Resultados */}
        <div className="max-h-96 overflow-y-auto">
          {!hayBusqueda && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              Escribe al menos 2 caracteres para buscar
            </p>
          )}

          {hayBusqueda && !cargando && !hayResultados && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              Sin resultados para «{query}»
            </p>
          )}

          {hayResultados && (
            <div className="p-2 space-y-1">
              <Grupo
                icono={<Users className="h-3.5 w-3.5" />}
                titulo="Clientes"
                items={resultados.clientes.map((c) => ({
                  label: c.nombre, sub: c.nit, url: `/clientes/${c.id}`,
                }))}
                offset={0}
                seleccionado={seleccionado}
                onIr={ir}
              />
              <Grupo
                icono={<FileText className="h-3.5 w-3.5" />}
                titulo="Facturas"
                items={resultados.facturas.map((f) => ({
                  label: f.numero_factura, sub: f.cliente_nombre, url: `/facturas/${f.id}`,
                }))}
                offset={resultados.clientes.length}
                seleccionado={seleccionado}
                onIr={ir}
              />
              <Grupo
                icono={<Package className="h-3.5 w-3.5" />}
                titulo="Productos"
                items={resultados.productos.map((p) => ({
                  label: p.nombre, sub: p.codigo, url: `/productos/${p.id}`,
                }))}
                offset={resultados.clientes.length + resultados.facturas.length}
                seleccionado={seleccionado}
                onIr={ir}
              />
              <Grupo
                icono={<Truck className="h-3.5 w-3.5" />}
                titulo="Proveedores"
                items={resultados.proveedores.map((p) => ({
                  label: p.nombre, sub: "", url: `/proveedores/${p.id}`,
                }))}
                offset={resultados.clientes.length + resultados.facturas.length + resultados.productos.length}
                seleccionado={seleccionado}
                onIr={ir}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex items-center gap-4 text-xs text-gray-400">
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Enter</kbd> abrir</span>
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Esc</kbd> cerrar</span>
          <span className="ml-auto"><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">Ctrl K</kbd></span>
        </div>
      </div>
    </div>
  );
}

function Grupo({
  icono, titulo, items, offset, seleccionado, onIr,
}: {
  icono: React.ReactNode;
  titulo: string;
  items: { label: string; sub: string; url: string }[];
  offset: number;
  seleccionado: number;
  onIr: (url: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {icono}
        {titulo}
      </div>
      {items.map((item, i) => {
        const idx = offset + i;
        return (
          <button
            key={item.url}
            onClick={() => onIr(item.url)}
            className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              seleccionado === idx
                ? "bg-action/10 text-action"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <span className="font-medium truncate">{item.label}</span>
            {item.sub && <span className="ml-3 text-xs text-gray-400 flex-shrink-0">{item.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Botón trigger para usar en el sidebar
export function SearchTrigger() {
  return (
    <button
      onClick={() => {
        const evt = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
        document.dispatchEvent(evt);
      }}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors border border-dashed border-gray-200 dark:border-gray-700"
    >
      <Search className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 text-left">Buscar…</span>
      <kbd className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">Ctrl K</kbd>
    </button>
  );
}
