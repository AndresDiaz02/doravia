import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Check, Zap } from "lucide-react";

interface CheckoutData {
  public_key: string;
  currency: string;
  amount_in_cents: number;
  reference: string;
  signature: { integrity: string };
  redirect_url: string;
  plan_slug: string;
  plan_nombre: string;
  plan_precio_cop: number;
}

interface PlanItem {
  slug: string;
  nombre: string;
  precio: number;
  descripcion: string;
  features: string[];
  destacado?: boolean;
}

const PLANES: PlanItem[] = [
  {
    slug: "expres",
    nombre: "Exprés",
    precio: 350_000,
    descripcion: "Para negocios que facturan hasta 300 veces al año",
    features: ["300 facturas electrónicas / año", "Cotizaciones", "Gastos y C×P", "1 usuario", "Soporte por email"],
  },
  {
    slug: "semilla",
    nombre: "Semilla",
    precio: 730_000,
    descripcion: "Para empresas con actividad mensual constante",
    features: ["50 facturas electrónicas / mes", "Cotizaciones + convertir a factura", "Gastos y C×P", "Módulo IA (30 docs/mes)", "3 usuarios", "Libro diario y mayor"],
    destacado: true,
  },
  {
    slug: "raiz",
    nombre: "Raíz",
    precio: 1_150_000,
    descripcion: "Facturación ilimitada con inventario y contabilidad completa",
    features: ["Facturas ilimitadas", "Inventario multi-bodega", "Balance general + Estado de resultados", "Módulo IA (100 docs/mes)", "5 usuarios", "Alertas de cobro"],
  },
  {
    slug: "brote",
    nombre: "Brote",
    precio: 1_680_000,
    descripcion: "Para negocios en crecimiento con facturación recurrente",
    features: ["Todo Raíz +", "Facturación recurrente (plantillas)", "Reportes comparativos", "Módulo IA (300 docs/mes)", "10 usuarios"],
  },
  {
    slug: "cosecha",
    nombre: "Cosecha",
    precio: 2_320_000,
    descripcion: "Plan completo sin restricciones",
    features: ["Todo Brote +", "Centros de costos", "Ensamble de productos", "IA ilimitada", "Usuarios ilimitados", "Soporte prioritario"],
  },
];

declare global {
  interface Window {
    WidgetCheckout?: {
      open: (params: Record<string, unknown>) => void;
    };
  }
}

export default function UpgradePlan() {
  const navigate = useNavigate();
  const { plan: planActual } = useAuth();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wompiCargado, setWompiCargado] = useState(false);

  useEffect(() => {
    // Cargar el script de Wompi si no está ya
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

  // Orden para saber cuáles son upgrade vs downgrade
  const ORDER = ["origen", "expres", "semilla", "raiz", "brote", "cosecha"];
  const nivelActual = ORDER.indexOf(planSlugActual);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Elige tu plan</h1>
          <p className="text-gray-500 mt-2">Todos los planes incluyen facturación electrónica DIAN. Precios en COP / año.</p>
          {planActual && (
            <p className="mt-1 text-sm text-green-700 font-medium">
              Plan actual: <strong>{planActual.nombre}</strong>
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PLANES.map((plan) => {
            const nivelPlan = ORDER.indexOf(plan.slug);
            const esActual = plan.slug === planSlugActual;
            const esUpgrade = nivelPlan > nivelActual;

            return (
              <div
                key={plan.slug}
                className={`relative rounded-xl border bg-white p-6 flex flex-col gap-4 shadow-sm transition-shadow ${
                  plan.destacado ? "border-green-400 shadow-md ring-1 ring-green-300" : "border-gray-200"
                } ${esActual ? "opacity-75" : ""}`}
              >
                {plan.destacado && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Más popular
                    </span>
                  </div>
                )}

                <div>
                  <h2 className="text-lg font-bold text-gray-900">{plan.nombre}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{plan.descripcion}</p>
                </div>

                <div>
                  <span className="text-3xl font-bold text-gray-900">{cop(plan.precio)}</span>
                  <span className="text-sm text-gray-500 ml-1">/ año</span>
                </div>

                <ul className="flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {esActual ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-center text-sm font-medium text-green-700">
                    Plan actual
                  </div>
                ) : (
                  <Button
                    onClick={() => void iniciarPago(plan.slug)}
                    disabled={procesando !== null}
                    className={plan.destacado ? "" : ""}
                    variant={esUpgrade ? "primary" : "secondary"}
                  >
                    {procesando === plan.slug
                      ? "Preparando pago…"
                      : esUpgrade
                      ? `Activar ${plan.nombre}`
                      : `Cambiar a ${plan.nombre}`}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
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
