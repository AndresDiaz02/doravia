import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function ProtectedRoute() {
  const { user, tenant, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-violet-50 to-slate-100 px-5">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-7 text-center shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 text-lg font-black text-white shadow-lg shadow-violet-500/25">D</div>
          <div className="mx-auto mt-5 h-5 w-5 animate-spin rounded-full border-2 border-violet-100 border-t-violet-600" aria-hidden="true" />
          <p className="mt-4 font-semibold text-slate-900">Preparando tu espacio de trabajo</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">Estamos verificando tu sesión de forma segura. No necesitas volver a ingresar.</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (tenant && !tenant.onboarding_completado && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
