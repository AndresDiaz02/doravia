import { useEffect, useState } from "react";
import { ShoppingCart, Receipt, Warehouse, TrendingUp, ToggleLeft, ToggleRight, Info, Monitor, Check, Zap } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

interface AddonInfo {
  feature: string;
  label: string;
  descripcion: string;
  icon: React.ElementType;
  requiereDesde?: string;
}

const ADDONS_ERP: AddonInfo[] = [
  {
    feature: "cotizaciones",
    label: "Cotizaciones",
    descripcion: "Crea y envía cotizaciones a clientes. Conviértelas en facturas con un clic.",
    icon: ShoppingCart,
  },
  {
    feature: "gastos",
    label: "Gastos y proveedores",
    descripcion: "Registra gastos, cuentas por pagar y proveedores con asientos contables automáticos.",
    icon: Receipt,
  },
  {
    feature: "inventario",
    label: "Inventario y bodegas",
    descripcion: "Control de stock, entradas y salidas por bodega. Se descuenta automáticamente al facturar.",
    icon: Warehouse,
  },
  {
    feature: "cartera_avanzada",
    label: "Cartera avanzada",
    descripcion: "Análisis de aging, top deudores y estado de cuenta por cliente.",
    icon: TrendingUp,
  },
];

interface PlanPOS {
  slug: string;
  nombre: string;
  precio: number;
  features: string[];
  destacado?: boolean;
}

const PLANES_POS: PlanPOS[] = [
  {
    slug: "punto",
    nombre: "Punto",
    precio: 450_000,
    features: ["1 caja", "2 usuarios", "1 bodega", "Ventas, fiados e historial", "Reportes del día"],
  },
  {
    slug: "punto_plus",
    nombre: "Punto Plus",
    precio: 790_000,
    features: ["Multi-caja simultáneas", "Usuarios ilimitados", "3 bodegas", "Cuentas por pagar", "Libro diario y mayor"],
    destacado: true,
  },
];

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
    WidgetCheckout?: { open: (params: Record<string, unknown>) => void };
  }
}

export default function ModulosAdicionales() {
  const { plan } = useAuth();
  const [addons, setAddons] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<string | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wompiListo, setWompiListo] = useState(false);

  useEffect(() => {
    apiFetch<{ addons: Record<string, boolean> }>("/api/empresa/addons")
      .then((d) => setAddons(d.addons ?? {}));

    if (document.getElementById("wompi-script")) {
      setWompiListo(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "wompi-script";
    script.src = "https://checkout.wompi.io/widget.js";
    script.setAttribute("data-render", "false");
    script.onload = () => setWompiListo(true);
    document.body.appendChild(script);
  }, []);

  const planFeatures = (plan?.features ?? {}) as Record<string, boolean>;
  const posActivo = planFeatures["pos"] === true || addons["pos"] === true;
  const posProActivo = planFeatures["pos_multi_caja"] === true || addons["pos_multi_caja"] === true;

  async function toggle(feature: string, currentlyActive: boolean) {
    setToggling(feature);
    setError(null);
    try {
      const result = await apiFetch<{ addons: Record<string, boolean> }>("/api/empresa/addons", {
        method: "PATCH",
        body: JSON.stringify({ feature, enabled: !currentlyActive }),
      });
      setAddons(result.addons ?? {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al actualizar el módulo.");
    } finally {
      setToggling(null);
    }
  }

  async function contratarPOS(planSlug: string) {
    setPagando(planSlug);
    setError(null);
    try {
      const data = await apiFetch<CheckoutData>("/api/pagos/checkout", {
        method: "POST",
        body: JSON.stringify({ plan_slug: planSlug }),
      });

      if (!wompiListo || !window.WidgetCheckout) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar el pago.");
    } finally {
      setPagando(null);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Módulos adicionales</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Amplía tu plan actual ({plan?.nombre}) con módulos extra.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Punto de venta (POS) ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-800">Punto de venta (POS)</h2>
          {posActivo && (
            <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
              {posProActivo ? "Punto Plus activo" : "Punto activo"}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          App de caja separada para cajeros: ventas rápidas, turnos, fiados, historial y reportes del día. Se activa con pago anual.
        </p>

        {posActivo ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
            <p className="font-semibold">POS activo en tu cuenta</p>
            <p className="mt-0.5 text-green-700">
              Accede desde <strong>pos.doraviasoft.com</strong> con las mismas credenciales.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLANES_POS.map((p) => (
              <div
                key={p.slug}
                className={`relative rounded-xl border bg-white p-5 flex flex-col gap-4 shadow-sm ${
                  p.destacado ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"
                }`}
              >
                {p.destacado && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Recomendado
                    </span>
                  </div>
                )}

                <div>
                  <p className="font-bold text-gray-900">{p.nombre}</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">
                    ${p.precio.toLocaleString("es-CO")}
                    <span className="text-sm font-normal text-gray-400 ml-1">/ año</span>
                  </p>
                </div>

                <ul className="flex-1 space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => void contratarPOS(p.slug)}
                  disabled={pagando !== null}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  {pagando === p.slug ? "Preparando pago…" : `Contratar ${p.nombre}`}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Add-ons ERP ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Módulos ERP</h2>
        </div>

        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-start gap-2 text-sm text-blue-700">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>Los módulos que ya incluye tu plan están disponibles sin costo adicional. Los que no incluye pueden activarse según el plan.</p>
        </div>

        <div className="space-y-2">
          {ADDONS_ERP.map(({ feature, label, descripcion, icon: Icon, requiereDesde }) => {
            const enPlan = planFeatures[feature] === true;
            const enAddon = addons[feature] === true;
            const activo = enPlan || enAddon;
            const requisitoFalta = requiereDesde && !planFeatures[requiereDesde] && !addons[requiereDesde];

            return (
              <div
                key={feature}
                className={`rounded-xl border bg-white p-4 flex items-start gap-4 ${
                  requisitoFalta ? "opacity-50" : ""
                }`}
              >
                <div className={`rounded-lg p-2.5 flex-shrink-0 ${activo ? "bg-blue-50" : "bg-gray-100"}`}>
                  <Icon className={`h-5 w-5 ${activo ? "text-blue-600" : "text-gray-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{label}</p>
                    {enPlan && (
                      <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                        Incluido en plan
                      </span>
                    )}
                    {enAddon && !enPlan && (
                      <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                        Add-on activo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{descripcion}</p>
                </div>
                <button
                  disabled={enPlan || toggling === feature || !!requisitoFalta}
                  onClick={() => void toggle(feature, enAddon)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 disabled:cursor-default disabled:opacity-50 mt-0.5"
                  title={enPlan ? "Incluido en tu plan" : activo ? "Desactivar" : "Activar"}
                >
                  {activo
                    ? <ToggleRight className="h-7 w-7 text-blue-500" />
                    : <ToggleLeft className="h-7 w-7" />
                  }
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
