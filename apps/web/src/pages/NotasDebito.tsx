import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, FileDown } from "lucide-react";
import { HelpTooltip } from "../components/HelpTooltip";
import { apiFetch, cop, fecha, descargarExcel } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

interface NotaDebito {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  total: string;
  motivo: string;
  fecha_emision: string;
  factura_id: string;
  cude: string | null;
  estado_dian: string | null;
  cliente: { id: string; nombre: string };
}

const TIPO_LABEL: Record<string, string> = {
  interes: "Intereses",
  gastos:  "Gastos",
  ajuste:  "Ajuste de valor",
};

const TIPO_COLOR: Record<string, "red" | "yellow" | "blue" | "gray"> = {
  interes: "yellow",
  gastos:  "blue",
  ajuste:  "gray",
};

const DIAN_LABEL: Record<string, string> = {
  emitida: "DIAN ✓",
  error: "Error DIAN",
  pendiente: "Pendiente",
  no_aplica: "",
};

const DIAN_COLOR: Record<string, "green" | "red" | "yellow" | "gray"> = {
  emitida: "green",
  error: "red",
  pendiente: "yellow",
  no_aplica: "gray",
};

export default function NotasDebito() {
  const [notas, setNotas] = useState<NotaDebito[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<NotaDebito[]>("/api/notas-debito")
      .then(setNotas)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-semibold text-gray-900">
            Notas débito
            <HelpTooltip text="Úsala para aumentar el valor de una factura ya aceptada por la DIAN (intereses, gastos adicionales o ajustes de precio)." side="right" />
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Creadas desde el detalle de cada factura aceptada</p>
        </div>
        <Button variant="secondary" onClick={() => void descargarExcel("/api/exportar/notas-debito", "notas_debito.xlsx")}>
          <FileDown className="h-4 w-4" /> Excel
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : notas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <FileText className="h-8 w-8" />
            <p className="text-sm">Sin notas débito emitidas</p>
            <p className="text-xs">Créalas desde el detalle de una factura aceptada</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Número</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Cliente</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Tipo</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Motivo</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">DIAN</th>
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
                  <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{n.motivo}</td>
                  <td className="px-6 py-3 text-gray-500">{fecha(n.fecha_emision)}</td>
                  <td className="px-6 py-3">
                    {n.estado_dian && n.estado_dian !== "no_aplica" && DIAN_LABEL[n.estado_dian] && (
                      <Badge variant={DIAN_COLOR[n.estado_dian] ?? "gray"}>
                        {DIAN_LABEL[n.estado_dian]}
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-orange-600">+ {cop(n.total)}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to={`/notas-debito/${n.id}`} className="text-xs text-green-600 hover:underline">
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
