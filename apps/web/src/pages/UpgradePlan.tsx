import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Check, Zap, FileText, BarChart3, X } from "lucide-react";
import PagoBold from "../components/PagoBold";

type Modalidad = "anual" | "mensual" | "3cuotas";

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
  precioAnual: number;
  descripcion: string;
  features: string[];
  destacado?: boolean;
}

const PLANES_ERP: PlanERP[] = [
  {
    slug: "semilla",
    nombre: "Semilla",
    precioAnual: 730_000,
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
    precioAnual: 990_000,
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
    precioAnual: 1_450_000,
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
    precioAnual: 1_990_000,
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

/** Precio a mostrar en la tarjeta según modalidad (orientativo — servidor calcula el real). */
function precioModalidad(anual: number, modalidad: Modalidad): { monto: number; etiqueta: string } {
  if (modalidad === "mensual") {
    return { monto: Math.round(anual / 10), etiqueta: "/ mes" };
  }
  if (modalidad === "3cuotas") {
    const total = Math.round(anual * 1.1);
    const cuota = Math.ceil(total / 3 / 100) * 100;
    return { monto: cuota, etiqueta: "/ cuota (×3)" };
  }
  return { monto: anual, etiqueta: "/ año" };
}

export default function UpgradePlan() {
  const navigate = useNavigate();
  const { plan: planActual } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>("anual");

  const [planBold, setPlanBold] = useState<{ slug: string; nombre: string; precioAnual: number } | null>(null);

  function abrirPagoBold(planSlug: string) {
    if (planSlug === "origen") return;
    const planOrigen = ORIGEN_CAPACIDADES.find((c) => c.slug === planSlug);
    const planERP = PLANES_ERP.find((p) => p.slug === planSlug);
    const precioAnual = planOrigen?.precio ?? planERP?.precioAnual ?? 0;
    const nombre = planERP?.nombre ?? planSlug;
    if (precioAnual === 0) return;
    setPlanBold({ slug: planSlug, nombre, precioAnual });
    setError(null);
  }

  const planSlugActual = (planActual as { slug?: string } | null)?.slug ?? "origen";
  const enOrigen = ORIGEN_SLUGS.includes(planSlugActual);
  const nivelActualERP = ORDEN_ERP.indexOf(planSlugActual);

  const { monto: montoBoldActual, etiqueta } = planBold
    ? precioModalidad(planBold.precioAnual, modalidad)
    : { monto: 0, etiqueta: "" };

  const MODALIDADES: { valor: Modalidad; label: string; nota: string }[] = [
    { valor: "anual",   label: "Anual",      nota: "El mejor precio" },
    { valor: "mensual", label: "Mensual",    nota: "×10 del anual" },
    { valor: "3cuotas", label: "3 cuotas",   nota: "+10% del anual" },
  ];

  return (
    <>
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-12">

        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Elige tu plan</h1>
          <p className="text-gray-500 mt-2">Precios en COP · IVA no incluido.</p>
          {planActual && (
            <p className="mt-1 text-sm text-action font-medium">
              Plan actual: <strong>{planActual.nombre}</strong>
            </p>
          )}
        </div>

        {/* ── Selector de modalidad de pago ───────────────────────────────── */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 gap-1 shadow-sm">
            {MODALIDADES.map(({ valor, label, nota }) => (
              <button
                key={valor}
                onClick={() => setModalidad(valor)}
                className={`flex flex-col items-center px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  modalidad === valor
                    ? "bg-action text-white shadow"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
                <span className={`text-[11px] font-normal mt-0.5 ${modalidad === valor ? "text-white/80" : "text-gray-400"}`}>
                  {nota}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Nota explicativa según modalidad */}
        {modalidad === "mensual" && (
          <p className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-2 px-4 max-w-lg mx-auto">
            Modalidad mensual: pagas cada mes y renuevas en ciclos de 30 días. Equivale a pagar el 10× el precio anual por año.
          </p>
        )}
        {modalidad === "3cuotas" && (
          <p className="text-center text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg py-2 px-4 max-w-lg mx-auto">
            3 cuotas bimestrales con un recargo del 10%. Cuotas 1 y 2 iguales, cuota 3 ajustada al residuo.
          </p>
        )}

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
                            onClick={() => void abrirPagoBold(c.slug)}
                            disabled={!enOrigen}
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Cambiar →
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
              const { monto: montoMostrar, etiqueta: etiquetaMostrar } = precioModalidad(plan.precioAnual, modalidad);

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
                    <span className="text-2xl font-bold text-gray-900">{cop(montoMostrar)}</span>
                    <span className="text-xs text-gray-500 ml-1">{etiquetaMostrar}</span>
                    {modalidad !== "anual" && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Anual: {cop(plan.precioAnual)}
                      </p>
                    )}
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
                      onClick={() => void abrirPagoBold(plan.slug)}
                      variant={esUpgrade ? "primary" : "secondary"}
                    >
                      {esUpgrade ? `Activar ${plan.nombre}` : `Cambiar a ${plan.nombre}`}
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

    {/* ── Modal de pago Bold ───────────────────────────────────────────────── */}
    {planBold && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Pagar plan {planBold.nombre}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {cop(montoBoldActual)} {etiqueta}
                {modalidad === "3cuotas" && (
                  <span className="ml-1 text-gray-400">
                    · Total: {cop(Math.round(planBold.precioAnual * 1.1))}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setPlanBold(null)}
              className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="px-6 py-5">
            <PagoBold
              planSlug={planBold.slug}
              montoReferencia={montoBoldActual}
              modalidad={modalidad}
              descripcion={`Plan ${planBold.nombre} Doravia — ${modalidad === "3cuotas" ? "cuota 1/3" : modalidad}`}
              onCancelar={() => setPlanBold(null)}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
