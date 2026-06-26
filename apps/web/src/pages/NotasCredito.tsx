import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileX } from "lucide-react";
import { apiFetch, cop, fecha } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface NotaCredito {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  total: string;
  motivo: string;
  fecha_emision: string;
  factura_id: string;
  cliente: { id: string; nombre: string };
}

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
          <h1 className="text-xl font-semibold text-gray-900">Notas crédito</h1>
          <p className="text-sm text-gray-500 mt-0.5">Creadas desde el detalle de cada factura aceptada</p>
        </div>
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
