import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FileDown } from "lucide-react";
import { apiFetchPaged, cop, fecha, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";

interface FacturaListItem {
  id: string;
  numero: string;
  fecha_emision: string;
  estado: string;
  total: string;
  cufe: string | null;
  cliente: { id: string; nombre: string; numero_documento: string };
}

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

export function Facturas() {
  const { isContador } = useAuth();
  const [facturas, setFacturas] = useState<FacturaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    void apiFetchPaged<FacturaListItem>("/api/facturas", 1, 50)
      .then((r) => r.data)
      .then(setFacturas)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Facturas</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="Desde" />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="Hasta" />
          <Button variant="secondary" disabled={exportando} onClick={() => {
            setExportando(true);
            const qs = new URLSearchParams();
            if (desde) qs.set("desde", desde);
            if (hasta) qs.set("hasta", hasta);
            void descargarExcel(`/api/exportar/facturas?${qs}`, "facturas.xlsx").finally(() => setExportando(false));
          }}>
            <FileDown className="h-4 w-4" />
            {exportando ? "Exportando..." : "Exportar Excel"}
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

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : facturas.length === 0 ? (
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
                <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {facturas.map((f) => (
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
