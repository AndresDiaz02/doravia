import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileX, FileDown } from "lucide-react";
import { HelpTooltip } from "../components/HelpTooltip";
import { apiFetch, cop, fecha, descargarExcel } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

interface NotaCredito {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  estado_dian: string | null;
  total: string;
  motivo: string;
  fecha_emision: string;
  factura_id: string;
  cliente: { id: string; nombre: string };
}

const DIAN_COLOR: Record<string, "green" | "yellow" | "red"> = {
  emitida:  "green",
  pendiente: "yellow",
  error:    "red",
};

const DIAN_LABEL: Record<string, string> = {
  emitida:  "DIAN ✓",
  pendiente: "DIAN pend.",
  error:    "Error DIAN",
};

const TIPO_LABEL: Record<string, string> = {
  anulacion: "Anulación",
  devolucion: "Devolución",
  descuento:  "Descuento",
  ajuste:     "Ajuste",
};

const TIPO_COLOR: Record<string, "red" | "yellow" | "blue" | "gray"> = {
  anulacion: "red",
  devolucion: "yellow",
  descuento:  "blue",
  ajuste:     "gray",
};

export default function NotasCredito() {
  const [notas, setNotas] = useState<NotaCredito[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<NotaCredito[]>("/api/notas-credito")
      .then(setNotas)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-semibold text-gray-900">
            Notas crédito
            <HelpTooltip text="Úsala para corregir o devolver parcialmente una factura ya aceptada por la DIAN. No anula la factura original." side="right" />
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Creadas desde el detalle de cada factura aceptada</p>
        </div>
        <Button variant="secondary" onClick={() => void descargarExcel("/api/exportar/notas-credito", "notas_credito.xlsx")}>
          <FileDown className="h-4 w-4" /> Excel
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : notas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <FileX className="h-8 w-8" />
            <p className="text-sm">Sin notas crédito emitidas</p>
            <p className="text-xs">Créalas desde el detalle de una factura aceptada</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Número</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Cliente</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Tipo</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">DIAN</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Motivo</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {notas.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-xs font-semibold text-gray-800">{n.numero}</td>
                  <td className="px-6 py-3 text-gray-700">{n.cliente.nombre}</td>
                  <td className="px-6 py-3">
                    <Badge variant={TIPO_COLOR[n.tipo] ?? "gray"}>{TIPO_LABEL[n.tipo] ?? n.tipo}</Badge>
                  </td>
                  <td className="px-6 py-3">
                    {n.estado_dian && DIAN_LABEL[n.estado_dian] ? (
                      <Badge variant={DIAN_COLOR[n.estado_dian] ?? "gray"}>
                        {DIAN_LABEL[n.estado_dian]}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{n.motivo}</td>
                  <td className="px-6 py-3 text-gray-500">{fecha(n.fecha_emision)}</td>
                  <td className="px-6 py-3 text-right font-medium text-red-600">- {cop(n.total)}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/notas-credito/${n.id}`} className="text-xs text-green-600 hover:underline">
                      Ver
                    </Link>
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
