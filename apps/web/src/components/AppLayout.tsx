import { type ElementType, useState, type FormEvent, useRef, useEffect, useCallback } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileText,
  FileX,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  Package,
  PackagePlus,
  Receipt,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Warehouse,
  Calendar,
  X,
  Zap,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useAuth } from "../lib/auth";
import { useDarkMode } from "../lib/useDarkMode";
import { apiFetch, ApiError } from "../lib/api";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

const NAV_BASE = [
  { to: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { to: "/clientes",     label: "Clientes",     icon: Users },
  { to: "/facturas",      label: "Facturas",      icon: FileText },
  { to: "/notas-credito", label: "Notas crédito", icon: FileX },
  { to: "/notas-debito",  label: "Notas débito",  icon: Receipt },
  { to: "/productos",    label: "Productos",    icon: Package },
  { to: "/contabilidad", label: "Contabilidad", icon: BookOpen },
  { to: "/contabilidad/balance-prueba", label: "Balance de Prueba", icon: TrendingUp },
  { to: "/contabilidad/auxiliares",     label: "Auxiliares",        icon: BookOpen },
];

const NAV_VENTAS = [
  { to: "/cotizaciones", label: "Cotizaciones", icon: ShoppingCart },
  { to: "/remisiones",   label: "Remisiones",   icon: FileText },
];

const NAV_GASTOS = [
  { to: "/gastos", label: "Gastos", icon: Receipt },
  { to: "/proveedores", label: "Proveedores", icon: Truck },
];

const NAV_INVENTARIO = [
  { to: "/bodegas",                      label: "Bodegas",         icon: Warehouse },
  { to: "/inventario",                   label: "Inventario",      icon: Package },
  { to: "/inventario/kardex",            label: "Kardex",          icon: TrendingUp },
  { to: "/inventario/asesor-pedidos",    label: "Asesor de pedidos", icon: ShoppingCart },
];

const NAV_COBRO = [
  { to: "/alertas/cobro", label: "Alertas de cobro", icon: AlertCircle },
];

const NAV_BROTE = [
  { to: "/recurrentes", label: "Recurrentes", icon: CalendarClock },
];

const NAV_COSECHA = [
  { to: "/centros-costos", label: "Centros de costos", icon: Building2, feature: "centros_costos" },
  { to: "/ensamble",       label: "Ensamble",          icon: PackagePlus, feature: "ensamble" },
  { to: "/cartera",        label: "Cartera",            icon: TrendingUp,  feature: "cartera_avanzada" },
];

const CONFIG_BASE = [
  { to: "/configuracion/empresa",  label: "Mi empresa",          icon: Building2 },
  { to: "/configuracion/modulos",  label: "Módulos adicionales",  icon: CreditCard },
  { to: "/retenciones",            label: "Retenciones",         icon: Receipt },
  { to: "/periodos-contables",     label: "Períodos contables",   icon: Calendar },
];
// Ítem DIAN solo visible si la empresa tiene facturación electrónica habilitada
const CONFIG_DIAN = { to: "/configuracion/dian", label: "Resolución DIAN", icon: Settings };

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  urgencia: "alta" | "media" | "baja";
  link: string;
  count?: number;
}

export function AppLayout() {
  const { user, tenant, plan, empresas, logout, isContador, isVendedor, isFundador } = useAuth();
  const { isDark, toggleDark } = useDarkMode(user?.dark_mode);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEmpresaMenu, setShowEmpresaMenu] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const empresaMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // ── Notificaciones inteligentes ──────────────────────────────────────────────
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const cargarNotificaciones = useCallback(() => {
    void apiFetch<Notificacion[]>("/api/notificaciones").then(setNotificaciones).catch(() => {});
  }, []);

  useEffect(() => {
    cargarNotificaciones();
    // Polling cada 5 minutos
    const t = setInterval(cargarNotificaciones, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [cargarNotificaciones]);

  // Cerrar dropdown al hacer clic afuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const notifUrgentes = notificaciones.filter((n) => n.urgencia === "alta").length;

  // Cierra el sidebar en mobile al cambiar de ruta
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (empresaMenuRef.current && !empresaMenuRef.current.contains(e.target as Node)) {
        setShowEmpresaMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [passForm, setPassForm] = useState({ current: "", next: "", confirm: "" });
  const [passError, setPassError] = useState<string | null>(null);
  const [passOk, setPassOk] = useState(false);
  const [passSaving, setPassSaving] = useState(false);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (passForm.next !== passForm.confirm) {
      setPassError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setPassSaving(true);
    setPassError(null);
    try {
      await apiFetch("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ current_password: passForm.current, new_password: passForm.next }),
      });
      setPassOk(true);
      setTimeout(() => { setShowPassword(false); setPassOk(false); setPassForm({ current: "", next: "", confirm: "" }); }, 1500);
    } catch (err) {
      setPassError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setPassSaving(false);
    }
  }

  const active = (to: string) =>
    to === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname.startsWith(to);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Overlay móvil (toca para cerrar sidebar) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col border-r transition-transform duration-200",
          "bg-doravia-surface border-doravia-border",
          "dark:bg-gray-900 dark:border-gray-800",
          "md:relative md:z-auto md:translate-x-0 md:w-56",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Cabecera empresa */}
        <div
          className="relative border-b border-doravia-border dark:border-gray-800 px-4 py-4"
          ref={empresaMenuRef}
        >
          <div className="flex items-center gap-2.5">
            {/* Cerrar sidebar en mobile */}
            <button
              className="md:hidden flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 mr-1"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-gradient-cold text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{tenant?.nombre}</p>
              <div className="flex items-center gap-1">
                <Link to="/mi-plan" className="text-xs text-action hover:text-action-hover flex items-center gap-0.5 w-fit">
                  {plan?.nombre}
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            {empresas.length > 1 && (
              <button
                onClick={() => setShowEmpresaMenu((v) => !v)}
                className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600"
                title="Cambiar empresa"
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${showEmpresaMenu ? "rotate-90" : ""}`} />
              </button>
            )}
          </div>

          {showEmpresaMenu && empresas.length > 1 && (
            <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
              <p className="px-3 py-2 text-xs font-medium text-gray-400 border-b border-gray-100 dark:border-gray-700">Cambiar empresa</p>
              {empresas.map((emp) => (
                <button
                  key={emp.tenant_id}
                  disabled={emp.es_activa || cambiando}
                  onClick={async () => {
                    if (emp.es_activa) return;
                    setCambiando(true);
                    setShowEmpresaMenu(false);
                    try {
                      const data = await apiFetch<{ accessToken: string; refreshToken: string }>(
                        "/api/auth/cambiar-empresa",
                        { method: "POST", body: JSON.stringify({ tenantId: emp.tenant_id }) },
                      );
                      localStorage.setItem("access_token", data.accessToken);
                      localStorage.setItem("refresh_token", data.refreshToken);
                      window.location.href = emp.nit === "0000000001" ? "/contador" : "/dashboard";
                    } catch {
                      setCambiando(false);
                    }
                  }}
                  className={cn(
                    "w-full px-3 py-2.5 text-left text-sm transition-colors",
                    emp.es_activa
                      ? "bg-action/5 text-action font-medium cursor-default"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer",
                  )}
                >
                  <p className="font-medium truncate">{emp.tenant_nombre}</p>
                  <p className="text-xs text-gray-400">{emp.role === "contador" ? "Contador" : emp.role === "admin" ? "Admin" : emp.role}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_BASE.map(({ to, label, icon: Icon }) => {
            if (to.startsWith("/contabilidad") && isVendedor) return null;
            return <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} />;
          })}

          {NAV_VENTAS.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.cotizaciones === true;
            if (!hasFeature && isContador) return null;
            return <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />;
          })}
          {NAV_GASTOS.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.gastos === true;
            if (isVendedor) return null;
            if (!hasFeature && isContador) return null;
            return <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />;
          })}

          <div className="my-2 border-t border-gray-100 dark:border-gray-800" />
          {NAV_INVENTARIO.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.inventario === true;
            if (!hasFeature && isContador) return null;
            return (
              <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />
            );
          })}

          {NAV_COBRO.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.facturacion_ilimitada === true;
            if (!hasFeature && isContador) return null;
            return (
              <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />
            );
          })}

          {!isVendedor && NAV_BROTE.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.facturacion_recurrente === true;
            if (!hasFeature && isContador) return null;
            return (
              <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />
            );
          })}

          {NAV_COSECHA.map(({ to, label, icon: Icon, feature }) => {
            if (isVendedor) return null;
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.[feature] === true;
            if (!hasFeature && isContador) return null;
            return (
              <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />
            );
          })}

          <div className="my-2 border-t border-gray-100 dark:border-gray-800" />

          {(plan?.features as Record<string, boolean> | undefined)?.pos === true && (
            <>
              {!isContador && <NavItem to="/pos/cajas" label="Cajas POS" icon={Monitor} isActive={active("/pos/cajas")} />}
              {!isContador && <NavItem to="/pos/cajeros" label="Cajeros" icon={Users} isActive={active("/pos/cajeros")} />}
              {tenant?.facturacion_electronica && (
                <NavItem to="/pos/cierre-dian" label="Cierre DIAN" icon={Send} isActive={active("/pos/cierre-dian")} />
              )}
            </>
          )}

          {(() => {
            const hasPos = (plan?.features as Record<string, boolean> | undefined)?.pos === true;
            const posUrl = import.meta.env.VITE_POS_URL ?? "http://localhost:5174";
            return hasPos ? (
              <a
                href={`${posUrl}#token=${encodeURIComponent(localStorage.getItem("access_token") ?? "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-accent-blue hover:bg-accent-blue/10 hover:text-accent-blue transition-colors"
              >
                <Monitor className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Punto de venta</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
              </a>
            ) : (isContador || isVendedor) ? null : (
              <span
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 cursor-not-allowed"
                title="Requiere plan con módulo POS"
              >
                <Monitor className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Punto de venta</span>
                <Lock className="h-3 w-3 flex-shrink-0" />
              </span>
            );
          })()}

          <div className="my-2 border-t border-gray-100 dark:border-gray-800" />

          {!isContador && !isVendedor && CONFIG_BASE.map(({ to, label, icon: Icon }) => (
            <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} />
          ))}
          {/* Resolución DIAN solo si la empresa tiene facturación electrónica */}
          {!isContador && !isVendedor && tenant?.facturacion_electronica && (
            <NavItem to={CONFIG_DIAN.to} label={CONFIG_DIAN.label} icon={CONFIG_DIAN.icon} isActive={active(CONFIG_DIAN.to)} />
          )}

          {user?.role === "admin" && (
            <NavItem to="/usuarios" label="Usuarios" icon={UserCog} isActive={active("/usuarios")} />
          )}
          {user?.role === "admin" && (
            <NavItem to="/auditoria" label="Auditoría" icon={ShieldCheck} isActive={active("/auditoria")} />
          )}

          {isFundador && (
            <>
              <div className="my-2 border-t border-gray-100 dark:border-gray-800" />
              <Link
                to="/fundador"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active("/fundador")
                    ? "bg-slate-800 text-amber-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-800 hover:text-amber-400",
                )}
              >
                <Zap className="h-4 w-4 flex-shrink-0" />
                Panel Fundadores
              </Link>
            </>
          )}
        </nav>

        {/* Footer usuario */}
        <div className="border-t border-doravia-border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{user?.nombre}</p>
              <p className="truncate text-xs text-gray-400">{user?.email}</p>
            </div>
            {/* Campana de notificaciones (desktop) */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setShowNotif((v) => !v)}
                className="relative flex-shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Notificaciones"
              >
                <Bell className="h-4 w-4" />
                {notifUrgentes > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {notifUrgentes > 9 ? "9+" : notifUrgentes}
                  </span>
                )}
              </button>
              {showNotif && (
                <div className="absolute bottom-full mb-2 right-0">
                  <NotifDropdown notificaciones={notificaciones} onClose={() => setShowNotif(false)} />
                </div>
              )}
            </div>
            <button
              onClick={toggleDark}
              className="flex-shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title={isDark ? "Modo claro" : "Modo oscuro"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => { setPassError(null); setPassOk(false); setShowPassword(true); }}
              className="flex-shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300"
              title="Cambiar contraseña"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={() => void handleLogout()}
              className="flex-shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar móvil */}
        <div className="flex md:hidden items-center gap-3 border-b border-doravia-border dark:border-gray-800 bg-doravia-surface dark:bg-gray-900 px-4 py-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex-1">{tenant?.nombre}</p>
          {/* Campana de notificaciones (móvil) */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotif((v) => !v)}
              className="relative rounded p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Notificaciones"
            >
              <Bell className="h-4 w-4" />
              {notifUrgentes > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {notifUrgentes > 9 ? "9+" : notifUrgentes}
                </span>
              )}
            </button>
            {showNotif && (
              <NotifDropdown notificaciones={notificaciones} onClose={() => setShowNotif(false)} />
            )}
          </div>
          <button
            onClick={toggleDark}
            className="rounded p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <main className="flex flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Chat de soporte flotante */}
      <SoporteChat />

      {/* Dialog cambio de contraseña */}
      <Dialog open={showPassword} onClose={() => setShowPassword(false)} title="Cambiar contraseña">
        {passOk ? (
          <p className="py-2 text-center text-sm font-medium text-action">
            Contraseña actualizada correctamente.
          </p>
        ) : (
          <form onSubmit={(e) => void handlePasswordSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="curr_pass">Contraseña actual</Label>
              <Input
                id="curr_pass"
                type="password"
                required
                value={passForm.current}
                onChange={(e) => setPassForm((f) => ({ ...f, current: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_pass">Nueva contraseña</Label>
              <Input
                id="new_pass"
                type="password"
                required
                minLength={8}
                value={passForm.next}
                onChange={(e) => setPassForm((f) => ({ ...f, next: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm_pass">Confirmar nueva contraseña</Label>
              <Input
                id="confirm_pass"
                type="password"
                required
                value={passForm.confirm}
                onChange={(e) => setPassForm((f) => ({ ...f, confirm: e.target.value }))}
              />
            </div>
            {passError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{passError}</p>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowPassword(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={passSaving}>
                {passSaving ? "Guardando..." : "Cambiar contraseña"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dropdown de notificaciones inteligentes
// ─────────────────────────────────────────────────────────────

const URGENCIA_COLOR: Record<string, string> = {
  alta:  "text-red-600 bg-red-50 border-red-200",
  media: "text-amber-700 bg-amber-50 border-amber-200",
  baja:  "text-gray-600 bg-gray-50 border-gray-200",
};

const URGENCIA_PUNTO: Record<string, string> = {
  alta:  "bg-red-500",
  media: "bg-amber-400",
  baja:  "bg-gray-400",
};

function NotifDropdown({ notificaciones, onClose }: { notificaciones: Notificacion[]; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="w-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Notificaciones
          {notificaciones.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
              {notificaciones.length}
            </span>
          )}
        </p>
      </div>
      {notificaciones.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Sin alertas activas</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
          {notificaciones.map((n) => (
            <li key={n.id}>
              <button
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => {
                  onClose();
                  void navigate(n.link);
                }}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${URGENCIA_PUNTO[n.urgencia] ?? "bg-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.titulo}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.descripcion}</p>
                  </div>
                  {n.count && n.count > 0 && (
                    <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${URGENCIA_COLOR[n.urgencia] ?? ""}`}>
                      {n.count}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Banner de prueba gratuita
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Chat de soporte IA flotante
// ─────────────────────────────────────────────────────────────
interface ChatMsg { role: "user" | "assistant"; content: string }

function SoporteChat() {
  const [open, setOpen] = useState(false);
  const [mensajes, setMensajes] = useState<ChatMsg[]>([
    { role: "assistant", content: "¡Hola! Soy el asistente de Doravia. ¿En qué te puedo ayudar hoy?" },
  ]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 50);
    }
  }, [open, mensajes]);

  const enviar = useCallback(async () => {
    const texto = input.trim();
    if (!texto || enviando) return;

    const nuevosMensajes: ChatMsg[] = [...mensajes, { role: "user", content: texto }];
    setMensajes(nuevosMensajes);
    setInput("");
    setEnviando(true);

    try {
      const res = await apiFetch<{ respuesta: string }>("/api/soporte/chat", {
        method: "POST",
        body: JSON.stringify({ mensajes: nuevosMensajes }),
      });
      setMensajes((prev) => [...prev, { role: "assistant", content: res.respuesta }]);
    } catch {
      setMensajes((prev) => [
        ...prev,
        { role: "assistant", content: "Hubo un error. Escríbenos a soporte@doraviasoft.com o al WhatsApp +57 312 558 7055." },
      ]);
    } finally {
      setEnviando(false);
    }
  }, [input, mensajes, enviando]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-action text-white shadow-lg hover:bg-action-hover transition-all"
        title="Soporte IA"
        style={{ width: 52, height: 52 }}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-80 sm:w-96 rounded-2xl shadow-2xl bg-white border border-gray-200 flex flex-col overflow-hidden"
          style={{ maxHeight: "70vh" }}
        >
          {/* Header */}
          <div className="bg-action px-4 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Soporte Doravia</p>
              <p className="text-xs text-white/70">Con IA · 24/7</p>
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-action text-white rounded-br-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-2 bg-white flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escribe tu pregunta..."
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/40"
              disabled={enviando}
            />
            <button
              onClick={() => void enviar()}
              disabled={!input.trim() || enviando}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-action text-white disabled:opacity-40 hover:bg-action-hover transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}


function NavItem({
  to,
  label,
  icon: Icon,
  isActive,
  locked = false,
}: {
  to: string;
  label: string;
  icon: ElementType;
  isActive: boolean;
  locked?: boolean;
}) {
  if (locked) {
    return (
      <span
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 dark:text-gray-600 cursor-not-allowed"
        title="Requiere plan Raíz o superior"
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">{label}</span>
        <Lock className="h-3 w-3 flex-shrink-0" />
      </span>
    );
  }

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-action/10 font-medium text-action"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100",
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </Link>
  );
}
