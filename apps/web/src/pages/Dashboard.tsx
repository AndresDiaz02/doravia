import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, FileText, Users, AlertCircle, Minus, AlertTriangle, CheckCircle2, Circle, ShoppingBag, Package } from "lucide-react";
import { apiFetch, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const VentasTrendChart = lazy(() => import("../components/VentasTrendChart"));

interface Comparativo {
  periodo: { anio: number; mes: number };
  mes: {
    actual: { facturas: number; total: number };
    anterior: { facturas: number; total: number };
    variacion_total: number;
    variacion_facturas: number;
  };
  anio: {
    actual: { facturas: number; total: number };
    anterior: { facturas: number; total: number };
    variacion_total: number;
    variacion_facturas: number;
  };
}

interface TendenciaMes {
  periodo: string;
  anio: number;
  mes: number;
  total: number;
  facturas: number;
}

interface CarteraVencida {
  total: number;
  aging: { d30: number; d60: number; d90: number; dMas: number };
  facturas: { id: string; numero: string; cliente: string; monto: number; diasVencida: number }[];
}

interface VentasMes {
  periodo: { anio: number; mes: number };
  resumen: {
    cantidad_facturas: number;
    subtotal: string | null;
    iva: string | null;
    total: string | null;
  };
  top_clientes: { cliente_id: string; nombre: string; total: string | null; facturas: number }[];
  facturas: {
    id: string;
    numero: string;
    fecha_emision: string;
    estado: string;
    total: string;
    cliente: string;
  }[];
}

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const ESTADO_BADGE: Record<string, "green" | "yellow" | "red" | "gray"> = {
  aceptada: "green",
  borrador: "yellow",
  rechazada: "red",
  anulada: "gray",
  enviada: "gray",
};

interface PrimerosPasos {
  empresa: boolean;
  resolucion: boolean;
  clientes: boolean;
  facturas: boolean;
}

interface PreparacionOperativa {
  items: {
    id: string;
    estado: "listo" | "pendiente" | "informativo";
    titulo: string;
    detalle: string;
    ruta: string;
  }[];
}

interface GastosMes {
  periodo: { anio: number; mes: number };
  cantidad: number;
  total: number;
  pendiente: number;
}

interface ProductosSinStock {
  total: number;
  productos: { id: string; codigo: string; nombre: string; stock_actual: string | null }[];
}

export function Dashboard() {
  const { plan, tenant, user } = useAuth();
  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [data, setData] = useState<VentasMes | null>(null);
  const [comparativo, setComparativo] = useState<Comparativo | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaMes[]>([]);
  const [cartera, setCartera] = useState<CarteraVencida | null>(null);
  const [gastosMes, setGastosMes] = useState<GastosMes | null>(null);
  const [sinStock, setSinStock] = useState<ProductosSinStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [primerosPasos, setPrimerosPasos] = useState<PrimerosPasos | null>(null);
  const [preparacion, setPreparacion] = useState<PreparacionOperativa | null>(null);
  const hasComparativo = (plan?.accounting_level ?? 1) >= 3;
  const hasGastos = (plan?.features as Record<string, boolean> | undefined)?.gastos === true;
  const hasInventario = (plan?.features as Record<string, boolean> | undefined)?.inventario === true;

  useEffect(() => {
    if (user?.role === "admin") {
      void apiFetch<PrimerosPasos>("/api/reportes/primeros-pasos")
        .then((d) => { if (!d.empresa || !d.resolucion || !d.clientes || !d.facturas) setPrimerosPasos(d); })
        .catch(() => {});
      void apiFetch<PreparacionOperativa>("/api/reportes/preparacion-operativa")
        .then(setPreparacion)
        .catch(() => {});
    }
  }, [user?.role]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);

    // La cifra principal llega primero. Los análisis complementarios se cargan
    // después de pintar el panel para que entrar nunca dependa de seis consultas.
    void apiFetch<VentasMes>(`/api/reportes/ventas-mes?anio=${anio}&mes=${mes}`)
      .then((resultado) => { if (!cancelado) setData(resultado); })
      .catch(() => { if (!cancelado) setData(null); })
      .finally(() => { if (!cancelado) setLoading(false); });

    const secundarias = window.setTimeout(() => {
      if (cancelado) return;
      const requests: Promise<void>[] = [
        apiFetch<TendenciaMes[]>("/api/reportes/tendencia-12").then((resultado) => { if (!cancelado) setTendencia(resultado); }).catch(() => {}),
        apiFetch<CarteraVencida>("/api/reportes/cartera-vencida").then((resultado) => { if (!cancelado) setCartera(resultado); }).catch(() => {}),
      ];
      if (hasComparativo) {
        requests.push(
        apiFetch<Comparativo>(`/api/reportes/comparativo?anio=${anio}&mes=${mes}`)
          .then((resultado) => { if (!cancelado) setComparativo(resultado); })
          .catch(() => { if (!cancelado) setComparativo(null); }),
        );
      }
      if (hasGastos) {
        requests.push(
        apiFetch<GastosMes>(`/api/reportes/gastos-mes?anio=${anio}&mes=${mes}`)
          .then((resultado) => { if (!cancelado) setGastosMes(resultado); })
          .catch(() => {}),
        );
      }
      if (hasInventario) {
        requests.push(
        apiFetch<ProductosSinStock>("/api/reportes/productos-sin-stock")
          .then((resultado) => { if (!cancelado) setSinStock(resultado); })
          .catch(() => {}),
        );
      }
      void Promise.all(requests);
    }, 250);

    return () => {
      cancelado = true;
      window.clearTimeout(secundarias);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes]);

  const limiteFacturas = plan?.max_facturas_mes;
  const usadas = data?.resumen.cantidad_facturas ?? 0;
  const porcentajeLimite = limiteFacturas ? (usadas / limiteFacturas) * 100 : null;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{tenant?.nombre}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
          >
            {[ahora.getFullYear() - 1, ahora.getFullYear()].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Aviso vencimiento plan */}
      {tenant?.plan_ends_at && (() => {
        const dias = Math.ceil((new Date(tenant.plan_ends_at).getTime() - Date.now()) / 86_400_000);
        if (dias > 30) return null;
        const vencido = dias <= 0;
        return (
          <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${vencido ? "border-red-300 bg-red-50" : "border-yellow-200 bg-yellow-50"}`}>
            <AlertCircle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${vencido ? "text-red-600" : "text-yellow-600"}`} />
            <p className={`text-sm ${vencido ? "text-red-800" : "text-yellow-800"}`}>
              {vencido
                ? <>Tu plan <strong>venció</strong>. Renueva ahora para seguir facturando.</>
                : <>Tu plan vence en <strong>{dias} día{dias !== 1 ? "s" : ""}</strong>. </>}
              {" "}
              <Link to="/mi-plan" className="font-semibold underline">Ver plan →</Link>
            </p>
          </div>
        );
      })()}

      {/* Widget primeros pasos — solo admin, solo si falta algún paso */}
      {primerosPasos && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900 mb-3">
            Completa la configuración inicial para empezar a facturar
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: "empresa", label: "Datos de tu empresa", link: "/configuracion/empresa" },
              { key: "resolucion", label: "Resolución DIAN", link: "/configuracion/dian" },
              { key: "clientes", label: "Agrega tu primer cliente", link: "/clientes" },
              { key: "facturas", label: "Emite tu primera factura", link: "/facturas/nueva" },
            ].map(({ key, label, link }) => {
              const done = primerosPasos[key as keyof PrimerosPasos];
              return (
                <Link
                  key={key}
                  to={done ? "#" : link}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    done
                      ? "bg-white text-gray-400 cursor-default"
                      : "bg-white text-blue-800 hover:bg-blue-100 font-medium"
                  }`}
                >
                  {done
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    : <Circle className="h-4 w-4 text-blue-400 flex-shrink-0" />}
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {preparacion && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
            <p className="text-sm font-semibold text-slate-900">Preparación operativa</p>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {preparacion.items.map((item) => {
              const listo = item.estado === "listo";
              const pendiente = item.estado === "pendiente";
              return (
                <Link
                  key={item.id}
                  to={item.ruta}
                  className="rounded-lg border border-slate-100 p-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    {listo ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : pendiente ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <Circle className="h-4 w-4 text-slate-400" />}
                    {item.titulo}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.detalle}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Alerta límite de facturas */}
      {limiteFacturas && porcentajeLimite !== null && porcentajeLimite >= 80 && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-800">
            Has usado <strong>{usadas}</strong> de <strong>{limiteFacturas}</strong> facturas este mes
            ({Math.round(porcentajeLimite)}%). Considera actualizar tu plan.
          </p>
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className={`grid grid-cols-1 gap-4 ${hasGastos ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <SummaryCard
          label="Facturas emitidas"
          value={String(usadas)}
          sub={limiteFacturas ? `de ${limiteFacturas} permitidas` : "ilimitadas"}
          icon={<FileText className="h-5 w-5 text-blue-600" />}
          bg="bg-blue-50"
        />
        <SummaryCard
          label="Subtotal ventas"
          value={cop(data?.resumen.subtotal)}
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
          bg="bg-green-50"
        />
        <SummaryCard
          label="Total con IVA"
          value={cop(data?.resumen.total)}
          sub={`IVA: ${cop(data?.resumen.iva)}`}
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
          bg="bg-emerald-50"
        />
        {hasGastos && (
          <SummaryCard
            label="Gastos del mes"
            value={cop(gastosMes?.total ?? 0)}
            sub={gastosMes?.pendiente && gastosMes.pendiente > 0 ? `${cop(gastosMes.pendiente)} pendiente` : `${gastosMes?.cantidad ?? 0} registros`}
            icon={<ShoppingBag className="h-5 w-5 text-orange-600" />}
            bg="bg-orange-50"
          />
        )}
      </div>

      {/* Alerta productos sin stock */}
      {hasInventario && sinStock && sinStock.total > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <Package className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <div className="flex-1 text-sm text-red-800">
            <span className="font-semibold">{sinStock.total} producto{sinStock.total !== 1 ? "s" : ""} sin stock:</span>{" "}
            {sinStock.productos.slice(0, 5).map((p) => p.nombre).join(", ")}
            {sinStock.total > 5 && " y más."}
            {" "}
            <Link to="/inventario" className="font-medium underline">Ver inventario →</Link>
          </div>
        </div>
      )}

      {/* Comparativo — solo Brote+ */}
      {hasComparativo && comparativo && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ComparativoCard
            label="Ventas vs mes anterior"
            variacion={comparativo.mes.variacion_total}
            actual={cop(comparativo.mes.actual.total)}
            anterior={cop(comparativo.mes.anterior.total)}
          />
          <ComparativoCard
            label="Facturas vs mes anterior"
            variacion={comparativo.mes.variacion_facturas}
            actual={String(comparativo.mes.actual.facturas)}
            anterior={String(comparativo.mes.anterior.facturas)}
          />
          <ComparativoCard
            label={`Ventas ${anio} vs ${anio - 1}`}
            variacion={comparativo.anio.variacion_total}
            actual={cop(comparativo.anio.actual.total)}
            anterior={cop(comparativo.anio.anterior.total)}
          />
          <ComparativoCard
            label={`Facturas ${anio} vs ${anio - 1}`}
            variacion={comparativo.anio.variacion_facturas}
            actual={String(comparativo.anio.actual.facturas)}
            anterior={String(comparativo.anio.anterior.facturas)}
          />
        </div>
      )}

      {/* Gráfica tendencia 12 meses */}
      {tendencia.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-400" />
              Tendencia de ventas — últimos 12 meses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-[200px] animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />}>
              <VentasTrendChart data={tendencia} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      {/* Cartera vencida */}
      {cartera && cartera.total > 0 && (
        <Card className="border-orange-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              Cartera vencida
              <span className="ml-auto text-lg font-bold">{cop(cartera.total)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Aging buckets */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "1–30 días", value: cartera.aging.d30, color: "bg-yellow-50 text-yellow-700" },
                { label: "31–60 días", value: cartera.aging.d60, color: "bg-orange-50 text-orange-700" },
                { label: "61–90 días", value: cartera.aging.d90, color: "bg-red-50 text-red-600" },
                { label: "+90 días",   value: cartera.aging.dMas, color: "bg-red-100 text-red-800" },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-xl p-3 text-center ${color}`}>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-sm font-bold mt-1">{cop(value)}</p>
                </div>
              ))}
            </div>
            {/* Top facturas vencidas */}
            <div className="divide-y divide-gray-50">
              {cartera.facturas.slice(0, 5).map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <Link to={`/facturas/${f.id}`} className="font-medium text-orange-700 hover:underline">
                      {f.numero}
                    </Link>
                    <p className="text-xs text-gray-400">{f.cliente} · {f.diasVencida} días</p>
                  </div>
                  <span className="font-semibold text-gray-900">{cop(f.monto)}</span>
                </div>
              ))}
            </div>
            {cartera.facturas.length > 5 && (
              <Link to="/cartera" className="block text-center text-xs text-orange-600 hover:underline">
                Ver todas las {cartera.facturas.length} facturas vencidas →
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top clientes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              Top clientes del mes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="px-6 py-4 text-sm text-gray-400">Cargando...</p>
            ) : data?.top_clientes.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-400">Sin ventas este mes.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {data?.top_clientes.map((c) => (
                    <tr key={c.cliente_id} className="px-6">
                      <td className="px-6 py-3 font-medium text-gray-900">{c.nombre}</td>
                      <td className="px-6 py-3 text-right text-gray-500">{c.facturas} fact.</td>
                      <td className="px-6 py-3 text-right font-medium">{cop(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Últimas facturas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              Últimas facturas
            </CardTitle>
            <Link to="/facturas" className="text-xs text-green-600 hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="px-6 py-4 text-sm text-gray-400">Cargando...</p>
            ) : data?.facturas.length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-400">Sin facturas este mes.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {data?.facturas.slice(0, 8).map((f) => (
                    <tr key={f.id}>
                      <td className="px-6 py-3">
                        <Link
                          to={`/facturas/${f.id}`}
                          className="font-medium text-green-700 hover:underline"
                        >
                          {f.numero}
                        </Link>
                        <p className="text-xs text-gray-400">{f.cliente}</p>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Badge variant={ESTADO_BADGE[f.estado] ?? "gray"}>
                          {f.estado}
                        </Badge>
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

function ComparativoCard({
  label,
  variacion,
  actual,
  anterior,
}: {
  label: string;
  variacion: number;
  actual: string;
  anterior: string;
}) {
  const sube = variacion > 0;
  const igual = variacion === 0;
  return (
    <Card>
      <CardContent className="py-4 px-4">
        <p className="text-xs text-gray-500 mb-2">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{actual}</p>
        <div className={`flex items-center gap-1 text-xs mt-1 ${sube ? "text-green-600" : igual ? "text-gray-400" : "text-red-500"}`}>
          {igual ? <Minus className="w-3 h-3" /> : sube ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{sube ? "+" : ""}{variacion}%</span>
          <span className="text-gray-400 font-normal">vs {anterior}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  bg,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className={`rounded-lg p-2.5 ${bg}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-semibold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
