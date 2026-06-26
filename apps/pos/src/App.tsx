import { useState } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SeleccionCaja from "./pages/SeleccionCaja";
import Venta from "./pages/Venta";
import Fiados from "./pages/Fiados";
import HistorialVentas from "./pages/HistorialVentas";
import CierreTurno from "./pages/CierreTurno";
import Reportes from "./pages/Reportes";

interface TurnoActivo {
  turnoId: string;
  cajaId: string;
  cajaNombre: string;
}

type Vista = "venta" | "fiados" | "historial" | "reportes";

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
      <div className="min-h-screen bg-blue-700 flex items-center justify-center">
        <div className="text-white text-lg font-medium">Cargando...</div>
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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Barra de navegación */}
      <nav className="bg-blue-700 text-white px-4 py-0 flex items-center gap-1 flex-shrink-0 border-b border-blue-800">
        <span className="font-bold text-sm mr-3 py-3 text-blue-100">{turno.cajaNombre}</span>
        {([
          { id: "venta",    label: "Venta"    },
          { id: "fiados",   label: "Fiados"   },
          { id: "historial",label: "Historial"},
          { id: "reportes", label: "Reportes" },
        ] as { id: Vista; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              vista === id ? "border-white text-white" : "border-transparent text-blue-200 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowCierre(true)}
          className="text-xs text-blue-200 hover:text-white py-3 px-2"
        >
          Cerrar turno
        </button>
      </nav>

      <div className="flex-1 overflow-hidden">
        {vista === "venta" && (
          <Venta turnoId={turno.turnoId} cajaId={turno.cajaId} cajaNombre={turno.cajaNombre} />
        )}
        {vista === "fiados" && <Fiados cajaId={turno.cajaId} />}
        {vista === "historial" && <HistorialVentas turnoId={turno.turnoId} />}
        {vista === "reportes" && <Reportes />}
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
