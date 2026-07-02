import { useState, useEffect } from "react";
import { ShoppingCart, BookOpen, Clock, LogOut, Calendar, Sun, Moon, Wallet, BarChart2 } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth";
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

function AppInner() {
  const { user, loading } = useAuth();
  const [turno, setTurno] = useState<TurnoActivo | null>(null);
  const [vista, setVista] = useState<Vista>("venta");
  const [showCierre, setShowCierre] = useState(false);
  const { dark, toggleTheme } = useTheme();

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
        {vista === "citas"    && <Citas cajaId={turno.cajaId} />}
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

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
