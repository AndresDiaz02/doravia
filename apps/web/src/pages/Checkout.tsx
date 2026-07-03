import { useSearchParams, useNavigate } from "react-router-dom";
import PagoBold from "../components/PagoBold";

const PLANES: Record<string, { nombre: string; descripcion: string; color: string; textoColor: string }> = {
  semilla:    { nombre: "Semilla",    descripcion: "Facturación DIAN + ERP completo para empezar",           color: "#A8763E", textoColor: "#fff" },
  raiz:       { nombre: "Raíz",       descripcion: "Todo Semilla + más usuarios y bodegas",                  color: "#5C4530", textoColor: "#fff" },
  brote:      { nombre: "Brote",      descripcion: "Todo Raíz + automatizaciones y reportes avanzados",      color: "#2C3A1E", textoColor: "#fff" },
  cosecha:    { nombre: "Cosecha",    descripcion: "Todo Brote + multiempresa y Business Intelligence",       color: "#1A2347", textoColor: "#fff" },
  punto:      { nombre: "Punto",      descripcion: "POS con tiquete electrónico DIAN para 1 caja",           color: "#1A1F3A", textoColor: "#FFC94A" },
  punto_plus: { nombre: "Punto Plus", descripcion: "POS multi-caja, usuarios ilimitados y 3 bodegas",        color: "#1A1F3A", textoColor: "#FFC94A" },
  origen_24:  { nombre: "Origen 24",  descripcion: "Facturación electrónica — 24 documentos al año",         color: "#1A4740", textoColor: "#fff" },
  origen_60:  { nombre: "Origen 60",  descripcion: "Facturación electrónica — 60 documentos al año",         color: "#1A4740", textoColor: "#fff" },
  origen_120: { nombre: "Origen 120", descripcion: "Facturación electrónica — 120 documentos al año",        color: "#1A4740", textoColor: "#fff" },
  origen_300: { nombre: "Origen 300", descripcion: "Facturación electrónica — 300 documentos al año",        color: "#1A4740", textoColor: "#fff" },
};

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const plan = searchParams.get("plan") ?? "semilla";
  const monto = Number(searchParams.get("monto") ?? "730000");
  const planInfo = PLANES[plan] ?? PLANES.semilla;
  const montoFormateado = monto.toLocaleString("es-CO");

  function alPagarExitoso(referenceId: string) {
    navigate(`/registro-post-pago?ref=${referenceId}&plan=${plan}&monto=${monto}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <a href="https://doraviasoft.com" className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
              <span className="text-white text-sm font-black">D</span>
            </div>
            <span className="font-bold text-gray-800">Doravia</span>
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Completa tu compra</h1>
          <p className="text-sm text-gray-500 mt-1">
            Paga con tarjeta, PSE, Nequi o Bancolombia — crea tu cuenta después del pago
          </p>
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

        {/* Formulario de pago Bold — sin autenticación */}
        <PagoBold
          planSlug={plan}
          monto={monto}
          descripcion={`Plan ${planInfo.nombre} Doravia — Anual`}
          apiBase="/api/pagos/bold/public"
          onPagoExitoso={alPagarExitoso}
          onCancelar={() => { window.location.href = "https://doraviasoft.com"; }}
        />

        <p className="text-xs text-gray-400 text-center mt-4">
          Pago seguro procesado por Bold · Aceptamos tarjeta, PSE, Nequi y Bancolombia
        </p>
      </div>
    </div>
  );
}
