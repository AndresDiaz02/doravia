import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, ExternalLink, CheckCircle, Download, FileX, FileText, Mail, MessageCircle, CreditCard } from "lucide-react";
import PagoBold from "../components/PagoBold";
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
  // Plemsi / DIAN
  plemsi_id: string | null;
  estado_dian: "pendiente" | "emitida" | "error" | "no_aplica" | null;
  error_dian: string | null;
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
  const [openND, setOpenND] = useState(false);
  type NdItem = { descripcion: string; cantidad: number; precio_unitario: number; iva_pct: number };
  const ndItemVacio = (): NdItem => ({ descripcion: "", cantidad: 1, precio_unitario: 0, iva_pct: 19 });
  const [ndForm, setNdForm] = useState({ tipo: "gastos", motivo: "", items: [ndItemVacio()] as NdItem[] });
  const [creandoND, setCreandoND] = useState(false);
  const [reenviandoDian, setReenviandoDian] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailOk, setEmailOk] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [openPagoBold, setOpenPagoBold] = useState(false);

  useEffect(() => {
    void apiFetch<Factura>(`/api/facturas/${id!}`)
      .then(setFactura)
      .catch(() => navigate("/facturas", { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  async function handleWhatsApp() {
    if (!factura) return;
    setWhatsappLoading(true);
    try {
      const resp = await apiFetch<{ link: string }>(`/api/facturas/${factura.id}/whatsapp-link`, { method: "POST" });
      window.open(resp.link, "_blank", "noopener,noreferrer");
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : "No se pudo generar el link de WhatsApp.");
    } finally {
      setWhatsappLoading(false);
    }
  }

  async function handleEnviarEmail() {
    if (!factura) return;
    setEnviandoEmail(true);
    setErrorReenvio(null);
    setEmailOk(false);
    try {
      await apiFetch(`/api/facturas/${factura.id}/enviar-email`, { method: "POST" });
      setEmailOk(true);
      setTimeout(() => setEmailOk(false), 4000);
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : "Error al enviar el correo.");
    } finally {
      setEnviandoEmail(false);
    }
  }

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

  async function handleDescargarDoc(endpoint: string, filename: string) {
    setDescargando(true);
    try {
      const token = localStorage.getItem("access_token");
      const resp = await fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("No se pudo generar el documento.");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorReenvio(err instanceof Error ? err.message : "Error al descargar el documento.");
    } finally {
      setDescargando(false);
    }
  }

  const handleDescargarPdf = () => factura && void handleDescargarDoc(
    `/api/documentos/facturas/${factura.id}/pdf`, `${factura.numero}.pdf`,
  );

  const handleDescargarRecibo = () => factura && void handleDescargarDoc(
    `/api/documentos/facturas/${factura.id}/recibo`, `RC-${factura.numero}.pdf`,
  );

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

  async function handleCrearNotaDebito() {
    if (!factura) return;
    setCreandoND(true);
    setErrorReenvio(null);
    try {
      await apiFetch(`/api/notas-debito/factura/${factura.id}`, {
        method: "POST",
        body: JSON.stringify({ tipo: ndForm.tipo, motivo: ndForm.motivo, items: ndForm.items }),
      });

      setOpenND(false);
      setNdForm({ tipo: "gastos", motivo: "", items: [ndItemVacio()] });
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : "Error al crear nota débito.");
    } finally {
      setCreandoND(false);
    }
  }

  function ndSetItem(idx: number, field: keyof NdItem, value: string | number) {
    setNdForm((f) => ({
      ...f,
      items: f.items.map((it, i) => i === idx ? { ...it, [field]: value } : it),
    }));
  }

  function ndAddItem() {
    setNdForm((f) => ({ ...f, items: [...f.items, ndItemVacio()] }));
  }

  function ndRemoveItem(idx: number) {
    setNdForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  const ndTotal = ndForm.items.reduce((s, it) => {
    const sub = Number(it.cantidad) * Number(it.precio_unitario);
    return s + sub + sub * Number(it.iva_pct) / 100;
  }, 0);

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

  async function handleReenviarDian() {
    if (!factura) return;
    setReenviandoDian(true);
    setErrorReenvio(null);
    try {
      const r = await apiFetch<{ ok: boolean; cufe?: string; error?: string }>(
        `/api/facturas/${factura.id}/reenviar-dian`,
        { method: "POST" },
      );
      if (r.ok) {
        setFactura((prev) => prev ? { ...prev, estado_dian: "emitida", cufe: r.cufe ?? prev.cufe, error_dian: null } : prev);
      } else {
        setErrorReenvio(r.error ?? "Error al reenviar a la DIAN.");
        setFactura((prev) => prev ? { ...prev, estado_dian: "error", error_dian: r.error ?? null } : prev);
      }
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setReenviandoDian(false);
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
              {factura.estado_dian === "emitida" && (
                <Badge variant="green">Enviada a la DIAN</Badge>
              )}
              {factura.estado_dian === "error" && (
                <Badge variant="red">Error DIAN</Badge>
              )}
              {factura.estado_dian === "pendiente" && (
                <Badge variant="yellow">Pendiente DIAN</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Emitida el {fecha(factura.fecha_emision)}
              {factura.fecha_vencimiento && ` · Vence el ${fecha(factura.fecha_vencimiento)}`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleDescargarPdf} disabled={descargando}>
            <Download className="h-4 w-4" />
            {descargando ? "Generando…" : "Descargar PDF"}
          </Button>
          {factura.cliente.correo && (
            <Button
              variant="secondary"
              onClick={() => void handleEnviarEmail()}
              disabled={enviandoEmail}
            >
              <Mail className="h-4 w-4" />
              {enviandoEmail ? "Enviando…" : emailOk ? "¡Enviado!" : "Enviar por correo"}
            </Button>
          )}
          {factura.cliente.telefono && factura.estado === "aceptada" && (
            <Button
              variant="secondary"
              onClick={() => void handleWhatsApp()}
              disabled={whatsappLoading}
            >
              <MessageCircle className="h-4 w-4" />
              {whatsappLoading ? "Generando…" : "Enviar por WhatsApp"}
            </Button>
          )}
          {factura.pagada_at && (
            <Button variant="secondary" onClick={handleDescargarRecibo} disabled={descargando}>
              <Download className="h-4 w-4" />
              Recibo de caja
            </Button>
          )}
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
          {!isContador && factura.estado === "aceptada" && (
            <Button variant="secondary" onClick={() => setOpenND(true)}>
              <FileText className="h-4 w-4" />
              Nota débito
            </Button>
          )}
          {!isContador && factura.estado === "borrador" && (
            <Button onClick={() => void handleReenviar()} disabled={reenviando}>
              <RefreshCw className={`h-4 w-4 ${reenviando ? "animate-spin" : ""}`} />
              {reenviando ? "Enviando..." : "Reenviar a DIAN"}
            </Button>
          )}
          {!isContador && (factura.estado_dian === "error" || factura.estado_dian === "pendiente") && (
            <Button variant="secondary" onClick={() => void handleReenviarDian()} disabled={reenviandoDian}>
              <RefreshCw className={`h-4 w-4 ${reenviandoDian ? "animate-spin" : ""}`} />
              {reenviandoDian ? "Enviando..." : "Reenviar a DIAN (Plemsi)"}
            </Button>
          )}
          {!isContador && factura.estado === "aceptada" && !factura.pagada_at && (
            <Button variant="secondary" onClick={() => setOpenPagoBold(true)}>
              <CreditCard className="h-4 w-4" />
              Cobrar en línea
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

      {/* Estado Plemsi / DIAN */}
      {factura.estado_dian === "emitida" && factura.cufe && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm">
          <p className="font-medium text-green-800">Enviada a la DIAN via Plemsi</p>
          <p
            className="mt-0.5 font-mono text-xs text-green-700 break-all cursor-pointer hover:text-green-900"
            title="Clic para copiar"
            onClick={() => void navigator.clipboard.writeText(factura.cufe ?? "")}
          >
            CUFE: {factura.cufe}
          </p>
        </div>
      )}
      {factura.estado_dian === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">Error al enviar a la DIAN (Plemsi)</p>
          {factura.error_dian && <p className="mt-0.5 text-xs">{factura.error_dian}</p>}
        </div>
      )}
      {factura.estado_dian === "pendiente" && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <p className="font-medium">Pendiente de envio a la DIAN</p>
          <p className="text-xs mt-0.5">La factura aun no ha sido enviada a Plemsi. Usa el boton "Reenviar a DIAN" para intentarlo.</p>
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

      {/* Dialog nota débito */}
      <Dialog open={openND} onClose={() => setOpenND(false)} title="Crear nota débito">
        <div className="space-y-4 w-full" style={{ minWidth: "min(640px, 90vw)" }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>Tipo</Label>
                <HelpTooltip text="La nota débito aumenta el valor de la factura. Úsala para intereses de mora, gastos adicionales o ajustes de precio hacia arriba." />
              </div>
              <select
                value={ndForm.tipo}
                onChange={(e) => setNdForm((f) => ({ ...f, tipo: e.target.value }))}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="interes">Intereses (mora, financieros)</option>
                <option value="gastos">Gastos adicionales</option>
                <option value="ajuste">Ajuste de valor</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nd_motivo">Motivo *</Label>
              <Input
                id="nd_motivo"
                required
                value={ndForm.motivo}
                onChange={(e) => setNdForm((f) => ({ ...f, motivo: e.target.value }))}
                placeholder="Ej: Intereses de mora enero"
              />
            </div>
          </div>

          {/* Tabla de ítems */}
          <div className="space-y-2">
            <Label>Ítems de la nota débito</Label>
            <div className="rounded-md border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500 w-28">Precio unit.</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">IVA %</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ndForm.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1.5">
                        <input
                          value={item.descripcion}
                          onChange={(e) => ndSetItem(idx, "descripcion", e.target.value)}
                          placeholder="Descripción del cargo"
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={item.cantidad}
                          onChange={(e) => ndSetItem(idx, "cantidad", Number(e.target.value))}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.precio_unitario}
                          onChange={(e) => ndSetItem(idx, "precio_unitario", Number(e.target.value))}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={item.iva_pct}
                          onChange={(e) => ndSetItem(idx, "iva_pct", Number(e.target.value))}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={19}>19%</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {ndForm.items.length > 1 && (
                          <button
                            onClick={() => ndRemoveItem(idx)}
                            className="text-gray-300 hover:text-red-500"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={ndAddItem}
              className="text-xs text-green-600 hover:underline"
            >
              + Agregar ítem
            </button>
          </div>

          {/* Total */}
          <div className="flex justify-end text-sm font-semibold text-orange-600">
            Total nota débito: +${ndTotal.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
          </div>

          {errorReenvio && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorReenvio}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setOpenND(false)}>Cancelar</Button>
            <Button
              onClick={() => void handleCrearNotaDebito()}
              disabled={creandoND || !ndForm.motivo.trim() || ndForm.items.some((i) => !i.descripcion.trim() || i.precio_unitario <= 0)}
            >
              {creandoND ? "Creando..." : "Crear nota débito"}
            </Button>
          </div>
        </div>
      </Dialog>

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

      {/* Dialog pago Bold */}
      <Dialog open={openPagoBold} onClose={() => setOpenPagoBold(false)} title="Cobrar factura en línea">
        {factura && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Genera el botón de pago Bold para la factura <span className="font-semibold">{factura.numero}</span>.
              El cliente podrá pagar con tarjeta de crédito, débito o PSE.
            </p>
            <PagoBold
              planSlug={`factura-${factura.numero}`}
              monto={Math.round(Number(factura.neto_a_pagar ?? factura.total))}
              descripcion={`Pago factura ${factura.numero}`}
              apiBase={`/api/facturas/${factura.id}/bold`}
              onCancelar={() => setOpenPagoBold(false)}
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
