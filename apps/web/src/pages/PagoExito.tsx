import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

export default function PagoExito() {
  const [params] = useSearchParams();
  const ref = params.get("ref");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Pago exitoso!</h1>
        <p className="text-gray-500 mb-6">
          Tu pago ha sido procesado correctamente. Recibirás una confirmación en tu correo electrónico.
        </p>
        {ref && (
          <p className="text-xs text-gray-400 font-mono mb-6">Referencia: {ref}</p>
        )}
        <Link
          to="/login"
          className="inline-block bg-green-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
