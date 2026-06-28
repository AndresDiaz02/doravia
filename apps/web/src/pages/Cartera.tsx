import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, cop, fecha } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { TrendingUp, AlertTriangle, Clock, Users } from "lucide-react";

interface ResumenCartera {
  total_cartera: number;
  facturas_pendientes: number;
  total_vencida: number;
  facturas_vencidas: number;
  top_deudores: { cliente_id: string; nombre: string; total_pendiente: string; facturas_pendientes: number }[];
}

interface BucketInfo { count: number; total: number }
interface AgingData {
  facturas: FacturaAging[];
  resumen: Record<string, BucketInfo>;
  total_cartera: number;
}

interface FacturaAging {
  id: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  total: string;
  saldo: string;
  dias_vencida: number;
  bucket: string;
  cliente: { id: string; nombre: string; numero_documento: string };
}

interface EstadoCuenta {
  cliente: { id: string; nombre: string; numero_documento: string };
  facturas: {
    id: string; numero: string; fecha_emision: string;
    fecha_vencimiento: string | null; estado: string; total: string; pagada_at: string | null;
  }[];
  resumen: { total_facturado: number; total_pagado: number; saldo_pendiente: number; facturas_pendientes: number };
}

type TabActiva = "resumen" | "aging" | "estado_cuenta";

const BUCKET_LABELS: Record<string, string> = {
  al_dia: "Al día",
  "1_30": "1–30 días",
  "31_60": "31–60 días",
  "61_90": "61–90 días",
  mas_90: "Más de 90 días",
};

const BUCKET_COLOR: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  al_dia: "green",
  "1_30": "yellow",
  "31_60": "yellow",
  "61_90": "red",
  mas_90: "red",
};

export default function Cartera() {
  const [tab, setTab] = useState<TabActiva>("resumen");
  const [resumen, setResumen] = useState<ResumenCartera | null>(null);
  const [aging, setAging] = useState<AgingData | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAging, setLoadingAging] = useState(false);
  const [loadingEC, setLoadingEC] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      apiFetch<ResumenCartera>("/api/cartera/resumen"),
      apiFetch<{ data: { id: string; nombre: string }[] }>("/api/clientes?limit=200"),
    ]).then(([r, cls]) => {
      setResumen(r);
      setClientes(cls.data);
    }).catch(() => setError("No se pudo cargar la cartera."))
      .finally(() => setLoading(false));
  }, []);

  async function cargarAging() {
    setLoadingAging(true);
    try {
      const r = await apiFetch<AgingData>("/api/cartera/aging");
      setAging(r);
    } catch { setError("No se pudo cargar el aging."); }
    finally { setLoadingAging(false); }
  }

  async function cargarEstadoCuenta() {
    if (!clienteId) return;
    setLoadingEC(true);
    try {
      const r = await apiFetch<EstadoCuenta>(`/api/cartera/estado-cuenta/${clienteId}`);
      setEstadoCuenta(r);
    } catch { setError("No se pudo cargar el estado de cuenta."); }
    finally { setLoadingEC(false); }
  }

  useEffect(() => {
    if (tab === "aging" && !aging) cargarAging();
  }, [tab]);

  if (loading) return <p className="p-8 text-gray-500">Cargando cartera…</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Cartera</h1>
        <p className="text-sm text-gray-500 mt-1">Seguimiento de cuentas por cobrar y estado de clientes</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {/* KPI cards */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <p className="text-xs text-gray-500">Total cartera</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{cop(resumen.total_cartera)}</p>
              <p className="text-xs text-gray-400 mt-1">{resumen.facturas_pendientes} factura(s) pendiente(s)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-xs text-gray-500">Cartera vencida</p>
              </div>
              <p className="text-xl font-bold text-red-600">{cop(resumen.total_vencida)}</p>
              <p className="text-xs text-gray-400 mt-1">{resumen.facturas_vencidas} factura(s) vencida(s)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-500" />
                <p className="text-xs text-gray-500">% Cartera vencida</p>
              </div>
              <p className="text-xl font-bold text-amber-600">
                {resumen.total_cartera > 0
                  ? ((resumen.total_vencida / resumen.total_cartera) * 100).toFixed(1)
                  : "0.0"}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-green-500" />
                <p className="text-xs text-gray-500">Top deudor</p>
              </div>
              {resumen.top_deudores[0] ? (
                <>
                  <p className="text-sm font-semibold text-gray-900 truncate">{resumen.top_deudores[0].nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{cop(resumen.top_deudores[0].total_pendiente)}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Sin deudores</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {(["resumen", "aging", "estado_cuenta"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {{ resumen: "Top deudores", aging: "Aging de cartera", estado_cuenta: "Estado de cuenta" }[t]}
          </button>
        ))}
      </div>

      {/* Tab: Resumen / top deudores */}
      {tab === "resumen" && resumen && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {resumen.top_deudores.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p>No hay cuentas por cobrar pendientes.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total pendiente</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Facturas</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumen.top_deudores.map((d) => (
                  <tr key={d.cliente_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{d.nombre}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{cop(d.total_pendiente)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{d.facturas_pendientes}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-xs text-green-600 hover:underline"
                        onClick={() => { setClienteId(d.cliente_id); setTab("estado_cuenta"); void cargarEstadoCuenta(); }}
                      >
                        Ver estado de cuenta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Aging */}
      {tab === "aging" && (
        <div className="space-y-4">
          {loadingAging && <p className="text-sm text-gray-500">Cargando aging…</p>}
          {aging && (
            <>
              {/* Resumen por bucket */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(aging.resumen).map(([bucket, info]) => (
                  <div key={bucket} className="rounded-lg border border-gray-200 bg-white p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">{BUCKET_LABELS[bucket] ?? bucket}</p>
                    <p className="font-semibold text-gray-900 text-sm">{cop(info.total)}</p>
                    <p className="text-xs text-gray-400">{info.count} factura(s)</p>
                  </div>
                ))}
              </div>

              {/* Tabla detalle */}
              {aging.facturas.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 py-12 text-center text-gray-400">No hay cartera pendiente.</div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Factura</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimiento</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Antigüedad</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {aging.facturas.map((f) => (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Link to={`/facturas/${f.id}`} className="font-medium text-green-700 hover:underline">{f.numero}</Link>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{f.cliente.nombre}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{f.fecha_vencimiento ? fecha(f.fecha_vencimiento) : "—"}</td>
                          <td className="px-4 py-3">
                            <Badge variant={BUCKET_COLOR[f.bucket] ?? "gray"}>{BUCKET_LABELS[f.bucket] ?? f.bucket}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{cop(f.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Estado de cuenta */}
      {tab === "estado_cuenta" && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="">Selecciona un cliente</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <button
              onClick={() => void cargarEstadoCuenta()}
              disabled={!clienteId || loadingEC}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-action-hover disabled:opacity-50"
            >
              {loadingEC ? "Cargando…" : "Ver estado"}
            </button>
          </div>

          {estadoCuenta && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total facturado", value: cop(estadoCuenta.resumen.total_facturado), color: "text-gray-900" },
                  { label: "Total pagado", value: cop(estadoCuenta.resumen.total_pagado), color: "text-green-700" },
                  { label: "Saldo pendiente", value: cop(estadoCuenta.resumen.saldo_pendiente), color: estadoCuenta.resumen.saldo_pendiente > 0 ? "text-red-600" : "text-gray-900" },
                  { label: "Fact. pendientes", value: String(estadoCuenta.resumen.facturas_pendientes), color: "text-amber-600" },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                    <p className={`font-semibold text-base ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabla facturas */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Factura</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Emisión</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimiento</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {estadoCuenta.facturas.map((f) => (
                      <tr key={f.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link to={`/facturas/${f.id}`} className="font-medium text-green-700 hover:underline">{f.numero}</Link>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fecha(f.fecha_emision)}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{f.fecha_vencimiento ? fecha(f.fecha_vencimiento) : "—"}</td>
                        <td className="px-4 py-3">
                          {f.pagada_at ? (
                            <Badge variant="green">Pagada</Badge>
                          ) : f.estado === "aceptada" ? (
                            <Badge variant="yellow">Pendiente</Badge>
                          ) : (
                            <Badge variant="gray">{f.estado}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{cop(f.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
