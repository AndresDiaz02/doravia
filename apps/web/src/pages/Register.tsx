import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const PLANES_INFO: Record<string, { nombre: string; precio: string }> = {
  origen:      { nombre: "Origen",      precio: "Gratis" },
  origen_24:   { nombre: "Origen 24",   precio: "$99.900 / año" },
  origen_60:   { nombre: "Origen 60",   precio: "$169.900 / año" },
  origen_120:  { nombre: "Origen 120",  precio: "$249.900 / año" },
  origen_300:  { nombre: "Origen 300",  precio: "$329.900 / año" },
  semilla:     { nombre: "Semilla",     precio: "$730.000 / año" },
  raiz:        { nombre: "Raíz",        precio: "$990.000 / año" },
  brote:       { nombre: "Brote",       precio: "$1.450.000 / año" },
  cosecha:     { nombre: "Cosecha",     precio: "$1.990.000 / año" },
  punto:       { nombre: "Punto",       precio: "$450.000 / año" },
  punto_plus:  { nombre: "Punto Plus",  precio: "$790.000 / año" },
};

const PLANES_LISTA = [
  { slug: "origen",     label: "Origen — Gratis",             desc: "10 documentos/año · Solo facturación DIAN" },
  { slug: "origen_24",  label: "Origen 24 — $99.900/año",     desc: "24 documentos/año · Solo facturación DIAN" },
  { slug: "origen_60",  label: "Origen 60 — $169.900/año",    desc: "60 documentos/año · Solo facturación DIAN" },
  { slug: "origen_120", label: "Origen 120 — $249.900/año",   desc: "120 documentos/año · Solo facturación DIAN" },
  { slug: "origen_300", label: "Origen 300 — $329.900/año",   desc: "300 documentos/año · Solo facturación DIAN" },
  { slug: "semilla",    label: "Semilla — $730.000/año",       desc: "ERP completo · Inventario · 3 usuarios" },
  { slug: "raiz",       label: "Raíz — $990.000/año",          desc: "Facturación ilimitada · 5 usuarios · 3 bodegas" },
  { slug: "brote",      label: "Brote — $1.450.000/año",       desc: "Recurrentes · CRM · Reportes comparativos" },
  { slug: "cosecha",    label: "Cosecha — $1.990.000/año",     desc: "Plan completo · Centros de costos · Ilimitado" },
];

interface RegisterFreeResponse {
  payment_required: false;
  accessToken: string;
  refreshToken: string;
}

interface RegisterPaidResponse {
  payment_required: true;
  wompi_reference: string;
  checkout: {
    public_key: string;
    currency: string;
    amount_in_cents: number;
    reference: string;
    signature: { integrity: string };
    redirect_url: string;
    plan_slug: string;
    plan_nombre: string;
    plan_precio_cop: number;
  };
}

type RegisterResponse = RegisterFreeResponse | RegisterPaidResponse;

declare global {
  interface Window {
    WidgetCheckout?: { open: (p: Record<string, unknown>) => void };
  }
}

export function Register() {
  const [params] = useSearchParams();
  const planFromUrl = params.get("plan") ?? "";
  const planFijo = planFromUrl in PLANES_INFO ? planFromUrl : "";

  const [form, setForm] = useState({
    plan_slug: planFijo || "semilla",
    tenant_nombre: "",
    nit: "",
    usuario_nombre: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wompiListo, setWompiListo] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (document.getElementById("wompi-script")) { setWompiListo(true); return; }
    const s = document.createElement("script");
    s.id = "wompi-script";
    s.src = "https://checkout.wompi.io/widget.js";
    s.setAttribute("data-render", "false");
    s.onload = () => setWompiListo(true);
    document.body.appendChild(s);
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });

      if (!data.payment_required) {
        // Plan gratuito: cuenta activa, login directo
        await login(data.accessToken, data.refreshToken);
        navigate("/configuracion/dian", { replace: true });
        return;
      }

      // Plan de pago: abrir Wompi (la cuenta AÚN NO existe)
      const { checkout } = data;

      if (wompiListo && window.WidgetCheckout) {
        window.WidgetCheckout.open({
          currency: checkout.currency,
          amountInCents: checkout.amount_in_cents,
          reference: checkout.reference,
          publicKey: checkout.public_key,
          signature: { integrity: checkout.signature.integrity },
          redirectUrl: checkout.redirect_url,
        });
      } else {
        // Sin widget: redirigir manualmente a Wompi (fallback)
        const wompiUrl =
          `https://checkout.wompi.io/p/?public-key=${encodeURIComponent(checkout.public_key)}` +
          `&currency=${checkout.currency}` +
          `&amount-in-cents=${checkout.amount_in_cents}` +
          `&reference=${encodeURIComponent(checkout.reference)}` +
          `&signature:integrity=${encodeURIComponent(checkout.signature.integrity)}` +
          `&redirect-url=${encodeURIComponent(checkout.redirect_url)}`;
        window.location.href = wompiUrl;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const planSeleccionadoEsGratis = form.plan_slug === "origen";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Doravia</h1>
          <p className="mt-1 text-sm text-gray-500">Crea tu cuenta y empieza a facturar</p>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-sm">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

            {planFijo ? (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-4 py-3">
                <p className="text-xs text-action font-medium uppercase tracking-wide">Plan seleccionado</p>
                <p className="text-sm font-semibold text-green-900 dark:text-green-300 mt-0.5">
                  {PLANES_INFO[planFijo].nombre} — {PLANES_INFO[planFijo].precio}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <div className="space-y-2">
                  {PLANES_LISTA.map((plan) => (
                    <label
                      key={plan.slug}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        form.plan_slug === plan.slug
                          ? "border-action bg-action/5"
                          : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="plan_slug"
                        value={plan.slug}
                        checked={form.plan_slug === plan.slug}
                        onChange={(e) => set("plan_slug", e.target.value)}
                        className="mt-0.5 accent-violet-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{plan.label}</p>
                        <p className="text-xs text-gray-500">{plan.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-gray-700 pt-2" />

            <div className="space-y-1.5">
              <Label htmlFor="tenant_nombre">Nombre de la empresa</Label>
              <Input id="tenant_nombre" required value={form.tenant_nombre} onChange={(e) => set("tenant_nombre", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nit">NIT</Label>
              <Input id="nit" required placeholder="900123456" value={form.nit} onChange={(e) => set("nit", e.target.value)} />
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700 pt-2" />

            <div className="space-y-1.5">
              <Label htmlFor="usuario_nombre">Tu nombre</Label>
              <Input id="usuario_nombre" required value={form.usuario_nombre} onChange={(e) => set("usuario_nombre", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} />
              <p className="text-xs text-gray-400">Mínimo 8 caracteres</p>
            </div>

            {!planSeleccionadoEsGratis && (
              <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Tu cuenta se activará una vez confirmemos el pago. Serás redirigido a la pasarela de pago Wompi.
              </p>
            )}

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                checked={aceptaTerminos}
                onChange={(e) => setAceptaTerminos(e.target.checked)}
                className="mt-1 h-4 w-4 cursor-pointer"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                He leído y acepto los{" "}
                <a href="https://doraviasoft.com/terminos" target="_blank" rel="noopener" className="text-action underline">Términos y Condiciones</a>
                , la{" "}
                <a href="https://doraviasoft.com/privacidad" target="_blank" rel="noopener" className="text-action underline">Política de Privacidad</a>
                {" "}y la{" "}
                <a href="https://doraviasoft.com/terminos#reembolsos" target="_blank" rel="noopener" className="text-action underline">Política de Reembolsos</a>
              </span>
            </label>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <Button type="submit" disabled={loading || !aceptaTerminos} className="w-full">
              {loading
                ? "Procesando..."
                : planSeleccionadoEsGratis
                  ? "Crear cuenta gratis"
                  : `Continuar al pago — ${PLANES_INFO[planFijo || form.plan_slug]?.precio ?? ""}`}
            </Button>

            <p className="text-center text-xs text-gray-400">
              ¿Ya tienes cuenta?{" "}
              <a href="/login" className="text-action hover:underline">Inicia sesión</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
