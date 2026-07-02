import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Check, Zap, FileText, BarChart3 } from "lucide-react";

interface CheckoutData {
  public_key: string;
  currency: string;
  amount_in_cents: number;
  reference: string;
  signature: { integrity: string };
  redirect_url: string;
}

declare global {
  interface Window {
    WidgetCheckout?: {
      open: (params: Record<string, unknown>) => void;
    };
  }
}

interface OrigenCapacidad {
  slug: string;
  docs: number | null;
  precio: number;
  etiqueta?: string;
}

const ORIGEN_CAPACIDADES: OrigenCapacidad[] = [
  { slug: "origen",     docs: 10,   precio: 0,       etiqueta: "Gratis" },
  { slug: "origen_24",  docs: 24,   precio: 99_900  },
  { slug: "origen_60",  docs: 60,   precio: 169_900 },
  { slug: "origen_120", docs: 120,  precio: 249_900 },
  { slug: "origen_300", docs: 300,  precio: 329_900 },
];

interface PlanERP {
  slug: string;
  nombre: string;
  precio: number;
  descripcion: string;
  features: string[];
  destacado?: boolean;
}

const PLANES_ERP: PlanERP[] = [
  {
    slug: "semilla",
    nombre: "Semilla",
    precio: 730_000,
    descripcion: "ERP completo para empresas en operación",
    features: [
      "Facturación ilimitada",
      "Inventario y 2 bodegas",
      "Cotizaciones → Factura",
      "Gastos, C×P y cartera",
      "Contabilidad (diario + mayor)",
      "Módulo IA (30 docs/mes)",
      "3 usuarios",
    ],
    destacado: true,
  },
  {
    slug: "raiz",
    nombre: "Raíz",
    precio: 990_000,
    descripcion: "Para negocios con operaciones más complejas",
    features: [
      "Todo Semilla +",
      "3 bodegas · 5 usuarios",
      "Balance general + Estado de resultados",
      "Ensamble de productos",
      "Programación de pagos",
      "IA (100 docs/mes)",
    ],
  },
  {
    slug: "brote",
    nombre: "Brote",
    precio: 1_450_000,
    descripcion: "Facturación recurrente y reportes avanzados",
    features: [
      "Todo Raíz +",
      "5 bodegas · 10 usuarios",
      "Facturación recurrente",
      "Reportes comparativos",
      "CRM — Seguimiento de oportunidades",
      "IA (300 docs/mes)",
    ],
  },
  {
    slug: "cosecha",
    nombre: "Cosecha",
    precio: 1_990_000,
    descripcion: "Sin restricciones — el plan más completo",
    features: [
      "Todo Brote +",
      "Bodegas y usuarios ilimitados",
      "Centros de costos",
      "Multi-sede",
      "Pipeline comercial completo",
      "Flujo de caja proyectado",
      "IA ilimitada",
    ],
  },
];

const ORDEN_ERP = ["semilla", "raiz", "brote", "cosecha"];
const ORIGEN_SLUGS = ["origen", "origen_24", "origen_60", "origen_120", "origen_300"];

export default function UpgradePlan() {
  const navigate = useNavigate();
  const { plan: planActual } = useAuth();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wompiCargado, setWompiCargado] = useState(false);

  useEffect(() => {
    if (document.getElementById("wompi-script")) {
      setWompiCargado(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "wompi-script";
    script.src = "https://checkout.wompi.io/widget.js";
    script.setAttribute("data-render", "false");
    script.onload = () => setWompiCargado(true);
    document.body.appendChild(script);
  }, []);

  async function iniciarPago(planSlug: string) {
    if (planSlug === "origen") return; // gratis, no requiere pago
    setProcesando(planSlug);
    setError(null);
    try {
      const data = await apiFetch<CheckoutData>("/api/pagos/checkout", {
        method: "POST",
        body: JSON.stringify({ plan_slug: planSlug }),
      });

      if (!wompiCargado || !window.WidgetCheckout) {
        throw new Error("El widget de pagos no está disponible. Recarga la página e intenta de nuevo.");
      }

      window.WidgetCheckout.open({
        currency: data.currency,
        amountInCents: data.amount_in_cents,
        reference: data.reference,
        publicKey: data.public_key,
        signature: { integrity: data.signature.integrity },
        redirectUrl: data.redirect_url,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al iniciar el pago.");
    } finally {
      setProcesando(null);
    }
  }

  const planSlugActual = (planActual as { slug?: string } | null)?.slug ?? "origen";
  const enOrigen = ORIGEN_SLUGS.includes(planSlugActual);
  const nivelActualERP = ORDEN_ERP.indexOf(planSlugActual);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-12">

        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Elige tu plan</h1>
          <p className="text-gray-500 mt-2">Precios en COP · facturación anual.</p>
          {planActual && (
            <p className="mt-1 text-sm text-action font-medium">
              Plan actual: <strong>{planActual.nombre}</strong>
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        {/* ── Origen: Facturación Electrónica ─────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-5 w-5 text-gray-600" />
            <h2 className="text-xl font-bold text-gray-900">Origen — Solo facturación electrónica</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Factura ante la DIAN sin funciones ERP. Ideal para independientes o negocios con bajo volumen.
          </p>

          {!enOrigen && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 mb-4">
              Tu plan ERP ya incluye facturación electrónica ilimitada.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-left">
                  <th className="px-4 py-2 rounded-tl-lg font-medium">Capacidad</th>
                  <th className="px-4 py-2 font-medium">Precio anual</th>
                  <th className="px-4 py-2 rounded-tr-lg font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {ORIGEN_CAPACIDADES.map((c, i) => {
                  const esActual = c.slug === planSlugActual;
                  return (
                    <tr
                      key={c.slug}
                      className={`border-b border-gray-100 ${esActual ? "bg-green-50" : "bg-white hover:bg-gray-50"} ${i === ORIGEN_CAPACIDADES.length - 1 ? "border-b-0" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {c.docs} documentos / año
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {c.precio === 0 ? (
                          <span className="text-green-700 font-semibold">Gratis</span>
                        ) : (
                          cop(c.precio)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {esActual ? (
                          <span className="text-xs bg-green-100 text-action font-medium px-3 py-1 rounded-full">
                            Plan actual
                          </span>
                        ) : c.precio === 0 ? null : (
                          <button
                            onClick={() => void iniciarPago(c.slug)}
                            disabled={procesando !== null || !enOrigen}
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {procesando === c.slug ? "Preparando…" : "Cambiar →"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── ERP: Gestión empresarial ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-5 w-5 text-gray-600" />
            <h2 className="text-xl font-bold text-gray-900">ERP — Gestión empresarial completa</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Incluye facturación, inventario, contabilidad, gastos, cotizaciones y más.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANES_ERP.map((plan) => {
              const nivelPlan = ORDEN_ERP.indexOf(plan.slug);
              const esActual = plan.slug === planSlugActual;
              const esUpgrade = nivelPlan > nivelActualERP || enOrigen;

              return (
                <div
                  key={plan.slug}
                  className={`relative rounded-xl border bg-white p-5 flex flex-col gap-4 shadow-sm transition-shadow ${
                    plan.destacado ? "border-green-400 shadow-md ring-1 ring-green-300" : "border-gray-200"
                  } ${esActual ? "opacity-75" : ""}`}
                >
                  {plan.destacado && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-warm text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Más popular
                      </span>
                    </div>
                  )}

                  <div>
                    <h3 className="text-base font-bold text-gray-900">{plan.nombre}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{plan.descripcion}</p>
                  </div>

                  <div>
                    <span className="text-2xl font-bold text-gray-900">{cop(plan.precio)}</span>
                    <span className="text-xs text-gray-500 ml-1">/ año</span>
                  </div>

                  <ul className="flex-1 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-gray-700">
                        <Check className="w-3.5 h-3.5 text-action mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {esActual ? (
                    <div className="rounded-lg border border-action/20 bg-action/5 px-3 py-2 text-center text-xs font-medium text-action">
                      Plan actual
                    </div>
                  ) : (
                    <Button
                      onClick={() => void iniciarPago(plan.slug)}
                      disabled={procesando !== null}
                      variant={esUpgrade ? "primary" : "secondary"}
                    >
                      {procesando === plan.slug
                        ? "Preparando…"
                        : esUpgrade
                        ? `Activar ${plan.nombre}`
                        : `Cambiar a ${plan.nombre}`}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <p className="text-center text-xs text-gray-400">
          Al realizar un pago aceptas nuestros{" "}
          <a href="https://doraviasoft.com/terminos" target="_blank" rel="noopener" className="text-action hover:underline">Términos y Condiciones</a>
          {" "}y la{" "}
          <a href="https://doraviasoft.com/terminos#reembolsos" target="_blank" rel="noopener" className="text-action hover:underline">Política de Reembolsos</a>
          .
        </p>

        <div className="text-center">
          <button
            className="text-sm text-gray-500 hover:text-gray-700 underline"
            onClick={() => navigate(-1)}
          >
            Volver
          </button>
        </div>

      </div>
    </div>
  );
}
