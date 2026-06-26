import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, Clock } from "lucide-react";

export default function ResultadoPago() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "approved" | "declined" | "pending">("loading");

  useEffect(() => {
    // Wompi añade id, reference, amount_in_cents, currency, payment_method_type, status
    // En producción consultarías el estado real de la transacción
    setTimeout(() => {
      const txStatus = params.get("id") ? "approved" : "pending";
      setStatus(txStatus as typeof status);
    }, 800);
  }, [params]);

  const icons = {
    loading: <div className="w-16 h-16 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto" />,
    approved: <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />,
    declined: <XCircle className="w-16 h-16 text-red-500 mx-auto" />,
    pending:  <Clock className="w-16 h-16 text-amber-500 mx-auto" />,
  };

  const messages = {
    loading: { title: "Verificando pago…", desc: "Espera un momento." },
    approved: {
      title: "¡Pago exitoso!",
      desc: "Tu plan ha sido activado. Puede tomar unos segundos reflejarse en la plataforma.",
    },
    declined: {
      title: "Pago rechazado",
      desc: "No pudimos procesar tu pago. Intenta de nuevo o usa otro método de pago.",
    },
    pending: {
      title: "Pago pendiente",
      desc: "Tu pago está siendo procesado. Te notificaremos cuando sea confirmado.",
    },
  };

  const msg = messages[status];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center space-y-6">
        {icons[status]}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{msg.title}</h1>
          <p className="text-gray-500 mt-2">{msg.desc}</p>
        </div>
        {status !== "loading" && (
          <Link
            to="/dashboard"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            onClick={() => window.location.reload()}
          >
            Ir al Dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
