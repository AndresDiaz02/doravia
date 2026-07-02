import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiError, apiFetch } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  // Campo unificado: acepta usuario corto o correo electrónico
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const valor = identificador.trim();
      // Si contiene "@" se trata como correo; de lo contrario como usuario_pos
      if (valor.includes("@")) {
        await login(valor, password);
      } else {
        // Enviar como usuario POS directamente a la API
        const data = await apiFetch<{ accessToken: string; user: { id: string; nombre: string; email: string; role: string }; tenant: { id: string; nombre: string; nit: string }; plan: { slug: string } }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ usuario: valor, password }),
        });
        // Guardar token y recargar para que el contexto de auth detecte el nuevo token
        localStorage.setItem("pos_token", data.accessToken);
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0E1A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-900/50">
            <span className="text-white text-2xl font-black">D</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">Doravia POS</p>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Punto de venta</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
              Usuario o correo
            </label>
            <input
              type="text" required autoFocus
              value={identificador} onChange={(e) => setIdentificador(e.target.value)}
              className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              placeholder="cajero1 o cajero@empresa.com"
            />
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Los cajeros pueden ingresar con su nombre de usuario sin necesidad de correo.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Contraseña</label>
            <input
              type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          {error && (
            <p className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 py-3 text-base font-semibold text-white transition-colors shadow-lg shadow-violet-900/40"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
