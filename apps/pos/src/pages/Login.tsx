import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../lib/api";

interface EmpresaOpcion {
  tenant_id: string;
  tenant_nombre: string;
  nit: string;
  role: string;
}

interface LoginSingleResponse { accessToken: string; }
interface LoginMultiResponse {
  requiresEmpresaSelect: true;
  selectionToken: string;
  empresas: EmpresaOpcion[];
}
type LoginResponse = LoginSingleResponse | LoginMultiResponse;

export default function Login() {
  // Campo unificado: acepta usuario corto o correo electrónico
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaOpcion[]>([]);
  const [selectionToken, setSelectionToken] = useState("");

  function completarLogin(accessToken: string) {
    localStorage.setItem("pos_token", accessToken);
    window.location.reload();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const valor = identificador.trim();
      const data = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(valor.includes("@") ? { email: valor, password } : { usuario: valor, password }),
      });
      if ("requiresEmpresaSelect" in data) {
        setEmpresas(data.empresas);
        setSelectionToken(data.selectionToken);
      } else {
        completarLogin(data.accessToken);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  async function handleElegirEmpresa(tenantId: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LoginSingleResponse>("/api/auth/select-empresa", {
        method: "POST",
        body: JSON.stringify({ selectionToken, tenantId }),
      });
      completarLogin(data.accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la empresa seleccionada.");
      if (err instanceof ApiError && err.status === 401) {
        setEmpresas([]);
        setSelectionToken("");
      }
    } finally {
      setLoading(false);
    }
  }

  if (empresas.length > 0) {
    return <div className="min-h-screen bg-gray-50 dark:bg-[#0B0E1A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center"><p className="text-2xl font-bold text-gray-900 dark:text-white">Doravia POS</p><p className="mt-1 text-sm text-gray-400 dark:text-slate-500">Selecciona la empresa donde vas a vender</p></div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {empresas.map((empresa) => <button key={empresa.tenant_id} type="button" disabled={loading} onClick={() => void handleElegirEmpresa(empresa.tenant_id)} className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left last:border-0 hover:bg-violet-50 disabled:opacity-50 dark:border-slate-800 dark:hover:bg-slate-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-sm font-black text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">D</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900 dark:text-white">{empresa.tenant_nombre}</span><span className="block text-xs text-gray-400 dark:text-slate-500">NIT {empresa.nit} · {empresa.role}</span></span>
          </button>)}
        </div>
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800/50 dark:bg-red-950/60 dark:text-red-400">{error}</p>}
        <button type="button" onClick={() => { setEmpresas([]); setSelectionToken(""); setError(null); }} className="w-full text-sm text-gray-400 hover:text-gray-700 dark:hover:text-slate-300">← Volver</button>
      </div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0E1A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <svg style={{height:'56px',width:'56px',display:'block',margin:'0 auto 12px'}} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Doravia"><title>Doravia</title><defs><linearGradient id="g-pos-login" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7B2FF7"/><stop offset="55%" stopColor="#4A6FF5"/><stop offset="100%" stopColor="#2E9BF5"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="#241A5E"/><path fill="url(#g-pos-login)" transform="translate(5,5) scale(0.95)" d="M 30,6 C 72,6 94,26 94,50 C 94,74 72,94 30,94 L 58,50 Z"/></svg>
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
