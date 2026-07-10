import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";

interface IntentResponse {
  reference_id: string;
  firma: string;
  api_key: string;
}

type Modalidad = "anual" | "mensual" | "3cuotas";

interface PagoBoldProps {
  planSlug: string;
  /** Monto sugerido por el frontend (solo para visualización inicial). El monto real
   *  lo calcula el servidor según la modalidad seleccionada. */
  montoReferencia?: number;
  descripcion?: string;
  modalidad?: Modalidad;
  onCancelar?: () => void;
  /** Ruta base del API. Por defecto "/api/pagos/bold" (requiere auth).
   *  Usar "/api/pagos/bold/public" para clientes nuevos sin cuenta. */
  apiBase?: string;
}

export default function PagoBold({
  planSlug,
  montoReferencia,
  descripcion,
  modalidad = "anual",
  onCancelar,
  apiBase = "/api/pagos/bold",
}: PagoBoldProps) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const isPublic = apiBase.includes("/public");

  useEffect(() => {
    void crearIntent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crearIntent() {
    setCargando(true);
    setError(null);
    try {
      // El servidor calcula el monto real según la modalidad; montoReferencia es solo orientativo
      const data = await apiFetch<IntentResponse>(`${apiBase}/intent`, {
        method: "POST",
        body: JSON.stringify({ plan_id: planSlug, modalidad, descripcion }),
      });
      setIntent(data);
    } catch {
      setError("No se pudo iniciar el pago. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  // Inyectar el botón Bold cuando tengamos la referencia y firma
  useEffect(() => {
    if (!intent || !contenedorRef.current) return;

    contenedorRef.current.innerHTML = "";

    const montoReal = (intent as IntentResponse & { monto?: number }).monto ?? montoReferencia ?? 0;
    const origin = window.location.origin;
    const redirectUrl = isPublic
      ? `${origin}/registro-post-pago?ref=${intent.reference_id}&plan=${planSlug}&monto=${montoReal}`
      : `${origin}/pago/resultado?ref=${intent.reference_id}`;

    const desc = descripcion ?? `Plan Doravia — ${modalidad}`;
    const script = document.createElement("script");
    script.src = "https://checkout.bold.co/library/boldPaymentButton.js";
    script.setAttribute("data-bold-button", "");
    script.setAttribute("data-order-id", intent.reference_id);
    script.setAttribute("data-description", desc);
    script.setAttribute("data-amount", String(montoReal));
    script.setAttribute("data-currency", "COP");
    script.setAttribute("data-api-key", intent.api_key);
    script.setAttribute("data-integrity-signature", intent.firma);
    script.setAttribute("data-redirection-url", redirectUrl);
    script.async = true;

    contenedorRef.current.appendChild(script);

    return () => {
      if (contenedorRef.current) contenedorRef.current.innerHTML = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  if (cargando) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Preparando pasarela de pago…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
        <button
          onClick={() => void crearIntent()}
          className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white py-3 text-sm font-semibold transition-colors"
        >
          Reintentar
        </button>
        {onCancelar && (
          <button
            onClick={onCancelar}
            className="w-full rounded-xl border border-gray-200 text-gray-600 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Volver
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* El botón Bold se renderiza aquí via el script inyectado */}
      <div ref={contenedorRef} className="flex justify-center min-h-[60px]" />

      <p className="text-xs text-gray-400 text-center">
        Al hacer clic en el botón serás redirigido a Bold para completar el pago de forma segura
      </p>

      {onCancelar && (
        <button
          onClick={onCancelar}
          className="w-full rounded-xl border border-gray-200 text-gray-600 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Volver
        </button>
      )}
    </div>
  );
}
