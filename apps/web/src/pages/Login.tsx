import { useState, type FormEvent } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Building2, ChevronRight } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface EmpresaOpcion {
  tenant_id: string;
  tenant_nombre: string;
  nit: string;
  role: string;
}

interface LoginSingleResponse {
  accessToken: string;
  refreshToken: string;
}

interface LoginMultiResponse {
  requiresEmpresaSelect: true;
  selectionToken: string;
  empresas: EmpresaOpcion[];
}

type LoginResponse = LoginSingleResponse | LoginMultiResponse;

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  contador: "Contador",
  vendedor: "Vendedor",
  operario: "Operario",
};

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [empresas, setEmpresas] = useState<EmpresaOpcion[]>([]);
  const [selectionToken, setSelectionToken] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get("expired") === "1";
  const redirectAfterLogin = searchParams.get("redirect") ?? "";

  function destino(nit: string | undefined) {
    if (redirectAfterLogin) return redirectAfterLogin;
    return nit === "0000000001" ? "/contador" : "/dashboard";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if ("requiresEmpresaSelect" in data) {
        setEmpresas(data.empresas);
        setSelectionToken(data.selectionToken);
      } else {
        const me = await login(data.accessToken, data.refreshToken);
        navigate(destino(me?.nit), { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function handleElegirEmpresa(tenantId: string) {
    setEligiendo(true);
    setError(null);
    try {
      const data = await apiFetch<LoginSingleResponse>("/api/auth/select-empresa", {
        method: "POST",
        body: JSON.stringify({ selectionToken, tenantId }),
      });
      const me = await login(data.accessToken, data.refreshToken);
      navigate(destino(me?.nit), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al seleccionar empresa.");
      if (err instanceof ApiError && err.message.includes("expiró")) {
        setEmpresas([]);
        setSelectionToken("");
      }
    } finally {
      setEligiendo(false);
    }
  }

  // ── Picker de empresa ──────────────────────────────────────────────────────
  if (empresas.length > 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <svg style={{height:'48px',width:'auto',display:'block',margin:'0 auto'}} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 140" role="img" aria-label="Doravia" fontFamily="Sora, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"><title>Doravia</title><defs><linearGradient id="g-erp-login" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7B2FF7"/><stop offset="55%" stopColor="#4A6FF5"/><stop offset="100%" stopColor="#2E9BF5"/></linearGradient></defs><path fill="url(#g-erp-login)" transform="translate(20,20) scale(1.05)" d="M 30,6 C 72,6 94,26 94,50 C 94,74 72,94 30,94 L 58,50 Z"/><text x="160" y="98" fontSize="92" fontWeight="800" fill="#241A5E">Doravia</text></svg>
            <p className="mt-1 text-sm text-gray-500">
              Selecciona la empresa con la que deseas trabajar
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {empresas.map((empresa) => (
              <button
                key={empresa.tenant_id}
                onClick={() => void handleElegirEmpresa(empresa.tenant_id)}
                disabled={eligiendo}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors disabled:opacity-50 first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-action to-action/70 text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{empresa.tenant_nombre}</p>
                  <p className="text-sm text-gray-400">
                    NIT {empresa.nit} · {ROLE_LABEL[empresa.role] ?? empresa.role}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            onClick={() => { setEmpresas([]); setSelectionToken(""); setError(null); }}
            className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  // ── Formulario de login ────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Doravia</h1>
          <p className="mt-1 text-sm text-gray-500">Inicia sesión en tu cuenta</p>
        </div>

        {sessionExpired && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Tu sesión ha expirado. Ingresa de nuevo para continuar.
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <Link to="/recuperar-password" className="text-xs text-green-600 hover:text-green-700">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          Al usar Doravia aceptas nuestros{" "}
          <a href="/terminos" className="underline hover:text-gray-600">Términos de uso</a>
          {" "}y{" "}
          <a href="/privacidad" className="underline hover:text-gray-600">Política de privacidad</a>
        </p>
      </div>
    </div>
  );
}
