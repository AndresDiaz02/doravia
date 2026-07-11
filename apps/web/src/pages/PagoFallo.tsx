import { useSearchParams, Link } from "react-router-dom";
import { XCircle } from "lucide-react";

export default function PagoFallo() {
  const [params] = useSearchParams();
  const ref = params.get("ref");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago no completado</h1>
        <p className="text-gray-500 mb-6">
          El pago no pudo completarse. Puedes intentarlo nuevamente o comunicarte con quien te envió la cotización.
        </p>
        {ref && (
          <p className="text-xs text-gray-400 font-mono mb-6">Referencia: {ref}</p>
        )}
        <Link
          to="/login"
          className="inline-block bg-indigo-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
