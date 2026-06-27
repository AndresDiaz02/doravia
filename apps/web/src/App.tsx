import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
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
import ModulosAdicionales from "./pages/ModulosAdicionales";
import ResultadoPago from "./pages/ResultadoPago";
import Onboarding from "./pages/Onboarding";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/:id" element={<ClienteDetalle />} />
              <Route path="/facturas" element={<Facturas />} />
              <Route path="/facturas/nueva" element={<FacturaNueva />} />
              <Route path="/facturas/:id" element={<FacturaDetalle />} />
              <Route path="/productos" element={<Productos />} />
              <Route path="/contabilidad" element={<Contabilidad />} />
              <Route path="/bodegas" element={<Bodegas />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/inventario/kardex" element={<Kardex />} />
              <Route path="/alertas/cobro" element={<AlertasCobro />} />
              <Route path="/recurrentes" element={<Recurrentes />} />
              <Route path="/cotizaciones" element={<Cotizaciones />} />
              <Route path="/gastos" element={<Gastos />} />
              <Route path="/centros-costos" element={<CentrosCostos />} />
              <Route path="/ensamble" element={<Ensamble />} />
              <Route path="/cartera" element={<Cartera />} />
              <Route path="/planes" element={<UpgradePlan />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/configuracion/dian" element={<ResolucionesDian />} />
              <Route path="/retenciones" element={<Retenciones />} />
              <Route path="/notas-credito" element={<NotasCredito />} />
              <Route path="/notas-credito/:id" element={<NotaCreditoDetalle />} />
              <Route path="/periodos-contables" element={<PeriodosContables />} />
              <Route path="/configuracion/empresa" element={<ConfiguracionEmpresa />} />
              <Route path="/pos/cajas" element={<AdminCajas />} />
              <Route path="/pos/cierre-dian" element={<CierreDian />} />
              <Route path="/contabilidad/balance-prueba" element={<BalancePrueba />} />
              <Route path="/configuracion/modulos" element={<ModulosAdicionales />} />
            </Route>
          </Route>

          <Route path="/pago/resultado" element={<ResultadoPago />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
