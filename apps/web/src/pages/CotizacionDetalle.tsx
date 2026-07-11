import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch, cop, fecha } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ArrowLeft, Link2, CheckCircle2, Clock, XCircle, Download } from "lucide-react";

interface ItemDetalle {
  id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct: string;
  iva_pct: string;
  subtotal: string;
  iva_valor: string;
  total: string;
}

interface CotizacionFull {
  id: string;
  numero: string;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  subtotal: string;
  iva_total: string;
  total: string;
  factura_id: string | null;
  observaciones: string | null;
  descripcion_plan: string | null;
  condiciones_pago: string | null;
  metodo_pago: string | null;
  cliente: { id: string; nombre: string; correo: string | null; telefono: string | null };
  items: ItemDetalle[];
}

interface PagoEstado {
  tiene_pago: boolean;
  id?: string;
  proveedor?: string;
  estado?: string;
  url_link_pago?: string;
  monto?: string;
  pagado_en?: string | null;
  expira_en?: string | null;
}

const ESTADO_BADGE: Record<string, "green" | "yellow" | "red" | "gray" | "blue" | "purple"> = {
  borrador:   "yellow",
  enviada:    "blue",
  aceptada:   "green",
  pagada:     "purple",
  rechazada:  "red",
  vencida:    "gray",
  convertida: "green",
};

const ESTADO_LABEL: Record<string, string> = {
  borrador:   "Borrador",
  enviada:    "Enviada",
  aceptada:   "Aceptada",
  pagada:     "Pagada en línea",
  rechazada:  "Rechazada",
  vencida:    "Vencida",
  convertida: "Convertida a factura",
};

const PAGO_BADGE: Record<string, "green" | "yellow" | "red" | "gray"> = {
  pendiente:    "yellow",
  pagado:       "green",
  expirado:     "gray",
  fallido:      "red",
  reembolsado:  "gray",
};

const PAGO_LABEL: Record<string, string> = {
  pendiente:   "Pendiente",
  pagado:      "Pagado",
  expirado:    "Expirado",
  fallido:     "Fallido",
  reembolsado: "Reembolsado",
};

export default function CotizacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const rol = user?.role ?? "";

  const [cot, setCot] = useState<CotizacionFull | null>(null);
  const [pago, setPago] = useState<PagoEstado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [linkGenerado, setLinkGenerado] = useState<string | null>(null);

  async function cargar() {
    try {
      const [c, p] = await Promise.all([
        apiFetch<CotizacionFull>(`/api/cotizaciones/${id}`),
        apiFetch<PagoEstado>(`/api/cotizaciones/${id}/pago`).catch(() => null),
      ]);
      setCot(c);
      if (p) setPago(p);
    } catch {
      setError("No se pudo cargar la cotización.");
    }
  }

  useEffect(() => { void cargar(); }, [id]);

  async function generarLink() {
    if (!id) return;
    setGenerando(true);
    setError(null);
    try {
      const res = await apiFetch<{ url_link_pago: string }>(`/api/cotizaciones/${id}/link-pago`, { method: "POST" });
      setLinkGenerado(res.url_link_pago);
      void cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el link.");
    } finally {
      setGenerando(false);
    }
  }

  function descargarPdf() {
    const token = localStorage.getItem("access_token") ?? "";
    fetch(`/api/documentos/cotizaciones/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((b) => {
        const url = URL.createObjectURL(b);
        Object.assign(document.createElement("a"), { href: url, download: `${cot?.numero ?? id}.pdf` }).click();
        URL.revokeObjectURL(url);
      });
  }

  if (!cot) return <p className="p-8 text-gray-500">{error ?? "Cargando…"}</p>;

  const puedeGenerarLink = ["admin", "vendedor"].includes(rol) && ["enviada", "aceptada"].includes(cot.estado);
  const vencida = cot.fecha_vencimiento && new Date(cot.fecha_vencimiento) < new Date();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/cotizaciones" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{cot.numero}</h1>
          <p className="text-sm text-gray-500">{cot.cliente.nombre}</p>
        </div>
        <Badge variant={ESTADO_BADGE[cot.estado] ?? "gray"}>{ESTADO_LABEL[cot.estado] ?? cot.estado}</Badge>
        <Button variant="secondary" onClick={descargarPdf}>
          <Download className="w-4 h-4 mr-1" /> PDF
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Fecha de emisión</p>
            <p className="font-medium text-gray-900">{fecha(cot.fecha_emision)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Vencimiento</p>
            <p className={`font-medium ${vencida ? "text-red-600" : "text-gray-900"}`}>
              {cot.fecha_vencimiento ? fecha(cot.fecha_vencimiento) : "Sin vencimiento"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Total</p>
            <p className="font-semibold text-xl text-gray-900">{cop(cot.total)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Link de pago */}
      {(puedeGenerarLink || pago?.tiene_pago) && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-indigo-500" /> Link de pago en línea
            </h3>

            {pago?.tiene_pago ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {pago.estado === "pagado" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : pago.estado === "pendiente" ? (
                    <Clock className="w-4 h-4 text-yellow-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <Badge variant={PAGO_BADGE[pago.estado ?? ""] ?? "gray"}>
                    {PAGO_LABEL[pago.estado ?? ""] ?? pago.estado}
                  </Badge>
                  {pago.pagado_en && (
                    <span className="text-xs text-gray-500">el {fecha(pago.pagado_en)}</span>
                  )}
                </div>
                {pago.estado === "pendiente" && pago.url_link_pago && (
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={pago.url_link_pago}
                      className="flex-1 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 font-mono"
                    />
                    <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(pago.url_link_pago!)}>
                      Copiar
                    </Button>
                    <a href={pago.url_link_pago} target="_blank" rel="noreferrer">
                      <Button variant="secondary">Abrir</Button>
                    </a>
                  </div>
                )}
              </div>
            ) : puedeGenerarLink ? (
              <div className="space-y-2">
                {vencida && (
                  <p className="text-xs text-red-500">La cotización está vencida — no se puede generar link.</p>
                )}
                {linkGenerado ? (
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={linkGenerado}
                      className="flex-1 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 font-mono"
                    />
                    <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(linkGenerado)}>Copiar</Button>
                    <a href={linkGenerado} target="_blank" rel="noreferrer"><Button variant="secondary">Abrir</Button></a>
                  </div>
                ) : (
                  <Button onClick={() => void generarLink()} disabled={generando || !!vencida}>
                    <Link2 className="w-4 h-4 mr-1" />
                    {generando ? "Generando…" : "Generar link de pago"}
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Ítems */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <h3 className="font-medium text-gray-900 mb-3">Ítems</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="pb-2 text-xs font-medium text-gray-500">Descripción</th>
                <th className="pb-2 text-xs font-medium text-gray-500 text-right">Cant.</th>
                <th className="pb-2 text-xs font-medium text-gray-500 text-right">Precio unit.</th>
                <th className="pb-2 text-xs font-medium text-gray-500 text-right">Desc.%</th>
                <th className="pb-2 text-xs font-medium text-gray-500 text-right">IVA%</th>
                <th className="pb-2 text-xs font-medium text-gray-500 text-right">Subtotal</th>
                <th className="pb-2 text-xs font-medium text-gray-500 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cot.items.map((it) => (
                <tr key={it.id}>
                  <td className="py-2 text-gray-800">{it.descripcion}</td>
                  <td className="py-2 text-right text-gray-600">{it.cantidad}</td>
                  <td className="py-2 text-right text-gray-600">{cop(it.precio_unitario)}</td>
                  <td className="py-2 text-right text-gray-600">{it.descuento_pct}%</td>
                  <td className="py-2 text-right text-gray-600">{it.iva_pct}%</td>
                  <td className="py-2 text-right text-gray-600">{cop(it.subtotal)}</td>
                  <td className="py-2 text-right font-medium text-gray-900">{cop(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 border-t border-gray-100 pt-3 flex flex-col items-end gap-1 text-sm">
            <div className="flex gap-8 text-gray-500">
              <span>Subtotal</span><span>{cop(cot.subtotal)}</span>
            </div>
            <div className="flex gap-8 text-gray-500">
              <span>IVA</span><span>{cop(cot.iva_total)}</span>
            </div>
            <div className="flex gap-8 font-semibold text-gray-900 text-base">
              <span>Total</span><span>{cop(cot.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {(cot.observaciones || cot.descripcion_plan || cot.condiciones_pago || cot.metodo_pago) && (
        <Card>
          <CardContent className="pt-4 space-y-2 text-sm">
            {cot.descripcion_plan && (
              <div><span className="font-medium text-gray-700">Descripción del plan: </span><span className="text-gray-600">{cot.descripcion_plan}</span></div>
            )}
            {cot.condiciones_pago && (
              <div><span className="font-medium text-gray-700">Condiciones de pago: </span><span className="text-gray-600">{cot.condiciones_pago}</span></div>
            )}
            {cot.metodo_pago && (
              <div><span className="font-medium text-gray-700">Método de pago: </span><span className="text-gray-600">{cot.metodo_pago}</span></div>
            )}
            {cot.observaciones && (
              <div><span className="font-medium text-gray-700">Observaciones: </span><span className="text-gray-600">{cot.observaciones}</span></div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
