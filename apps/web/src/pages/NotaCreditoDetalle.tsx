import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { apiFetch, cop, fecha } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface ItemNota {
  id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  iva_pct: string;
  subtotal: string;
  iva_valor: string;
  total: string;
}

interface NotaDetalle {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  motivo: string;
  subtotal: string;
  iva_total: string;
  total: string;
  fecha_emision: string;
  factura_id: string;
  factura_numero: string;
  cliente: { id: string; nombre: string; numero_documento: string };
  items: ItemNota[];
}

const TIPO_LABEL: Record<string, string> = {
  anulacion: "Anulación",
  devolucion: "Devolución",
  descuento:  "Descuento",
  ajuste:     "Ajuste de precio",
};

const TIPO_COLOR: Record<string, "red" | "yellow" | "blue" | "gray"> = {
  anulacion: "red",
  devolucion: "yellow",
  descuento:  "blue",
  ajuste:     "gray",
};

export default function NotaCreditoDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [nota, setNota] = useState<NotaDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<NotaDetalle>(`/api/notas-credito/${id!}`)
      .then(setNota)
      .catch(() => navigate("/notas-credito", { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-gray-400">Cargando...</div>;
  if (!nota) return null;

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{nota.numero}</h1>
              <Badge variant={TIPO_COLOR[nota.tipo] ?? "gray"}>{TIPO_LABEL[nota.tipo] ?? nota.tipo}</Badge>
            </div>
            <p className="text-sm text-gray-500">Emitida el {fecha(nota.fecha_emision)}</p>
          </div>
        </div>
      </div>

      {/* Info general */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Cliente</p>
            <p className="font-semibold text-gray-900">{nota.cliente.nombre}</p>
            <p className="text-xs text-gray-400">{nota.cliente.numero_documento}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Factura original</p>
            <Link to={`/facturas/${nota.factura_id}`} className="font-semibold text-green-600 hover:underline">
              {nota.factura_numero}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Motivo</p>
            <p className="text-sm text-gray-800">{nota.motivo}</p>
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle>Ítems</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Descripción</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Cant.</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Precio unit.</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">IVA</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {nota.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-3">{item.descripcion}</td>
                  <td className="px-6 py-3 text-right">{Number(item.cantidad).toLocaleString("es-CO")}</td>
                  <td className="px-6 py-3 text-right">{cop(item.precio_unitario)}</td>
                  <td className="px-6 py-3 text-right">{item.iva_pct}%</td>
                  <td className="px-6 py-3 text-right font-medium">{cop(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end border-t border-gray-100 px-6 py-4">
            <div className="w-56 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>{cop(nota.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>IVA</span><span>{cop(nota.iva_total)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-red-600">
                <span>Total nota crédito</span><span>- {cop(nota.total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
