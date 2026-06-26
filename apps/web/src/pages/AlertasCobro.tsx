import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, cop, fecha } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { AlertTriangle, CheckCircle, ExternalLink } from "lucide-react";

interface FacturaVencida {
  id: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  total: string;
  cliente: {
    id: string;
    nombre: string;
    correo: string | null;
    telefono: string | null;
  };
}

export default function AlertasCobro() {
  const [facturas, setFacturas] = useState<FacturaVencida[]>([]);
  const [loading, setLoading] = useState(true);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const data = await apiFetch<FacturaVencida[]>("/api/alertas/cobro");
      setFacturas(data);
    } catch {
      setError("No se pudo cargar las alertas de cobro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function marcarPagada(id: string) {
    setMarcando(id);
    try {
      await apiFetch(`/api/facturas/${id}/marcar-pagada`, { method: "PATCH" });
      setFacturas((prev) => prev.filter((f) => f.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo marcar la factura como pagada.");
    } finally {
      setMarcando(null);
    }
  }

  function diasVencida(fechaVenc: string) {
    const diff = Date.now() - new Date(fechaVenc).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  if (loading) return <p className="p-8 text-gray-500">Cargando alertas…</p>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Alertas de cobro</h1>
        <p className="text-sm text-gray-500 mt-1">
          Facturas aceptadas por la DIAN con fecha de vencimiento pasada y pendientes de pago.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {facturas.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-lg font-medium text-gray-700">Todo al día</p>
            <p className="text-sm text-gray-500">
              No hay facturas vencidas pendientes de cobro.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">
              Tienes <strong>{facturas.length}</strong> factura(s) vencida(s) por cobrar.
              Total:{" "}
              <strong>
                {cop(facturas.reduce((s, f) => s + Number(f.total), 0))}
              </strong>
            </p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Factura</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Vence</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Días vencida</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {facturas.map((f) => {
                  const dias = diasVencida(f.fecha_vencimiento);
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/facturas/${f.id}`}
                          className="font-medium text-green-700 hover:text-green-800 flex items-center gap-1"
                        >
                          {f.numero}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                        <span className="text-xs text-gray-400">{fecha(f.fecha_emision)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{f.cliente.nombre}</p>
                        {f.cliente.correo && (
                          <p className="text-xs text-gray-400">{f.cliente.correo}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fecha(f.fecha_vencimiento)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${dias > 30 ? "text-red-600" : dias > 15 ? "text-amber-600" : "text-gray-700"}`}>
                          {dias} días
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {cop(Number(f.total))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={marcando === f.id}
                          onClick={() => marcarPagada(f.id)}
                        >
                          {marcando === f.id ? "Marcando…" : "Marcar pagada"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
