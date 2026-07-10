import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Calendar, Zap, RefreshCw, CreditCard } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

type Modalidad = "anual" | "mensual" | "3cuotas";

interface MiPlanData {
  plan: {
    slug: string;
    nombre: string;
    product: "erp" | "pos" | "origen";
    precio_anual_cop: number;
    features: Record<string, boolean>;
    max_usuarios: number | null;
    max_facturas_ano: number | null;
  };
  suscripcion: {
    starts_at: string | null;
    ends_at: string;
    dias_restantes: number;
    en_trial: boolean;
    activo: boolean;
    subscription_status: string;
    ultimo_pago_confirmado_at: string | null;
    modalidad: Modalidad;
    cuota_actual: number | null;
    total_cuotas: number | null;
    proxima_cuota_monto: number | null;
  };
  uso: {
    facturas_usadas_ano: number;
    max_facturas_ano: number | null;
  };
}

const FEATURE_LABELS: Record<string, string> = {
  inventario:             "Inventario y bodegas",
  facturacion_recurrente: "Facturación recurrente",
  cotizaciones:           "Cotizaciones",
  gastos:                 "Gastos y compras",
  ia_asistente:           "Asistente IA",
  centros_costos:         "Centros de costos",
  cartera_avanzada:       "Cartera avanzada",
  ensamble:               "Ensamble (BOM)",
  pos:                    "Punto de venta (POS)",
  reportes_comparativos:  "Reportes comparativos",
};

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

export default function MiPlan() {
  const [data, setData] = useState<MiPlanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<MiPlanData>("/api/mi-plan")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-action border-t-transparent" />
      </div>
    );
  }

  if (!data) return null;

  const { plan, suscripcion, uso } = data;
  const porcentajeUso = uso.max_facturas_ano
    ? Math.min(100, (uso.facturas_usadas_ano / uso.max_facturas_ano) * 100)
    : null;
  const esProductoERP = plan.product === "erp";

  return (
    <div className="flex-1 space-y-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Mi plan</h1>
        <p className="text-sm text-gray-500">Estado de tu suscripción y uso actual</p>
      </div>

      {/* Estado del plan */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Plan actual</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{plan.nombre}</p>
            {plan.precio_anual_cop > 0 && (
              <p className="text-sm text-gray-500">{cop(plan.precio_anual_cop)} / año</p>
            )}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            suscripcion.activo && suscripcion.dias_restantes > 0
              ? suscripcion.en_trial
                ? "bg-amber-100 text-amber-700"
                : "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}>
            {suscripcion.activo && suscripcion.dias_restantes > 0
              ? suscripcion.en_trial ? "En prueba gratuita" : "Activo"
              : "Vencido"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {suscripcion.starts_at && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>Inicio: <strong>{fmtDate(suscripcion.starts_at)}</strong></span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span>
              {suscripcion.en_trial ? "Prueba vence: " : "Vence: "}
              <strong>{fmtDate(suscripcion.ends_at)}</strong>
            </span>
          </div>
          {suscripcion.ultimo_pago_confirmado_at && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <RefreshCw className="h-4 w-4 text-gray-400" />
              <span>Último pago: <strong>{fmtDate(suscripcion.ultimo_pago_confirmado_at)}</strong></span>
            </div>
          )}
          {!suscripcion.en_trial && suscripcion.modalidad && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CreditCard className="h-4 w-4 text-gray-400" />
              <span>
                Modalidad:{" "}
                <strong>
                  {suscripcion.modalidad === "anual"
                    ? "Anual"
                    : suscripcion.modalidad === "mensual"
                    ? "Mensual"
                    : `3 cuotas${suscripcion.cuota_actual != null ? ` (cuota ${suscripcion.cuota_actual}/${suscripcion.total_cuotas})` : ""}`}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Próxima cuota */}
        {suscripcion.proxima_cuota_monto != null && !suscripcion.en_trial && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            <CreditCard className="h-4 w-4 flex-shrink-0" />
            Próximo cobro: <strong className="ml-1">{cop(suscripcion.proxima_cuota_monto)}</strong>
            {suscripcion.modalidad === "3cuotas" && suscripcion.cuota_actual != null && (
              <span className="text-blue-500 ml-1">· cuota {suscripcion.cuota_actual + 1}/{suscripcion.total_cuotas}</span>
            )}
          </div>
        )}

        {/* Días restantes */}
        {suscripcion.dias_restantes > 0 && suscripcion.dias_restantes <= 30 && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            suscripcion.dias_restantes <= 5
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-amber-50 border border-amber-200 text-amber-700"
          }`}>
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {suscripcion.dias_restantes === 1
              ? "Vence hoy. Activa tu plan para seguir usando Doravia."
              : `Vence en ${suscripcion.dias_restantes} días.${suscripcion.en_trial ? " Activa tu plan para no perder el acceso." : " Renueva para continuar sin interrupciones."}`}
          </div>
        )}

        {/* Botón upgrade */}
        {(suscripcion.en_trial || suscripcion.dias_restantes <= 30) && (
          <Link to="/planes">
            <Button className="w-full">
              <Zap className="h-4 w-4" />
              {suscripcion.en_trial ? "Activar plan ahora" : "Renovar suscripción"}
            </Button>
          </Link>
        )}
      </Card>

      {/* Uso de documentos */}
      {uso.max_facturas_ano !== null && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Uso de documentos (año actual)</h2>
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{uso.facturas_usadas_ano} facturas emitidas</span>
            <span>de {uso.max_facturas_ano}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                porcentajeUso! >= 90 ? "bg-red-500" : porcentajeUso! >= 70 ? "bg-amber-500" : "bg-action"
              }`}
              style={{ width: `${porcentajeUso}%` }}
            />
          </div>
          {porcentajeUso! >= 80 && (
            <p className="text-xs text-amber-600">
              Llevas el {Math.round(porcentajeUso!)}% del límite anual.{" "}
              {esProductoERP
                ? "Considera actualizar tu plan."
                : "Considera actualizar a un plan con documentos ilimitados."}
            </p>
          )}
        </Card>
      )}

      {/* Módulos incluidos */}
      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Módulos de tu plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => {
            const activo = plan.features[key] === true;
            return (
              <div key={key} className={`flex items-center gap-2 text-sm ${activo ? "text-gray-700" : "text-gray-300"}`}>
                <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${activo ? "text-green-500" : "text-gray-200"}`} />
                {label}
              </div>
            );
          })}
        </div>
        <div className="pt-2">
          <Link to="/planes" className="text-sm text-action hover:underline">
            Ver todos los planes →
          </Link>
        </div>
      </Card>
    </div>
  );
}
