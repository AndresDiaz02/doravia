import { useState } from "react";
import { ShoppingCart, BookOpen, Clock, LogOut, Calendar } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SeleccionCaja from "./pages/SeleccionCaja";
import Venta from "./pages/Venta";
import Fiados from "./pages/Fiados";
import HistorialVentas from "./pages/HistorialVentas";
import CierreTurno from "./pages/CierreTurno";
import Citas from "./pages/Citas";

interface TurnoActivo {
  turnoId: string;
  cajaId: string;
  cajaNombre: string;
}

type Vista = "venta" | "cartera" | "historial" | "citas";

function AppInner() {
  const { user, loading } = useAuth();
  const [turno, setTurno] = useState<TurnoActivo | null>(null);
  const [vista, setVista] = useState<Vista>("venta");
  const [showCierre, setShowCierre] = useState(false);

  if (window.location.pathname === "/register") {
    return <Register onRegistered={() => { window.location.href = "/"; }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0E1A] flex items-center justify-center">
        <div className="text-slate-400 text-sm">Cargando...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (!turno) {
    return (
      <SeleccionCaja
        onTurnoAbierto={(turnoId, cajaId, cajaNombre) => {
          setTurno({ turnoId, cajaId, cajaNombre });
          setVista("venta");
        }}
      />
    );
  }

  const cfg = user.posConfig;
  const carteraVisible = cfg.cartera_visible !== false; // default visible
  const citasVisible   = cfg.citas_visible === true;    // default oculto

  const navItems: { id: Vista; label: string; icon: React.ReactNode }[] = [
    { id: "venta",    label: "Venta",     icon: <ShoppingCart className="h-4 w-4" /> },
    ...(carteraVisible ? [{ id: "cartera" as Vista, label: "Cartera",  icon: <BookOpen className="h-4 w-4" /> }] : []),
    ...(citasVisible   ? [{ id: "citas"   as Vista, label: "Agenda",   icon: <Calendar className="h-4 w-4" /> }] : []),
    { id: "historial", label: "Historial", icon: <Clock className="h-4 w-4" /> },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0B0E1A]">
      <nav className="bg-[#0B0E1A] border-b border-slate-800 px-4 flex items-center gap-1 flex-shrink-0 h-12">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-black">D</span>
          </div>
          <span className="text-slate-400 text-xs font-medium truncate max-w-[120px]">{turno.cajaNombre}</span>
        </div>

        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={`flex items-center gap-1.5 px-3 h-full text-sm font-medium border-b-2 transition-colors ${
              vista === id
                ? "border-violet-500 text-violet-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setShowCierre(true)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-950/40"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar turno
        </button>
      </nav>

      <div className="flex-1 overflow-hidden">
        {vista === "venta"    && <Venta turnoId={turno.turnoId} cajaId={turno.cajaId} cajaNombre={turno.cajaNombre} />}
        {vista === "cartera"  && <Fiados cajaId={turno.cajaId} />}
        {vista === "citas"    && <Citas cajaId={turno.cajaId} />}
        {vista === "historial" && <HistorialVentas turnoId={turno.turnoId} />}
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
