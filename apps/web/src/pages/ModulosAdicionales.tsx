import { useEffect, useState } from "react";
import { ShoppingCart, Receipt, Warehouse, TrendingUp, ToggleLeft, ToggleRight, Info, Monitor, Check, Zap, Wallet } from "lucide-react";
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
  mensual?: number;
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

const PLANES_FACTURACION: PlanPOS[] = [
  { slug: "origen_24", nombre: "Facturación 24", precio: 99_900, features: ["24 facturas electrónicas al año", "DIAN y CUFE", "Cliente y catálogo básico", "Se conecta a tu ERP o POS"] },
  { slug: "origen_60", nombre: "Facturación 60", precio: 169_900, features: ["60 facturas electrónicas al año", "Documentos electrónicos", "Historial centralizado", "Se conecta a tu ERP o POS"], destacado: true },
  { slug: "origen_120", nombre: "Facturación 120", precio: 249_900, features: ["120 facturas electrónicas al año", "DIAN y CUFE", "Soporte para crecer", "Se conecta a tu ERP o POS"] },
];

const PLANES_NOMINA: PlanPOS[] = [
  { slug: "nomina_semilla", nombre: "Nómina Semilla", precio: 99_000, mensual: 9_500, features: ["Hasta 3 empleados activos", "36 documentos al año", "Empleados y contratos", "Períodos mensuales o quincenales"] },
  { slug: "nomina_raiz", nombre: "Nómina Raíz", precio: 230_000, mensual: 21_500, features: ["Hasta 10 empleados activos", "120 documentos al año", "Cálculos por período", "Estado de emisión"], destacado: true },
  { slug: "nomina_brote", nombre: "Nómina Brote", precio: 470_000, mensual: 44_000, features: ["Hasta 25 empleados activos", "300 documentos al año", "Operación de nómina completa", "Conectada a tu empresa"] },
  { slug: "nomina_plus", nombre: "Nómina Plus", precio: 630_000, mensual: 59_000, features: ["Hasta 50 empleados activos", "Documentos según uso razonable", "Liquidación y emisión", "Acompañamiento prioritario"] },
  { slug: "nomina_pro", nombre: "Nómina Pro", precio: 870_000, mensual: 81_000, features: ["Hasta 100 empleados activos", "Documentos según uso razonable", "Operación avanzada", "Más de 100: hablar con ventas"] },
];

const NOMINA_VENTAS_URL = "https://wa.me/573125587055?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20N%C3%B3mina%20Doravia";

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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-action">Doravia · Productos conectados</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Planes y módulos</h1>
        <p className="text-sm text-gray-500 mt-0.5 dark:text-slate-400">
          Activa productos independientes o amplía tu plan actual ({plan?.nombre}). Todos comparten clientes, documentos y la misma empresa.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</div>
      )}

      {/* ── Punto de venta (POS) ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-800 dark:text-slate-100">Punto de venta (POS)</h2>
          {posActivo && (
            <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full dark:bg-emerald-950 dark:text-emerald-300">
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
                className={`relative rounded-2xl border bg-white p-5 flex flex-col gap-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 ${
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

      {/* Facturación Electrónica independiente */}
      <div className="grid gap-3 rounded-2xl border border-action/15 bg-gradient-to-r from-action/10 via-violet-50 to-blue-50 p-4 text-sm dark:from-action/15 dark:via-violet-950/25 dark:to-blue-950/25 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">Construye la combinacion que necesita tu empresa</p>
          <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">Puedes empezar con Facturacion, POS o Nomina. Al sumar ERP, todo conserva la misma empresa, clientes y documentos.</p>
        </div>
        <span className="w-fit rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-action shadow-sm dark:bg-slate-900/80">Sin duplicar informacion</span>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-gray-800 dark:text-slate-100">Facturación Electrónica</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Contrátala como producto independiente o añádela a tu ERP y POS. Tu empresa conserva una sola base de clientes y documentos.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {PLANES_FACTURACION.map((p) => (
            <div key={p.slug} className={`relative rounded-2xl border bg-white p-5 flex flex-col gap-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 ${p.destacado ? "border-emerald-400 ring-1 ring-emerald-200 dark:border-emerald-500 dark:ring-emerald-900" : "border-gray-200 dark:border-slate-700"}`}>
              {p.destacado && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Recomendado</span></div>}
              <div><p className="font-bold text-gray-900 dark:text-white">{p.nombre}</p><p className="text-xl font-bold text-gray-800 mt-1 dark:text-slate-100">${p.precio.toLocaleString("es-CO")}<span className="text-sm font-normal text-gray-400 ml-1 dark:text-slate-500">/ año</span></p></div>
              <ul className="flex-1 space-y-1.5">{p.features.map((f) => <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300"><Check className="h-3.5 w-3.5 text-green-500 shrink-0" />{f}</li>)}</ul>
              <button onClick={() => void contratarPOS(p.slug)} disabled={pagando !== null} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors">
                {pagando === p.slug ? "Preparando pago…" : `Contratar ${p.nombre}`}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-violet-600" />
          <h2 className="font-semibold text-gray-800 dark:text-slate-100">Nómina electrónica</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Contrátala sola o junto a ERP, POS o Facturación Electrónica. Conservas una sola empresa y los datos se conectan automáticamente. La disponibilidad de emisión se confirma durante la activación.
        </p>
        <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
          <strong>Empleado adicional:</strong> Semilla suma cupos por $5.000/mes; Raíz, Brote, Plus y Pro por $4.000/mes. Solicítalo con ventas sin cambiar de plan ni perder historial.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {PLANES_NOMINA.map((p) => (
            <div key={p.slug} className={`relative rounded-2xl border bg-white p-5 flex flex-col gap-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 ${p.destacado ? "border-violet-400 ring-1 ring-violet-200 dark:border-violet-500 dark:ring-violet-900" : "border-gray-200 dark:border-slate-700"}`}>
              {p.destacado && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Recomendado</span></div>}
              <div>
                <p className="font-bold text-gray-900 dark:text-white">{p.nombre}</p>
                <p className="text-xl font-bold text-gray-800 mt-1 dark:text-slate-100">${p.precio.toLocaleString("es-CO")}<span className="text-sm font-normal text-gray-400 ml-1 dark:text-slate-500">/ año</span></p>
                {p.mensual && <p className="mt-1 text-xs font-medium text-violet-600 dark:text-violet-300">o ${p.mensual.toLocaleString("es-CO")}/mes</p>}
              </div>
              <ul className="flex-1 space-y-1.5">
                {p.features.map((f) => <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300"><Check className="h-3.5 w-3.5 text-green-500 shrink-0" />{f}</li>)}
              </ul>
              <a href={NOMINA_VENTAS_URL} target="_blank" rel="noreferrer" className="w-full rounded-lg bg-violet-600 hover:bg-violet-700 py-2.5 text-center text-sm font-semibold text-white transition-colors">
                Hablar con ventas
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── Add-ons ERP ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800 dark:text-slate-100">Módulos ERP</h2>
        </div>

        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-start gap-2 text-sm text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-200">
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
