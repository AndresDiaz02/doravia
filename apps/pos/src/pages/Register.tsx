import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api";

const PLANES = [
  { slug: "punto",      label: "Punto",      precio: "$480.000 / año", desc: "1 caja · 2 usuarios · 1 bodega" },
  { slug: "punto_plus", label: "Punto Plus", precio: "$840.000 / año", desc: "Multi-caja · Usuarios ilimitados · 3 bodegas" },
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
    WidgetCheckout?: { open: (p: Record<string, unknown>) => void };
  }
}

interface Props {
  onRegistered: (token: string) => void;
}

export default function Register({ onRegistered }: Props) {
  const params = new URLSearchParams(window.location.search);
  const planFromUrl = params.get("plan") ?? "";
  const planFijo = PLANES.some((p) => p.slug === planFromUrl) ? planFromUrl : "";

  const [form, setForm] = useState({
    plan_slug: planFijo || "punto",
    tenant_nombre: "",
    nit: "",
    usuario_nombre: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wompiListo, setWompiListo] = useState(false);

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
      const data = await apiFetch<{ accessToken: string; refreshToken: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });

      localStorage.setItem("pos_token", data.accessToken);

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
      } else {
        onRegistered(data.accessToken);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const planSeleccionado = PLANES.find((p) => p.slug === form.plan_slug);

  return (
    <div className="min-h-screen bg-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-5">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-700">Doravia POS</p>
          <p className="text-sm text-gray-500 mt-1">Crea tu cuenta</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {planFijo ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Plan seleccionado</p>
              <p className="text-sm font-semibold text-blue-900 mt-0.5">
                {planSeleccionado?.label} — {planSeleccionado?.precio}
              </p>
              <p className="text-xs text-blue-500 mt-0.5">{planSeleccionado?.desc}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Plan</label>
              {PLANES.map((plan) => (
                <label
                  key={plan.slug}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    form.plan_slug === plan.slug
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan_slug"
                    value={plan.slug}
                    checked={form.plan_slug === plan.slug}
                    onChange={(e) => set("plan_slug", e.target.value)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{plan.label} — {plan.precio}</p>
                    <p className="text-xs text-gray-500">{plan.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="border-t border-gray-100" />

          <div>
            <label className="text-sm font-medium text-gray-700">Nombre de la empresa</label>
            <input
              required value={form.tenant_nombre}
              onChange={(e) => set("tenant_nombre", e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">NIT</label>
            <input
              required placeholder="900123456"
              value={form.nit} onChange={(e) => set("nit", e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border-t border-gray-100" />

          <div>
            <label className="text-sm font-medium text-gray-700">Tu nombre</label>
            <input
              required value={form.usuario_nombre}
              onChange={(e) => set("usuario_nombre", e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Correo electrónico</label>
            <input
              type="email" required value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Contraseña</label>
            <input
              type="password" required minLength={8}
              value={form.password} onChange={(e) => set("password", e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Mínimo 8 caracteres</p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg bg-blue-700 py-3 text-base font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creando cuenta..." : `Crear cuenta y pagar ${planSeleccionado?.label}`}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{" "}
          <button
            onClick={() => window.location.href = "/"}
            className="font-medium text-blue-600 hover:underline"
          >
            Inicia sesión
          </button>
        </p>
      </div>
    </div>
  );
}
