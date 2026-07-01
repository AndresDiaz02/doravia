import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Clientes } from "./pages/Clientes";
import { ClienteDetalle } from "./pages/ClienteDetalle";
import { Facturas } from "./pages/Facturas";
import { FacturaNueva } from "./pages/FacturaNueva";
import { FacturaDetalle } from "./pages/FacturaDetalle";
import { Contabilidad } from "./pages/Contabilidad";
import { Productos } from "./pages/Productos";
import { Usuarios } from "./pages/Usuarios";
import { ResolucionesDian } from "./pages/ResolucionesDian";
import Bodegas from "./pages/Bodegas";
import Inventario from "./pages/Inventario";
import Kardex from "./pages/Kardex";
import AlertasCobro from "./pages/AlertasCobro";
import Recurrentes from "./pages/Recurrentes";
import Cotizaciones from "./pages/Cotizaciones";
import Gastos from "./pages/Gastos";
import CentrosCostos from "./pages/CentrosCostos";
import Ensamble from "./pages/Ensamble";
import Cartera from "./pages/Cartera";
import UpgradePlan from "./pages/UpgradePlan";
import Retenciones from "./pages/Retenciones";
import NotasCredito from "./pages/NotasCredito";
import NotaCreditoDetalle from "./pages/NotaCreditoDetalle";
import PeriodosContables from "./pages/PeriodosContables";
import ConfiguracionEmpresa from "./pages/ConfiguracionEmpresa";
import AdminCajas from "./pages/AdminCajas";
import CierreDian from "./pages/CierreDian";
import BalancePrueba from "./pages/BalancePrueba";
import Auxiliares from "./pages/Auxiliares";
import ModulosAdicionales from "./pages/ModulosAdicionales";
import ResultadoPago from "./pages/ResultadoPago";
import Onboarding from "./pages/Onboarding";
import AuditLog from "./pages/AuditLog";
import FundadorLayout from "./components/FundadorLayout";
import FundadorAdmin from "./pages/FundadorAdmin";
import FundadorMarketing from "./pages/FundadorMarketing";
import SetupFundador from "./pages/SetupFundador";
import RecuperarPassword from "./pages/RecuperarPassword";
import MiPlan from "./pages/MiPlan";
import RegistroContador from "./pages/RegistroContador";
import ContadorDashboard from "./pages/ContadorDashboard";

/** Redirige al contador fuera de rutas de escritura/administración. */
function SoloEscritura({ to = "/dashboard" }: { to?: string }) {
  const { isContador } = useAuth();
  return isContador ? <Navigate to={to} replace /> : null;
}

/** Redirige a contadores del hub a su panel cuando intentan entrar al ERP. */
function GuardiaERP() {
  const { isContadorHub } = useAuth();
  return isContadorHub ? <Navigate to="/contador" replace /> : null;
}

/** Redirige si el usuario no tiene uno de los roles permitidos. */
function RequiereRol({ allow, to = "/dashboard" }: { allow: string[]; to?: string }) {
  const { user } = useAuth();
  return !allow.includes(user?.role ?? "") ? <Navigate to={to} replace /> : null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/register" element={<Register />} />
          <Route path="/setup-fundador" element={<SetupFundador />} />
          <Route path="/recuperar-password" element={<RecuperarPassword />} />
          <Route path="/registro-contador" element={<RegistroContador />} />
          <Route path="/registro-contador/confirmar" element={<RegistroContador />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<><GuardiaERP /><Dashboard /></>} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/:id" element={<ClienteDetalle />} />
              <Route path="/facturas" element={<Facturas />} />
              <Route path="/facturas/nueva" element={<><SoloEscritura to="/facturas" /><FacturaNueva /></>} />
              <Route path="/facturas/:id" element={<FacturaDetalle />} />
              <Route path="/productos" element={<Productos />} />
              <Route path="/contabilidad" element={<><RequiereRol allow={["admin", "contador"]} /><Contabilidad /></>} />
              <Route path="/bodegas" element={<Bodegas />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/inventario/kardex" element={<Kardex />} />
              <Route path="/alertas/cobro" element={<AlertasCobro />} />
              <Route path="/recurrentes" element={<><RequiereRol allow={["admin", "contador"]} /><Recurrentes /></>} />
              <Route path="/cotizaciones" element={<Cotizaciones />} />
              <Route path="/gastos" element={<><RequiereRol allow={["admin", "contador"]} /><Gastos /></>} />
              <Route path="/centros-costos" element={<><RequiereRol allow={["admin", "contador"]} /><CentrosCostos /></>} />
              <Route path="/ensamble" element={<><RequiereRol allow={["admin", "contador"]} /><Ensamble /></>} />
              <Route path="/cartera" element={<><RequiereRol allow={["admin", "contador"]} /><Cartera /></>} />
              <Route path="/planes" element={<UpgradePlan />} />
              <Route path="/mi-plan" element={<MiPlan />} />
              <Route path="/contador" element={<ContadorDashboard />} />
              <Route path="/usuarios" element={<><SoloEscritura /><Usuarios /></>} />
              <Route path="/configuracion/dian" element={<><SoloEscritura /><ResolucionesDian /></>} />
              <Route path="/retenciones" element={<><RequiereRol allow={["admin", "contador"]} /><Retenciones /></>} />
              <Route path="/notas-credito" element={<NotasCredito />} />
              <Route path="/notas-credito/:id" element={<NotaCreditoDetalle />} />
              <Route path="/periodos-contables" element={<><RequiereRol allow={["admin", "contador"]} /><PeriodosContables /></>} />
              <Route path="/configuracion/empresa" element={<><SoloEscritura /><ConfiguracionEmpresa /></>} />
              <Route path="/pos/cajas" element={<><SoloEscritura /><AdminCajas /></>} />
              <Route path="/pos/cierre-dian" element={<CierreDian />} />
              <Route path="/contabilidad/balance-prueba" element={<><RequiereRol allow={["admin", "contador"]} /><BalancePrueba /></>} />
              <Route path="/contabilidad/auxiliares" element={<><RequiereRol allow={["admin", "contador"]} /><Auxiliares /></>} />
              <Route path="/configuracion/modulos" element={<><SoloEscritura /><ModulosAdicionales /></>} />
              <Route path="/auditoria" element={<><RequiereRol allow={["admin"]} /><AuditLog /></>} />
            </Route>

            {/* Módulo Fundadores — layout propio dentro del ProtectedRoute */}
            <Route path="/fundador" element={<FundadorLayout />}>
              <Route index element={<Navigate to="/fundador/admin" replace />} />
              <Route path="admin" element={<FundadorAdmin />} />
              <Route path="marketing" element={<FundadorMarketing />} />
            </Route>
          </Route>

          <Route path="/pago/resultado" element={<ResultadoPago />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
