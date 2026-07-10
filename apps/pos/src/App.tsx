import { useState, useEffect, useCallback, useRef } from "react";
import { ShoppingCart, BookOpen, Clock, LogOut, Calendar, Sun, Moon, Wallet, BarChart2, Bell, X } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth";
import { apiFetch } from "./lib/api";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SeleccionCaja, { type CajaConfig } from "./pages/SeleccionCaja";
import Venta from "./pages/Venta";
import Fiados from "./pages/Fiados";
import HistorialVentas from "./pages/HistorialVentas";
import CierreTurno from "./pages/CierreTurno";
import Citas from "./pages/Citas";
import GastosCaja from "./pages/GastosCaja";
import Reportes from "./pages/Reportes";

interface TurnoActivo {
  turnoId: string;
  cajaId: string;
  cajaNombre: string;
  cajaConfig: CajaConfig | null;
}

type Vista = "venta" | "cartera" | "historial" | "citas" | "gastos" | "reportes";

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem("pos_theme") !== "light");

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("pos_theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggleTheme: () => setDark((d) => !d) };
}

interface InAppNotif {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function AppInner() {
  const { user, loading } = useAuth();
  const [turno, setTurno] = useState<TurnoActivo | null>(null);
  const [vista, setVista] = useState<Vista>("venta");
  const [showCierre, setShowCierre] = useState(false);
  const { dark, toggleTheme } = useTheme();

  // ── Campana in-app ─────────────────────────────────────────────────────────
  const [inAppNotifs, setInAppNotifs] = useState<InAppNotif[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const cargarNotifs = useCallback(() => {
    if (!user) return;
    void apiFetch<InAppNotif[]>("/api/notificaciones/in-app").then(setInAppNotifs).catch(() => {});
  }, [user]);

  useEffect(() => {
    cargarNotifs();
    const t = setInterval(cargarNotifs, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [cargarNotifs]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unread = inAppNotifs.filter((n) => !n.is_read).length;

  async function handleMarkRead(id: string) {
    try {
      await apiFetch(`/api/notificaciones/${id}/read`, { method: "PATCH" });
      setInAppNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* silencioso */ }
  }

  if (window.location.pathname === "/register") {
    return <Register onRegistered={() => { window.location.href = "/"; }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0B0E1A] flex items-center justify-center">
        <div className="text-gray-500 dark:text-slate-400 text-sm">Cargando...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (!turno) {
    return (
      <SeleccionCaja
        onTurnoAbierto={(turnoId, cajaId, cajaNombre, cajaConfig) => {
          setTurno({ turnoId, cajaId, cajaNombre, cajaConfig });
          setVista("venta");
        }}
      />
    );
  }

  const cfg = user.posConfig;
  const carteraVisible = cfg.cartera_visible !== false;
  const citasVisible   = cfg.citas_visible === true;

  const navItems: { id: Vista; label: string; icon: React.ReactNode }[] = [
    { id: "venta",    label: "Venta",     icon: <ShoppingCart className="h-4 w-4" /> },
    ...(carteraVisible ? [{ id: "cartera" as Vista, label: "Cartera",  icon: <BookOpen className="h-4 w-4" /> }] : []),
    ...(citasVisible   ? [{ id: "citas"   as Vista, label: "Agenda",   icon: <Calendar className="h-4 w-4" /> }] : []),
    { id: "historial", label: "Historial", icon: <Clock className="h-4 w-4" /> },
    { id: "gastos",    label: "Caja",      icon: <Wallet className="h-4 w-4" /> },
    { id: "reportes",  label: "Reportes",  icon: <BarChart2 className="h-4 w-4" /> },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0B0E1A]">
      <nav className="bg-white dark:bg-[#0B0E1A] border-b border-gray-200 dark:border-slate-800 px-4 flex items-center gap-1 flex-shrink-0 h-12">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-black">D</span>
          </div>
          <span className="text-gray-500 dark:text-slate-400 text-xs font-medium truncate max-w-[120px]">{turno.cajaNombre}</span>
        </div>

        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={`flex items-center gap-1.5 px-3 h-full text-sm font-medium border-b-2 transition-colors ${
              vista === id
                ? "border-violet-500 text-violet-600 dark:text-violet-400"
                : "border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Campana in-app */}
        <div className="relative mr-1" ref={notifRef}>
          <button
            onClick={() => setShowNotif((v) => !v)}
            className="relative p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            title="Notificaciones"
          >
            <Bell className="h-3.5 w-3.5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {showNotif && (
            <div className="absolute top-full right-0 mt-1 z-50">
              <PosNotifDropdown notifs={inAppNotifs} onMarkRead={handleMarkRead} onClose={() => setShowNotif(false)} />
            </div>
          )}
        </div>

        <button
          onClick={toggleTheme}
          title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors mr-1"
        >
          {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={() => setShowCierre(true)}
          className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar turno
        </button>
      </nav>

      <div className="flex-1 overflow-hidden">
        {vista === "venta"    && <Venta turnoId={turno.turnoId} cajaId={turno.cajaId} cajaNombre={turno.cajaNombre} cajaConfig={turno.cajaConfig} />}
        {vista === "cartera"  && <Fiados cajaId={turno.cajaId} />}
        {vista === "citas"    && <Citas cajaId={turno.cajaId} onIrAVenta={() => setVista("venta")} />}
        {vista === "historial" && <HistorialVentas turnoId={turno.turnoId} />}
        {vista === "gastos"    && <GastosCaja turnoId={turno.turnoId} cajaId={turno.cajaId} />}
        {vista === "reportes"  && <Reportes />}
      </div>

      {showCierre && (
        <CierreTurno
          turnoId={turno.turnoId}
          cajaNombre={turno.cajaNombre}
          onCerrado={() => { setShowCierre(false); setTurno(null); }}
          onCancelar={() => setShowCierre(false)}
        />
      )}
    </div>
  );
}

function PosNotifDropdown({
  notifs,
  onMarkRead,
  onClose,
}: {
  notifs: InAppNotif[];
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-72 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0B0E1A] shadow-xl">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-slate-800">
        <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">
          Notificaciones
          {notifs.filter((n) => !n.is_read).length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
              {notifs.filter((n) => !n.is_read).length}
            </span>
          )}
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-0.5 rounded">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {notifs.length === 0 ? (
        <div className="px-3 py-5 text-center">
          <Bell className="h-6 w-6 text-gray-300 dark:text-slate-600 mx-auto mb-1.5" />
          <p className="text-xs text-gray-400 dark:text-slate-500">Sin notificaciones</p>
        </div>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
          {notifs.map((n) => (
            <li key={n.id} className={n.is_read ? "opacity-55" : ""}>
              <button
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => { if (!n.is_read) onMarkRead(n.id); onClose(); }}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${n.is_read ? "bg-gray-300 dark:bg-slate-600" : "bg-violet-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-slate-100 truncate">{n.title}</p>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
