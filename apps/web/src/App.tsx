import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { Login } from "./pages/Login";
import FundadorLayout from "./components/FundadorLayout";

// Las pantallas operativas se descargan solo al abrirlas. Así la página de
// ingreso no espera módulos como contabilidad, nómina o conciliación bancaria.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const ClienteDetalle = lazy(() => import("./pages/ClienteDetalle").then((m) => ({ default: m.ClienteDetalle })));
const FacturaNueva = lazy(() => import("./pages/FacturaNueva").then((m) => ({ default: m.FacturaNueva })));
const FacturaDetalle = lazy(() => import("./pages/FacturaDetalle").then((m) => ({ default: m.FacturaDetalle })));
const Contabilidad = lazy(() => import("./pages/Contabilidad").then((m) => ({ default: m.Contabilidad })));
const Productos = lazy(() => import("./pages/Productos").then((m) => ({ default: m.Productos })));
const Usuarios = lazy(() => import("./pages/Usuarios").then((m) => ({ default: m.Usuarios })));
const ResolucionesDian = lazy(() => import("./pages/ResolucionesDian").then((m) => ({ default: m.ResolucionesDian })));
const Bodegas = lazy(() => import("./pages/Bodegas"));
const Inventario = lazy(() => import("./pages/Inventario"));
const Kardex = lazy(() => import("./pages/Kardex"));
const AsesorPedidos = lazy(() => import("./pages/AsesorPedidos"));
const AlertasCobro = lazy(() => import("./pages/AlertasCobro"));
const Recurrentes = lazy(() => import("./pages/Recurrentes"));
const Cotizaciones = lazy(() => import("./pages/Cotizaciones"));
const Gastos = lazy(() => import("./pages/Gastos"));
const CentrosCostos = lazy(() => import("./pages/CentrosCostos"));
const Ensamble = lazy(() => import("./pages/Ensamble"));
const Cartera = lazy(() => import("./pages/Cartera"));
const ConfiguracionEmpresa = lazy(() => import("./pages/ConfiguracionEmpresa"));
const AdminCajas = lazy(() => import("./pages/AdminCajas"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const FundadorAdmin = lazy(() => import("./pages/FundadorAdmin"));
const FundadorMarketing = lazy(() => import("./pages/FundadorMarketing"));
const PlanCuentas = lazy(() => import("./pages/PlanCuentas"));
const CajerosPOS = lazy(() => import("./pages/CajerosPOS"));
const Remisiones = lazy(() => import("./pages/Remisiones"));
const Proveedores = lazy(() => import("./pages/Proveedores"));
const ProveedorDetalle = lazy(() => import("./pages/ProveedorDetalle"));
const ConciliacionBancaria = lazy(() => import("./pages/ConciliacionBancaria"));
const ActivosFijos = lazy(() => import("./pages/ActivosFijos"));
const DocumentosSoporte = lazy(() => import("./pages/DocumentosSoporte"));
const AgendaServicios = lazy(() => import("./pages/AgendaServicios"));
const CotizacionDetalle = lazy(() => import("./pages/CotizacionDetalle"));
const NominaEmpleados = lazy(() => import("./pages/NominaEmpleados"));
const NominaEmpleadoForm = lazy(() => import("./pages/NominaEmpleadoForm"));
const NominaPeriodos = lazy(() => import("./pages/NominaPeriodos"));
const NominaPeriodoNuevo = lazy(() => import("./pages/NominaPeriodoNuevo"));
const NominaPeriodoDetalle = lazy(() => import("./pages/NominaPeriodoDetalle"));
const NominaMiPlan = lazy(() => import("./pages/NominaMiPlan"));
const Clientes = lazy(() => import("./pages/Clientes").then((m) => ({ default: m.Clientes })));
const Facturas = lazy(() => import("./pages/Facturas").then((m) => ({ default: m.Facturas })));
const UpgradePlan = lazy(() => import("./pages/UpgradePlan"));
const Retenciones = lazy(() => import("./pages/Retenciones"));
const NotasCredito = lazy(() => import("./pages/NotasCredito"));
const NotaCreditoDetalle = lazy(() => import("./pages/NotaCreditoDetalle"));
const NotasDebito = lazy(() => import("./pages/NotasDebito"));
const NotaDebitoDetalle = lazy(() => import("./pages/NotaDebitoDetalle"));
const PeriodosContables = lazy(() => import("./pages/PeriodosContables"));
const CierreDian = lazy(() => import("./pages/CierreDian"));
const BalancePrueba = lazy(() => import("./pages/BalancePrueba"));
const Auxiliares = lazy(() => import("./pages/Auxiliares"));
const ModulosAdicionales = lazy(() => import("./pages/ModulosAdicionales"));
const ResultadoPago = lazy(() => import("./pages/ResultadoPago"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const FundadorSales = lazy(() => import("./pages/FundadorSales"));
const FundadorQuotes = lazy(() => import("./pages/FundadorQuotes"));
const PropuestaPublica = lazy(() => import("./pages/PropuestaPublica"));
const ReporteIVA = lazy(() => import("./pages/ReporteIVA"));
const MiPlan = lazy(() => import("./pages/MiPlan"));
const RegistroContador = lazy(() => import("./pages/RegistroContador"));
const ContadorDashboard = lazy(() => import("./pages/ContadorDashboard"));
const ConfiguracionPagos = lazy(() => import("./pages/ConfiguracionPagos"));
const Register = lazy(() => import("./pages/Register").then((m) => ({ default: m.Register })));
const SetupFundador = lazy(() => import("./pages/SetupFundador"));
const RecuperarPassword = lazy(() => import("./pages/RecuperarPassword"));
const Privacidad = lazy(() => import("./pages/Privacidad"));
const Terminos = lazy(() => import("./pages/Terminos"));
const Checkout = lazy(() => import("./pages/Checkout"));
const RegistroPostPago = lazy(() => import("./pages/RegistroPostPago"));
const PagoExito = lazy(() => import("./pages/PagoExito"));
const PagoFallo = lazy(() => import("./pages/PagoFallo"));

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

/** El Hub no puede abrirse por URL directa con una cuenta normal. */
function SoloContadorRegistrado() {
  const { isContadorHub } = useAuth();
  return !isContadorHub ? <Navigate to="/dashboard" replace /> : null;
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
        <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-slate-500">Cargando módulo…</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/register" element={<Register />} />
          <Route path="/setup-fundador" element={<SetupFundador />} />
          <Route path="/recuperar-password" element={<RecuperarPassword />} />
          <Route path="/registro-contador" element={<RegistroContador />} />
          <Route path="/registro-contador/confirmar" element={<RegistroContador />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/registro-post-pago" element={<RegistroPostPago />} />
          <Route path="/propuesta/:token" element={<PropuestaPublica />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/contador" element={<><SoloContadorRegistrado /><ContadorDashboard /></>} />
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
              <Route path="/inventario/asesor-pedidos" element={<AsesorPedidos />} />
              <Route path="/alertas/cobro" element={<AlertasCobro />} />
              <Route path="/recurrentes" element={<><RequiereRol allow={["admin", "contador"]} /><Recurrentes /></>} />
              <Route path="/cotizaciones" element={<Cotizaciones />} />
              <Route path="/cotizaciones/:id" element={<CotizacionDetalle />} />
              <Route path="/configuracion/pagos" element={<><RequiereRol allow={["admin"]} /><ConfiguracionPagos /></>} />
              <Route path="/gastos" element={<><RequiereRol allow={["admin", "contador"]} /><Gastos /></>} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/proveedores/:id" element={<ProveedorDetalle />} />
              <Route path="/centros-costos" element={<><RequiereRol allow={["admin", "contador"]} /><CentrosCostos /></>} />
              <Route path="/ensamble" element={<><RequiereRol allow={["admin", "contador"]} /><Ensamble /></>} />
              <Route path="/cartera" element={<><RequiereRol allow={["admin", "contador"]} /><Cartera /></>} />
              <Route path="/planes" element={<UpgradePlan />} />
              <Route path="/mi-plan" element={<MiPlan />} />
              {/* /contador se maneja fuera del AppLayout */}
              <Route path="/usuarios" element={<><SoloEscritura /><Usuarios /></>} />
              <Route path="/configuracion/dian" element={<><SoloEscritura /><ResolucionesDian /></>} />
              <Route path="/retenciones" element={<><RequiereRol allow={["admin", "contador"]} /><Retenciones /></>} />
              <Route path="/notas-credito" element={<NotasCredito />} />
              <Route path="/notas-credito/:id" element={<NotaCreditoDetalle />} />
              <Route path="/notas-debito" element={<NotasDebito />} />
              <Route path="/notas-debito/:id" element={<NotaDebitoDetalle />} />
              <Route path="/periodos-contables" element={<><RequiereRol allow={["admin", "contador"]} /><PeriodosContables /></>} />
              <Route path="/configuracion/empresa" element={<><SoloEscritura /><ConfiguracionEmpresa /></>} />
              <Route path="/pos/cajas" element={<><SoloEscritura /><AdminCajas /></>} />
              <Route path="/pos/cajeros" element={<><SoloEscritura /><CajerosPOS /></>} />
              <Route path="/pos/cierre-dian" element={<CierreDian />} />
              <Route path="/remisiones" element={<Remisiones />} />
              <Route path="/contabilidad/balance-prueba" element={<><RequiereRol allow={["admin", "contador"]} /><BalancePrueba /></>} />
              <Route path="/contabilidad/auxiliares" element={<><RequiereRol allow={["admin", "contador"]} /><Auxiliares /></>} />
              <Route path="/contabilidad/iva" element={<><RequiereRol allow={["admin", "contador"]} /><ReporteIVA /></>} />
              <Route path="/contabilidad/plan-cuentas" element={<><RequiereRol allow={["admin", "contador"]} /><PlanCuentas /></>} />
              <Route path="/conciliacion-bancaria" element={<><RequiereRol allow={["admin", "contador"]} /><ConciliacionBancaria /></>} />
              <Route path="/configuracion/modulos" element={<><SoloEscritura /><ModulosAdicionales /></>} />
              <Route path="/auditoria" element={<><RequiereRol allow={["admin"]} /><AuditLog /></>} />
              <Route path="/activos-fijos" element={<><RequiereRol allow={["admin", "contador"]} /><ActivosFijos /></>} />
              <Route path="/documentos-soporte" element={<><RequiereRol allow={["admin", "contador"]} /><DocumentosSoporte /></>} />
              <Route path="/agenda-servicios" element={<AgendaServicios />} />
              <Route path="/nomina/empleados" element={<><RequiereRol allow={["admin", "contador"]} /><NominaEmpleados /></>} />
              <Route path="/nomina/empleados/nuevo" element={<><SoloEscritura to="/nomina/empleados" /><NominaEmpleadoForm /></>} />
              <Route path="/nomina/empleados/:id" element={<><SoloEscritura to="/nomina/empleados" /><NominaEmpleadoForm /></>} />
              <Route path="/nomina/periodos" element={<><RequiereRol allow={["admin", "contador"]} /><NominaPeriodos /></>} />
              <Route path="/nomina/periodos/nuevo" element={<><SoloEscritura to="/nomina/periodos" /><NominaPeriodoNuevo /></>} />
              <Route path="/nomina/periodos/:id" element={<><RequiereRol allow={["admin", "contador"]} /><NominaPeriodoDetalle /></>} />
              <Route path="/nomina/mi-plan" element={<NominaMiPlan />} />
              <Route path="/nomina/*" element={<Navigate to="/nomina/periodos" replace />} />
            </Route>

            {/* Módulo Fundadores — layout propio dentro del ProtectedRoute */}
            <Route path="/fundador" element={<FundadorLayout />}>
              <Route index element={<Navigate to="/fundador/ventas" replace />} />
              <Route path="ventas" element={<FundadorSales />} />
              <Route path="cotizaciones" element={<FundadorQuotes />} />
              <Route path="admin" element={<FundadorAdmin />} />
              <Route path="marketing" element={<FundadorMarketing />} />
            </Route>
          </Route>

          <Route path="/pago/resultado" element={<ResultadoPago />} />
          <Route path="/pago-exito" element={<PagoExito />} />
          <Route path="/pago-fallo" element={<PagoFallo />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="/terminos" element={<Terminos />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
