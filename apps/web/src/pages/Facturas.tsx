import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Plus, FileDown, BookOpen, AlertCircle, Search, X } from "lucide-react";
import { apiFetchPaged, cop, fecha, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { TutorialOverlay } from "../components/TutorialOverlay";
import { useTutorial } from "../hooks/useTutorial";

interface FacturaListItem {
  id: string;
  numero: string;
  fecha_emision: string;
  estado: string;
  estado_dian: string | null;
  error_dian: string | null;
  total: string;
  cufe: string | null;
  cliente: { id: string; nombre: string; numero_documento: string };
}

const DIAN_BADGE: Record<string, { label: string; cls: string }> = {
  emitida:  { label: "DIAN ✓",    cls: "bg-green-100 text-green-700" },
  pendiente:{ label: "DIAN pend.", cls: "bg-yellow-100 text-yellow-700" },
  error:    { label: "DIAN error", cls: "bg-red-100 text-red-700" },
};

const ESTADO_BADGE: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  aceptada: "green",
  borrador: "yellow",
  rechazada: "red",
  anulada: "gray",
  enviada: "blue",
};

const ESTADO_LABEL: Record<string, string> = {
  aceptada: "Aceptada",
  borrador: "Borrador",
  rechazada: "Rechazada",
  anulada: "Anulada",
  enviada: "Enviada",
};

const TUTORIAL_PASOS = [
  {
    titulo: "Bienvenido a Facturación",
    descripcion: "Aquí creas y gestionas todas tus facturas electrónicas DIAN. Cada factura queda registrada y puedes descargarla en PDF.",
  },
  {
    titulo: "Crea tu primera factura",
    descripcion: 'Haz clic en "Nueva factura" para empezar. Solo necesitas seleccionar el cliente y agregar los ítems.',
    selector: 'a[href="/facturas/nueva"]',
  },
  {
    titulo: "Revisa el estado de cada factura",
    descripcion: '"Aceptada" significa que la DIAN la recibió. "Borrador" significa que falló el envío y puedes reintentarlo desde el detalle.',
  },
  {
    titulo: "Exporta a Excel",
    descripcion: "Puedes filtrar por rango de fechas y exportar todas las facturas a Excel para tu contador.",
  },
];

export function Facturas() {
  const { isContador } = useAuth();
  const [facturasList, setFacturasList] = useState<FacturaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const { mostrar: mostrarTutorial, cerrar: cerrarTutorial, relanzar: relanzarTutorial } = useTutorial("facturas");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback((q: string) => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    if (q.trim()) qs.set("q", q.trim());
    if (estadoFiltro) qs.set("estado", estadoFiltro);
    const path = `/api/facturas${qs.toString() ? `?${qs}` : ""}`;
    void apiFetchPaged<FacturaListItem>(path, 1, 100)
      .then((r) => r.data)
      .then(setFacturasList)
      .finally(() => setLoading(false));
  }, [desde, hasta, estadoFiltro]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => cargar(busqueda), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cargar, busqueda]);

  return (
    <div className="flex-1 space-y-6 p-6">
      {mostrarTutorial && (
        <TutorialOverlay
          slug="facturas"
          titulo="Crea tu primera factura"
          pasos={TUTORIAL_PASOS}
          onFin={cerrarTutorial}
        />
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Facturas</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="secondary" size="sm" onClick={relanzarTutorial} title="Ver tutorial">
              <BookOpen className="h-4 w-4" />
            </Button>
            {!isContador && (
              <Link
                to="/facturas/nueva"
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-action-hover"
              >
                <Plus className="h-4 w-4" />
                Nueva factura
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por número, cliente o NIT…"
              className="rounded-md border border-gray-300 pl-8 pr-7 py-1.5 text-sm w-64"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos los estados</option>
            <option value="aceptada">Aceptada</option>
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
            <option value="rechazada">Rechazada</option>
            <option value="anulada">Anulada</option>
          </select>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          <Button variant="secondary" size="sm" disabled={exportando} onClick={() => {
            setExportando(true);
            const qs = new URLSearchParams();
            if (desde) qs.set("desde", desde);
            if (hasta) qs.set("hasta", hasta);
            void descargarExcel(`/api/exportar/facturas?${qs}`, "facturas.xlsx").finally(() => setExportando(false));
          }}>
            <FileDown className="h-4 w-4" />
            {exportando ? "Exportando..." : "Excel"}
          </Button>
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : facturasList.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">
              {isContador ? "Aún no hay facturas registradas en el sistema." : "No hay facturas registradas."}
            </p>
            {!isContador && (
              <Link
                to="/facturas/nueva"
                className="mt-4 inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-action-hover"
              >
                Crear primera factura
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Número</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Cliente</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Estado</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">DIAN</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {facturasList.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link
                      to={`/facturas/${f.id}`}
                      className="font-medium text-green-700 hover:underline"
                    >
                      {f.numero}
                    </Link>
                    {f.cufe && (
                      <p className="truncate text-xs text-gray-400 max-w-[140px]" title={f.cufe}>
                        CUFE: {f.cufe.slice(0, 12)}…
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <Link
                      to={`/clientes/${f.cliente.id}`}
                      className="text-gray-900 hover:underline"
                    >
                      {f.cliente.nombre}
                    </Link>
                    <p className="text-xs text-gray-400">{f.cliente.numero_documento}</p>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{fecha(f.fecha_emision)}</td>
                  <td className="px-6 py-3">
                    <Badge variant={ESTADO_BADGE[f.estado] ?? "gray"}>
                      {ESTADO_LABEL[f.estado] ?? f.estado}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    {f.estado_dian && DIAN_BADGE[f.estado_dian] ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${DIAN_BADGE[f.estado_dian].cls}`}
                        title={f.error_dian ?? undefined}
                      >
                        {f.estado_dian === "error" && <AlertCircle className="h-3 w-3" />}
                        {DIAN_BADGE[f.estado_dian].label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-gray-900">
                    {cop(f.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
