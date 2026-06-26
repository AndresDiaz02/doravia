import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { apiFetch, cop, fecha } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface ClienteDetalle {
  id: string;
  tipo_persona: string;
  tipo_documento: string;
  numero_documento: string;
  digito_verificacion: string | null;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  municipio: string | null;
  departamento: string | null;
  historial: {
    id: string;
    numero: string;
    fecha_emision: string;
    estado: string;
    total: string;
  }[];
}

const ESTADO_BADGE: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  aceptada: "green",
  borrador: "yellow",
  rechazada: "red",
  anulada: "gray",
  enviada: "blue",
};

export function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<ClienteDetalle>(`/api/clientes/${id!}`)
      .then(setCliente)
      .catch(() => navigate("/clientes", { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!cliente) return null;

  const totalFacturado = cliente.historial
    .filter((f) => f.estado === "aceptada")
    .reduce((s, f) => s + Number(f.total), 0);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{cliente.nombre}</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Datos del cliente */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Información</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Tipo" value={cliente.tipo_persona === "natural" ? "Persona natural" : "Persona jurídica"} />
            <Row
              label={cliente.tipo_documento}
              value={
                cliente.tipo_documento === "NIT" && cliente.digito_verificacion
                  ? `${cliente.numero_documento}-${cliente.digito_verificacion}`
                  : cliente.numero_documento
              }
            />
            {cliente.correo && <Row label="Correo" value={cliente.correo} />}
            {cliente.telefono && <Row label="Teléfono" value={cliente.telefono} />}
            {cliente.direccion && <Row label="Dirección" value={cliente.direccion} />}
            {cliente.municipio && (
              <Row
                label="Ubicación"
                value={[cliente.municipio, cliente.departamento].filter(Boolean).join(", ")}
              />
            )}
            <div className="border-t border-gray-100 pt-3">
              <Row label="Total facturado" value={cop(totalFacturado)} bold />
            </div>
          </CardContent>
        </Card>

        {/* Historial de facturas */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              Historial de facturas
            </CardTitle>
            <Link
              to={`/facturas/nueva?cliente_id=${cliente.id}`}
              className="text-xs font-medium text-green-600 hover:underline"
            >
              + Nueva factura
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {cliente.historial.length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-gray-400">
                Sin facturas registradas.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">Número</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">Estado</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cliente.historial.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link
                          to={`/facturas/${f.id}`}
                          className="font-medium text-green-700 hover:underline"
                        >
                          {f.numero}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{fecha(f.fecha_emision)}</td>
                      <td className="px-6 py-3">
                        <Badge variant={ESTADO_BADGE[f.estado] ?? "gray"}>{f.estado}</Badge>
                      </td>
                      <td className="px-6 py-3 text-right font-medium">{cop(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={bold ? "font-semibold text-gray-900" : "text-gray-700"}>{value}</p>
    </div>
  );
}
