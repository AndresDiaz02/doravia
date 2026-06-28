import { Link, Outlet, useLocation } from "react-router-dom";
import { BarChart2, Megaphone, Zap } from "lucide-react";
import { cn } from "../lib/cn";
import { useAuth } from "../lib/auth";
import { Navigate } from "react-router-dom";

export default function FundadorLayout() {
  const { isFundador, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!isFundador) return <Navigate to="/dashboard" replace />;

  const isAdmin = location.pathname.startsWith("/fundador/admin");
  const isMarketing = location.pathname.startsWith("/fundador/marketing");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      {/* Header ejecutivo */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-700 text-white px-8 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
            <Zap className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-widest">Doravia</p>
            <p className="text-base font-bold text-white">Panel Fundadores</p>
          </div>
        </div>

        {/* Tabs Admin / Marketing */}
        <nav className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
          <Link
            to="/fundador/admin"
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
              isAdmin
                ? "bg-white text-slate-900 shadow"
                : "text-white/70 hover:text-white hover:bg-white/10",
            )}
          >
            <BarChart2 className="h-4 w-4" />
            CEO Admin
          </Link>
          <Link
            to="/fundador/marketing"
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
              isMarketing
                ? "bg-white text-slate-900 shadow"
                : "text-white/70 hover:text-white hover:bg-white/10",
            )}
          >
            <Megaphone className="h-4 w-4" />
            CEO Marketing
          </Link>
        </nav>

        <p className="text-xs text-white/40 hidden lg:block">Acceso restringido — solo fundadores</p>
      </header>

      {/* Contenido */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
