import { useState, useEffect, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function RegistroPostPago() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const ref = searchParams.get("ref") ?? "";
  const plan = searchParams.get("plan") ?? "semilla";
  const monto = Number(searchParams.get("monto") ?? "0");

  const [verificando, setVerificando] = useState(true);
  const [pagoValido, setPagoValido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState({
    tenant_nombre: "",
    nit: "",
    usuario_nombre: "",
    email: "",
    password: "",
    confirmar_password: "",
  });

  useEffect(() => {
    if (!ref) {
      setError("Referencia de pago no encontrada.");
      setVerificando(false);
      return;
    }
    void verificarPago();
  }, [ref]);

  async function verificarPago() {
    try {
      const data = await apiFetch<{ estado: string }>(`/api/pagos/bold/public/status/${ref}`);
      if (data.estado === "APPROVED") {
        setPagoValido(true);
      } else {
        setError(`El pago aún no está confirmado (estado: ${data.estado}). Espera unos segundos y recarga la página.`);
      }
    } catch {
      setError("No se pudo verificar el estado del pago. Intenta recargar la página.");
    } finally {
      setVerificando(false);
    }
  }

  function set(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmar_password) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const data = await apiFetch<{ accessToken: string; refreshToken: string }>("/api/auth/register-from-payment", {
        method: "POST",
        body: JSON.stringify({
          bold_reference: ref,
          tenant_nombre: form.tenant_nombre.trim(),
          nit: form.nit.trim(),
          usuario_nombre: form.usuario_nombre.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });

      await login(data.accessToken, data.refreshToken);
      navigate("/configuracion/dian", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la cuenta. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const planNombre = plan.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <a href="https://doraviasoft.com" className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
              <span className="text-white text-sm font-black">D</span>
            </div>
            <span className="font-bold text-gray-800">Doravia</span>
          </a>
        </div>

        {verificando ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Verificando tu pago...</p>
          </div>
        ) : !pagoValido ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
              <span className="text-amber-600 text-xl">⏳</span>
            </div>
            <h2 className="font-semibold text-gray-900">Pago en proceso</h2>
            <p className="text-sm text-gray-500">{error}</p>
            <button
              onClick={() => { setVerificando(true); setError(null); void verificarPago(); }}
              className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white py-3 text-sm font-semibold transition-colors"
            >
              Verificar nuevamente
            </button>
          </div>
        ) : (
          <>
            {/* Confirmación de pago */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm">✓</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">
                  ¡Pago aprobado! Plan {planNombre}
                  {monto > 0 && ` — $${monto.toLocaleString("es-CO")}/año`}
                </p>
                <p className="text-xs text-green-600">Ahora crea tu cuenta para acceder al sistema</p>
              </div>
            </div>

            {/* Formulario de registro */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Crea tu cuenta</h2>
              <p className="text-sm text-gray-500 mb-5">Completa los datos de tu empresa y usuario</p>

              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Nombre de la empresa
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={form.tenant_nombre}
                    onChange={(e) => set("tenant_nombre", e.target.value)}
                    placeholder="Ej: Distribuciones García SAS"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    NIT (sin dígito de verificación)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nit}
                    onChange={(e) => set("nit", e.target.value)}
                    placeholder="Ej: 900123456"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Tu nombre
                    </label>
                    <input
                      type="text"
                      required
                      value={form.usuario_nombre}
                      onChange={(e) => set("usuario_nombre", e.target.value)}
                      placeholder="Ej: Juan García"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="tu@empresa.com"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Confirmar contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={form.confirmar_password}
                      onChange={(e) => set("confirmar_password", e.target.value)}
                      placeholder="Repite la contraseña"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={guardando}
                  className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-3 text-sm font-semibold transition-colors"
                >
                  {guardando ? "Creando tu cuenta..." : "Crear cuenta y entrar →"}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
