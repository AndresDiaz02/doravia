import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import PagoBold from "../components/PagoBold";

const PLANES: Record<string, { nombre: string; descripcion: string; color: string; textoColor: string }> = {
  semilla:    { nombre: "Semilla",    descripcion: "Facturación DIAN + ERP completo para empezar",           color: "#A8763E", textoColor: "#fff" },
  raiz:       { nombre: "Raíz",       descripcion: "Todo Semilla + más usuarios y bodegas",                  color: "#5C4530", textoColor: "#fff" },
  brote:      { nombre: "Brote",      descripcion: "Todo Raíz + automatizaciones y reportes avanzados",      color: "#2C3A1E", textoColor: "#fff" },
  cosecha:    { nombre: "Cosecha",    descripcion: "Todo Brote + multiempresa y Business Intelligence",       color: "#1A2347", textoColor: "#fff" },
  punto:      { nombre: "Punto",      descripcion: "POS con tiquete electrónico DIAN para 1 caja",           color: "#1A1F3A", textoColor: "#FFC94A" },
  punto_plus: { nombre: "Punto Plus", descripcion: "POS multi-caja, usuarios ilimitados y 3 bodegas",        color: "#1A1F3A", textoColor: "#FFC94A" },
};

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  const plan = searchParams.get("plan") ?? "semilla";
  const monto = Number(searchParams.get("monto") ?? "730000");
  const planInfo = PLANES[plan] ?? PLANES.semilla;

  const montoFormateado = monto.toLocaleString("es-CO");
  // URL actual para redirect después de login/registro
  const redirectUrl = encodeURIComponent(`/checkout?plan=${plan}&monto=${monto}`);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Cargando...</div>
      </div>
    );
  }

  // Usuario NO logueado: mostrar resumen del plan + opciones para autenticarse
  if (!isLoading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Resumen del plan */}
          <div
            className="mb-6 rounded-2xl p-5"
            style={{ background: planInfo.color, color: planInfo.textoColor }}
          >
            <p className="text-xs uppercase tracking-wide opacity-75 mb-1">Estás comprando</p>
            <h2 className="text-2xl font-bold">Plan {planInfo.nombre}</h2>
            <p className="text-sm opacity-80 mt-1">{planInfo.descripcion}</p>
            <p className="text-3xl font-black mt-3">
              ${montoFormateado}
              <span className="text-sm font-normal opacity-75">/año</span>
            </p>
          </div>

          {/* Opciones de acceso */}
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-black">D</span>
                </div>
                <span className="font-bold text-gray-800 text-sm">Doravia</span>
              </div>
              <h3 className="text-base font-semibold text-gray-900">Inicia sesión para continuar</h3>
              <p className="text-sm text-gray-500 mt-1">
                Necesitas una cuenta para completar el pago
              </p>
            </div>

            <a
              href={`/login?redirect=${redirectUrl}`}
              className="block w-full rounded-xl py-3 px-4 text-center text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              Iniciar sesión
            </a>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs text-gray-400">o</span>
              </div>
            </div>

            <a
              href={`/register?plan=${plan}&redirect=${redirectUrl}`}
              className="block w-full rounded-xl py-3 px-4 text-center text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Crear cuenta nueva
            </a>

            <p className="text-xs text-gray-400 text-center">
              Al crear tu cuenta y pagar activas el plan inmediatamente
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Usuario logueado → mostrar formulario de pago Bold
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
              <span className="text-white text-sm font-black">D</span>
            </div>
            <span className="font-bold text-gray-800">Doravia</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Activa tu plan</h1>
        </div>

        {/* Resumen del plan */}
        <div
          className="rounded-2xl p-5 mb-6"
          style={{ background: planInfo.color, color: planInfo.textoColor }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-75">Plan seleccionado</p>
              <h2 className="text-xl font-bold">{planInfo.nombre}</h2>
              <p className="text-sm opacity-80">{planInfo.descripcion}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black">${montoFormateado}</p>
              <p className="text-xs opacity-75">por año</p>
            </div>
          </div>
        </div>

        {/* Formulario Bold */}
        <PagoBold
          planSlug={plan}
          monto={monto}
          descripcion={`Plan ${planInfo.nombre} Doravia — Anual`}
          onCancelar={() => navigate(-1)}
        />

        <p className="text-xs text-gray-400 text-center mt-4">
          Pago seguro procesado por Bold · Aceptamos tarjeta, PSE, Nequi y Bancolombia
        </p>
      </div>
    </div>
  );
}
