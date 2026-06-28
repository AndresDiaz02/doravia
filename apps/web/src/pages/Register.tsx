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
  raiz:        { nombre: "Raíz",        precio: "$1.150.000 / año" },
  brote:       { nombre: "Brote",       precio: "$1.680.000 / año" },
  cosecha:     { nombre: "Cosecha",     precio: "$2.320.000 / año" },
  punto:       { nombre: "Punto",       precio: "$480.000 / año" },
  punto_plus:  { nombre: "Punto Plus",  precio: "$840.000 / año" },
};

const PLANES_POS = ["punto", "punto_plus"];

const PLANES_LISTA = [
  { slug: "origen",     label: "Origen — Gratis",             desc: "10 documentos/año · Solo facturación DIAN" },
  { slug: "origen_24",  label: "Origen 24 — $99.900/año",     desc: "24 documentos/año · Solo facturación DIAN" },
  { slug: "origen_60",  label: "Origen 60 — $169.900/año",    desc: "60 documentos/año · Solo facturación DIAN" },
  { slug: "origen_120", label: "Origen 120 — $249.900/año",   desc: "120 documentos/año · Solo facturación DIAN" },
  { slug: "origen_300", label: "Origen 300 — $329.900/año",   desc: "300 documentos/año · Solo facturación DIAN" },
  { slug: "semilla",    label: "Semilla — $730.000/año",       desc: "ERP completo · Inventario · 3 usuarios" },
  { slug: "raiz",       label: "Raíz — $1.150.000/año",        desc: "Facturación ilimitada · 5 usuarios · 3 bodegas" },
  { slug: "brote",      label: "Brote — $1.680.000/año",       desc: "Recurrentes · CRM · Reportes comparativos" },
  { slug: "cosecha",    label: "Cosecha — $2.320.000/año",     desc: "Plan completo · Centros de costos · Ilimitado" },
];

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
}

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
  const { login } = useAuth();
  const navigate = useNavigate();

  // Cargar widget de Wompi al montar
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
      await login(data.accessToken, data.refreshToken);

      // Plan de pago: abrir Wompi inmediatamente
      if (form.plan_slug !== "origen") {
        const checkout = await apiFetch<CheckoutData>("/api/pagos/checkout", {
          method: "POST",
          body: JSON.stringify({ plan_slug: form.plan_slug }),
        });

        if (wompiListo && window.WidgetCheckout) {
          window.WidgetCheckout.open({
            currency: checkout.currency,
            amountInCents: checkout.amount_in_cents,
            reference: checkout.reference,
            publicKey: checkout.public_key,
            signature: { integrity: checkout.signature.integrity },
            redirectUrl: checkout.redirect_url,
          });
          return;
        } else {
          const destino = PLANES_POS.includes(form.plan_slug) ? "/pos/cajas" : "/planes";
          navigate(destino, { replace: true });
          return;
        }
      }

      navigate("/configuracion/dian", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Doravia</h1>
          <p className="mt-1 text-sm text-gray-500">Crea tu cuenta y empieza a facturar</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

            {/* Plan — fijo si viene de la URL, seleccionable si no */}
            {planFijo ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-xs text-action font-medium uppercase tracking-wide">Plan seleccionado</p>
                <p className="text-sm font-semibold text-green-900 mt-0.5">
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
                          : "border-gray-200 hover:bg-gray-50"
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
                        <p className="text-sm font-medium text-gray-900">{plan.label}</p>
                        <p className="text-xs text-gray-500">{plan.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-2" />

            <div className="space-y-1.5">
              <Label htmlFor="tenant_nombre">Nombre de la empresa</Label>
              <Input id="tenant_nombre" required value={form.tenant_nombre} onChange={(e) => set("tenant_nombre", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nit">NIT</Label>
              <Input id="nit" required placeholder="900123456" value={form.nit} onChange={(e) => set("nit", e.target.value)} />
            </div>

            <div className="border-t border-gray-100 pt-2" />

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

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creando cuenta..." : planFijo ? `Crear cuenta y pagar ${PLANES_INFO[planFijo].nombre}` : "Crear cuenta"}
            </Button>
          </form>
        </div>

      </div>
    </div>
  );
}
