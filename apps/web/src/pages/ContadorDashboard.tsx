import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, TrendingUp, Clock, CheckCircle2, LogOut, ChevronRight } from "lucide-react";
import { apiFetch, cop } from "../lib/api";
import { useAuth } from "../lib/auth";

interface EmpresaContador {
  acceso_id: string;
  tenant_id: string;
  nombre: string;
  nit: string;
  plan_nombre: string;
  plan_slug: string;
  activo: boolean;
  plan_ends_at: string;
  role: string;
}

interface Comision {
  id: string;
  tenant_nombre: string;
  tipo: "venta_inicial" | "renovacion";
  base_cop: number;
  valor_cop: number;
  porcentaje: string;
  pagada: boolean;
  fecha_pago: string | null;
  created_at: string;
}

interface ComisionesRes {
  comisiones: Comision[];
  pendiente: number;
  pagada_total: number;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

const PLAN_LABEL: Record<string, string> = {
  semilla: "Semilla", raiz: "Raíz", brote: "Brote", cosecha: "Cosecha",
  origen: "Origen", punto: "Punto", punto_plus: "Punto Plus",
};

export default function ContadorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState<EmpresaContador[]>([]);
  const [comisiones, setComisiones] = useState<ComisionesRes | null>(null);
  const [tab, setTab] = useState<"empresas" | "comisiones">("empresas");
  const [loading, setLoading] = useState(true);
  const [cambiando, setCambiando] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<EmpresaContador[]>("/api/contadores/mis-empresas"),
      apiFetch<ComisionesRes>("/api/contadores/mis-comisiones"),
    ]).then(([e, c]) => {
      setEmpresas(e);
      setComisiones(c);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleEntrar(tenantId: string) {
    setCambiando(tenantId);
    try {
      const { cambiarEmpresa } = await import("../lib/auth").then((m) => {
        const ctx = m;
        return ctx;
      });
      // Llamamos directo al endpoint y luego reload para que auth refresque
      await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/api/auth/cambiar-empresa",
        { method: "POST", body: JSON.stringify({ tenantId }) },
      ).then(({ accessToken, refreshToken }) => {
        localStorage.setItem("access_token", accessToken);
        localStorage.setItem("refresh_token", refreshToken);
        window.location.href = "/dashboard";
      });
    } catch {
      setCambiando(null);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-action flex items-center justify-center text-white font-bold text-sm select-none">
              D
            </div>
            <div>
              <span className="font-semibold text-gray-900 text-sm">Doravia</span>
              <span className="mx-2 text-gray-200">·</span>
              <span className="text-sm text-gray-400">Hub Contadores</span>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <span className="text-sm text-gray-600 hidden sm:block">{user?.nombre}</span>
            <button
              onClick={() => void handleLogout()}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Panel de contador</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bienvenido, {user?.nombre}. Gestiona tus empresas y consulta tus comisiones.
          </p>
        </div>

        {/* Resumen comisiones */}
        {comisiones && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Comisiones pendientes</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{cop(comisiones.pendiente)}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total pagado</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{cop(comisiones.pagada_total)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-6">
          {(["empresas", "comisiones"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-action text-action"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "empresas" ? `Mis empresas (${empresas.length})` : "Comisiones"}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-action border-t-transparent" />
          </div>
        )}

        {/* Empresas */}
        {!loading && tab === "empresas" && (
          <div className="space-y-3">
            {empresas.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Building2 className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No tienes empresas asignadas aún</p>
                <p className="text-xs text-gray-400 mt-1">
                  Cuando una empresa te invite como contador aparecerá aquí.
                </p>
              </div>
            ) : (
              empresas.map((e) => (
                <div
                  key={e.acceso_id}
                  className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 hover:border-gray-300 transition-colors"
                >
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-action to-action/60 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{e.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      NIT {e.nit}
                      <span className="mx-1.5">·</span>
                      Plan {PLAN_LABEL[e.plan_slug] ?? e.plan_slug}
                      <span className="mx-1.5">·</span>
                      Vence {fmtDate(e.plan_ends_at)}
                    </p>
                  </div>
                  <button
                    disabled={cambiando === e.tenant_id}
                    onClick={() => void handleEntrar(e.tenant_id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-action hover:text-action/80 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    {cambiando === e.tenant_id ? "Entrando…" : "Entrar"}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Comisiones */}
        {!loading && tab === "comisiones" && (
          <div className="space-y-3">
            {!comisiones?.comisiones.length ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <TrendingUp className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">Sin comisiones registradas</p>
                <p className="text-xs text-gray-400 mt-1">
                  Tus comisiones aparecerán cuando las empresas referidas realicen pagos.
                </p>
              </div>
            ) : (
              comisiones.comisiones.map((c) => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    c.pagada ? "bg-green-50" : "bg-amber-50"
                  }`}>
                    <TrendingUp className={`h-4 w-4 ${c.pagada ? "text-green-500" : "text-amber-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{c.tenant_nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.tipo === "venta_inicial" ? "Venta inicial" : "Renovación"}
                      <span className="mx-1">·</span>
                      {c.porcentaje}% de {cop(c.base_cop)}
                      <span className="mx-1">·</span>
                      {fmtDate(c.created_at)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900">{cop(c.valor_cop)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                      c.pagada ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {c.pagada ? "Pagada" : "Pendiente"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
