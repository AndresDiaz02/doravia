import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, ExternalLink, CheckCircle, Download, FileX } from "lucide-react";
import { HelpTooltip } from "../components/HelpTooltip";
import { apiFetch, ApiError, cop, fecha } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface ItemFactura {
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

interface ClienteInfo {
  id: string;
  nombre: string;
  tipo_documento: string;
  numero_documento: string;
  digito_verificacion: string | null;
  correo: string | null;
  telefono: string | null;
}

interface RetencionFactura {
  id: string;
  nombre: string;
  tipo: string;
  porcentaje: string;
  base: string;
  valor: string;
}

interface Factura {
  id: string;
  numero: string;
  prefijo: string;
  consecutivo: number;
  estado: string;
  cufe: string | null;
  qr_code: string | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  pagada_at: string | null;
  subtotal: string;
  descuento_total: string;
  iva_total: string;
  total: string;
  total_retenciones: string;
  neto_a_pagar: string;
  observaciones: string | null;
  asiento_id: string | null;
  cliente: ClienteInfo;
  items: ItemFactura[];
  retenciones: RetencionFactura[];
}

const ESTADO_BADGE: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  aceptada: "green",
  borrador: "yellow",
  rechazada: "red",
  anulada: "gray",
  enviada: "blue",
};

const ESTADO_LABEL: Record<string, string> = {
  aceptada: "Aceptada por DIAN",
  borrador: "Borrador",
  rechazada: "Rechazada",
  anulada: "Anulada",
  enviada: "Enviada",
};

export function FacturaDetalle() {
  const { isContador } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [factura, setFactura] = useState<Factura | null>(null);
  const [loading, setLoading] = useState(true);
  const [reenviando, setReenviando] = useState(false);
  const [marcandoPagada, setMarcandoPagada] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [errorReenvio, setErrorReenvio] = useState<string | null>(null);
  const [openNC, setOpenNC] = useState(false);
  const [ncForm, setNcForm] = useState({ tipo: "anulacion", motivo: "" });
  const [creandoNC, setCreandoNC] = useState(false);

  useEffect(() => {
    void apiFetch<Factura>(`/api/facturas/${id!}`)
      .then(setFactura)
      .catch(() => navigate("/facturas", { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  async function handleMarcarPagada() {
    if (!factura) return;
    setMarcandoPagada(true);
    try {
      const actualizada = await apiFetch<Factura>(`/api/facturas/${factura.id}/marcar-pagada`, {
        method: "PATCH",
      });
      setFactura((prev) => (prev ? { ...prev, ...actualizada } : prev));
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setMarcandoPagada(false);
    }
  }

  async function handleDescargarPdf() {
    if (!factura) return;
    setDescargando(true);
    try {
      const token = localStorage.getItem("access_token");
      const resp = await fetch(`/api/documentos/facturas/${factura.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("No se pudo generar el PDF.");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${factura.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorReenvio(err instanceof Error ? err.message : "Error al descargar el PDF.");
    } finally {
      setDescargando(false);
    }
  }

  async function handleCrearNotaCredito() {
    if (!factura) return;
    setCreandoNC(true);
    setErrorReenvio(null);
    try {
      const items = ncForm.tipo === "anulacion"
        ? factura.items.map((i) => ({
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad),
            precio_unitario: Number(i.precio_unitario),
            iva_pct: Number(i.iva_pct),
          }))
        : factura.items.map((i) => ({
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad),
            precio_unitario: Number(i.precio_unitario),
            iva_pct: Number(i.iva_pct),
          }));

      await apiFetch(`/api/notas-credito/factura/${factura.id}`, {
        method: "POST",
        body: JSON.stringify({ tipo: ncForm.tipo, motivo: ncForm.motivo, items }),
      });

      if (ncForm.tipo === "anulacion") {
        setFactura((prev) => prev ? { ...prev, estado: "anulada" } : prev);
      }
      setOpenNC(false);
      setNcForm({ tipo: "anulacion", motivo: "" });
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : "Error al crear nota crédito.");
    } finally {
      setCreandoNC(false);
    }
  }

  async function handleReenviar() {
    if (!factura) return;
    setReenviando(true);
    setErrorReenvio(null);
    try {
      const actualizada = await apiFetch<Factura>(`/api/facturas/${factura.id}/reenviar`, {
        method: "POST",
      });
      setFactura((prev) => (prev ? { ...prev, ...actualizada } : prev));
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setReenviando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!factura) return null;

  const descTotal = Number(factura.descuento_total);

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{factura.numero}</h1>
              <Badge variant={ESTADO_BADGE[factura.estado] ?? "gray"}>
                {ESTADO_LABEL[factura.estado] ?? factura.estado}
              </Badge>
              {factura.pagada_at && (
                <Badge variant="green">Pagada</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Emitida el {fecha(factura.fecha_emision)}
              {factura.fecha_vencimiento && ` · Vence el ${fecha(factura.fecha_vencimiento)}`}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void handleDescargarPdf()} disabled={descargando}>
            <Download className="h-4 w-4" />
            {descargando ? "Generando…" : "Descargar PDF"}
          </Button>
          {!isContador && factura.estado === "aceptada" && !factura.pagada_at && (
            <Button variant="secondary" onClick={() => void handleMarcarPagada()} disabled={marcandoPagada}>
              <CheckCircle className="h-4 w-4" />
              {marcandoPagada ? "Registrando…" : "Marcar como pagada"}
            </Button>
          )}
          {!isContador && factura.estado === "aceptada" && (
            <Button variant="secondary" onClick={() => setOpenNC(true)}>
              <FileX className="h-4 w-4" />
              Nota crédito
            </Button>
          )}
          {!isContador && factura.estado === "borrador" && (
            <Button onClick={() => void handleReenviar()} disabled={reenviando}>
              <RefreshCw className={`h-4 w-4 ${reenviando ? "animate-spin" : ""}`} />
              {reenviando ? "Enviando..." : "Reenviar a DIAN"}
            </Button>
          )}
        </div>
      </div>

      {/* Alerta de error de reenvío */}
      {errorReenvio && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorReenvio}
        </div>
      )}

      {/* Alerta CUFE si fue aceptada */}
      {factura.estado === "aceptada" && factura.cufe && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex-1 text-sm">
            <p className="font-medium text-green-800">Factura electrónica aceptada por la DIAN</p>
            <p className="mt-0.5 font-mono text-xs text-green-700 break-all">CUFE: {factura.cufe}</p>
          </div>
          {factura.qr_code && (
            <a
              href={factura.qr_code}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-green-600 hover:text-green-700"
              title="Ver en portal DIAN"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Datos del cliente */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Nombre</p>
              <Link
                to={`/clientes/${factura.cliente.id}`}
                className="font-medium text-green-700 hover:underline"
              >
                {factura.cliente.nombre}
              </Link>
            </div>
            <div>
              <p className="text-xs text-gray-400">{factura.cliente.tipo_documento}</p>
              <p className="text-gray-700">
                {factura.cliente.numero_documento}
                {factura.cliente.digito_verificacion
                  ? `-${factura.cliente.digito_verificacion}`
                  : ""}
              </p>
            </div>
            {factura.cliente.correo && (
              <div>
                <p className="text-xs text-gray-400">Correo</p>
                <p className="text-gray-700">{factura.cliente.correo}</p>
              </div>
            )}
            {factura.cliente.telefono && (
              <div>
                <p className="text-xs text-gray-400">Teléfono</p>
                <p className="text-gray-700">{factura.cliente.telefono}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Líneas + totales */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ítems</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Descripción</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Cant.</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Precio unit.</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">IVA %</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {factura.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-3 text-gray-900">{item.descripcion}</td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {Number(item.cantidad).toLocaleString("es-CO")}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {cop(item.precio_unitario)}
                      {Number(item.descuento_pct) > 0 && (
                        <span className="ml-1 text-xs text-red-500">-{item.descuento_pct}%</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">{item.iva_pct}%</td>
                    <td className="px-6 py-3 text-right font-medium">{cop(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totales */}
            <div className="flex justify-end border-t border-gray-100 px-6 py-4">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{cop(factura.subtotal)}</span>
                </div>
                {descTotal > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Descuento</span>
                    <span>-{cop(descTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>IVA</span>
                  <span>{cop(factura.iva_total)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold text-gray-900">
                  <span>{factura.retenciones?.length > 0 ? "Total bruto" : "Total"}</span>
                  <span>{cop(factura.total)}</span>
                </div>
                {factura.retenciones?.map((r) => (
                  <div key={r.id} className="flex justify-between text-red-600">
                    <span>- {r.nombre} ({r.porcentaje}%)</span>
                    <span>- {cop(r.valor)}</span>
                  </div>
                ))}
                {factura.retenciones?.length > 0 && (
                  <div className="flex justify-between border-t border-green-200 pt-1.5 text-base font-bold text-green-700">
                    <span>Neto a pagar</span>
                    <span>{cop(factura.neto_a_pagar)}</span>
                  </div>
                )}
              </div>
            </div>

            {factura.observaciones && (
              <div className="border-t border-gray-100 px-6 py-3">
                <p className="text-xs text-gray-400">Observaciones</p>
                <p className="text-sm text-gray-700">{factura.observaciones}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Link al asiento contable */}
      {factura.asiento_id && (
        <p className="text-sm text-gray-400">
          Asiento contable generado automáticamente. Consúltalo en{" "}
          <Link to="/contabilidad" className="text-green-600 hover:underline">
            Contabilidad → Libro diario
          </Link>
          .
        </p>
      )}

      {/* Dialog nota crédito */}
      <Dialog open={openNC} onClose={() => setOpenNC(false)} title="Crear nota crédito">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Tipo</Label>
              <HelpTooltip text="Anulación cancela la factura ante la DIAN (irreversible). Usa nota crédito parcial para descuentos o devoluciones sin anular." />
            </div>
            <select
              value={ncForm.tipo}
              onChange={(e) => setNcForm((f) => ({ ...f, tipo: e.target.value }))}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="anulacion">Anulación — cancela la factura completa</option>
              <option value="devolucion">Devolución — el cliente devuelve mercancía</option>
              <option value="descuento">Descuento — ajuste de precio posterior</option>
              <option value="ajuste">Ajuste — corrección de error</option>
            </select>
          </div>

          {ncForm.tipo === "anulacion" && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
              Esta acción marcará la factura <strong>{factura?.numero}</strong> como <strong>anulada</strong> y creará el asiento contable de reversión.
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="nc_motivo">Motivo *</Label>
            <Input
              id="nc_motivo"
              required
              value={ncForm.motivo}
              onChange={(e) => setNcForm((f) => ({ ...f, motivo: e.target.value }))}
              placeholder="Describe el motivo de la nota crédito"
            />
          </div>

          {errorReenvio && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorReenvio}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setOpenNC(false)}>Cancelar</Button>
            <Button
              onClick={() => void handleCrearNotaCredito()}
              disabled={creandoNC || !ncForm.motivo.trim()}
            >
              {creandoNC ? "Creando..." : "Crear nota crédito"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
