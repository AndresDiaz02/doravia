import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function ResultadoPago() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "approved" | "declined" | "pending">("loading");
  const [isRegistro, setIsRegistro] = useState(false);
  const [registroError, setRegistroError] = useState<string | null>(null);

  // Bold usa ?ref= mientras Wompi usa ?reference=
  const refBold = params.get("ref") ?? "";
  const ref = params.get("reference") ?? "";
  const esBold = refBold.startsWith("DORAVIA-");
  const esRegistro = ref.startsWith("DOR-REG-");

  const planSlug = (() => {
    if (esRegistro) {
      // DOR-REG-{timestamp}-{planSlug}
      const partes = ref.split("-");
      return partes.length >= 4 ? partes.slice(3).join("-") : "";
    }
    const parts = ref.split("-");
    return parts.length >= 3 ? parts[2] : "";
  })();
  const esPOS = ["punto", "punto_plus"].includes(planSlug);

  useEffect(() => {
    // Flujo Bold: ?ref=DORAVIA-xxx
    if (esBold) {
      const statusParam = params.get("status");
      if (statusParam === "approved") {
        setStatus("approved");
        return;
      }
      // Consultar estado en la API
      verificarPagoBold(refBold);
      return;
    }

    const wompiId = params.get("id");

    if (!wompiId) {
      setStatus("pending");
      return;
    }

    if (esRegistro) {
      // Flujo de registro: verificar si el webhook ya completó la cuenta
      setIsRegistro(true);
      verificarRegistro(ref);
    } else {
      // Flujo normal de upgrade de plan
      setTimeout(() => setStatus("approved"), 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verificarPagoBold(referenceId: string, intento = 1) {
    try {
      const data = await apiFetch<{ estado: string; transaction_id?: string }>(
        `/api/pagos/bold/status/${referenceId}`,
      );
      if (data.estado === "APPROVED") {
        setStatus("approved");
      } else if (data.estado === "REJECTED" || data.estado === "FAILED") {
        setStatus("declined");
      } else if (intento < 6) {
        // RUNNING o PENDING — reintentar
        setTimeout(() => verificarPagoBold(referenceId, intento + 1), 2500);
      } else {
        setStatus("pending");
      }
    } catch {
      if (intento < 3) {
        setTimeout(() => verificarPagoBold(referenceId, intento + 1), 2000);
      } else {
        setStatus("pending");
      }
    }
  }

  async function verificarRegistro(wompiReference: string, intento = 1) {
    try {
      const data = await apiFetch<{ completed: boolean; accessToken?: string; refreshToken?: string }>(
        "/api/auth/verificar-registro",
        { method: "POST", body: JSON.stringify({ wompi_reference: wompiReference }) },
      );

      if (data.completed && data.accessToken && data.refreshToken) {
        await login(data.accessToken, data.refreshToken);
        setStatus("approved");
        // Redirigir al onboarding
        setTimeout(() => navigate("/configuracion/dian", { replace: true }), 1800);
      } else if (intento < 5) {
        // El webhook puede tardar unos segundos — reintentar
        setTimeout(() => verificarRegistro(wompiReference, intento + 1), 2000);
      } else {
        setStatus("pending");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setRegistroError("No encontramos un registro pendiente para esta referencia.");
        setStatus("declined");
      } else {
        setStatus("pending");
      }
    }
  }

  const icons = {
    loading: <div className="w-16 h-16 border-4 border-action border-t-transparent rounded-full animate-spin mx-auto" />,
    approved: <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />,
    declined: <XCircle className="w-16 h-16 text-red-500 mx-auto" />,
    pending:  <Clock className="w-16 h-16 text-amber-500 mx-auto" />,
  };

  const messages = {
    loading: {
      title: isRegistro ? "Activando tu cuenta…" : "Verificando pago…",
      desc: "Espera un momento.",
    },
    approved: {
      title: isRegistro ? "¡Cuenta activada!" : "¡Pago exitoso!",
      desc: isRegistro
        ? "Tu empresa está lista. Te estamos llevando al panel…"
        : "Tu plan ha sido activado. Puede tomar unos segundos reflejarse.",
    },
    declined: {
      title: "Pago rechazado",
      desc: registroError ?? "No pudimos procesar tu pago. Intenta de nuevo o usa otro método.",
    },
    pending: {
      title: "Pago pendiente",
      desc: isRegistro
        ? "Tu pago está siendo confirmado. Una vez aprobado tu cuenta se activará automáticamente. Puedes cerrar esta ventana."
        : "Tu pago está siendo procesado. Te notificaremos cuando sea confirmado.",
    },
  };

  const msg = messages[status];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-10 max-w-md w-full text-center space-y-6">
        {icons[status]}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{msg.title}</h1>
          <p className="text-gray-500 mt-2">{msg.desc}</p>
        </div>

        {status !== "loading" && (
          <div className="space-y-3">
            {isRegistro ? (
              <>
                {status !== "approved" && (
                  <Link
                    to="/login"
                    className="inline-block bg-action hover:bg-action-hover text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                  >
                    Ir al inicio de sesión
                  </Link>
                )}
                {status === "declined" && (
                  <p className="text-xs text-gray-400">
                    ¿El pago fue aprobado pero no entras?{" "}
                    <a href="/login" className="text-action hover:underline">Intenta iniciar sesión</a>
                  </p>
                )}
              </>
            ) : esPOS ? (
              status === "approved" ? (
                <Link
                  to="/pos/cajas"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  Configurar cajas POS →
                </Link>
              ) : null
            ) : (
              <>
                {status === "approved" && (
                  <Link
                    to="/dashboard"
                    className="inline-block bg-action hover:bg-action-hover text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                    onClick={() => window.location.reload()}
                  >
                    Ir al Dashboard
                  </Link>
                )}
                {(status === "declined" || status === "pending") && (
                  <Link
                    to="/planes"
                    className="inline-block border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold px-6 py-3 rounded-lg transition-colors"
                  >
                    Intentar de nuevo
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
