import { type ElementType, useState, type FormEvent, useRef, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
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
  { to: "/productos",    label: "Productos",    icon: Package },
  { to: "/contabilidad", label: "Contabilidad", icon: BookOpen },
  { to: "/contabilidad/balance-prueba", label: "Balance de Prueba", icon: TrendingUp },
  { to: "/contabilidad/auxiliares",     label: "Auxiliares",        icon: BookOpen },
];

const NAV_VENTAS = [
  { to: "/cotizaciones", label: "Cotizaciones", icon: ShoppingCart },
];

const NAV_GASTOS = [
  { to: "/gastos", label: "Gastos", icon: Receipt },
];

const NAV_INVENTARIO = [
  { to: "/bodegas",           label: "Bodegas",    icon: Warehouse },
  { to: "/inventario",        label: "Inventario", icon: Package },
  { to: "/inventario/kardex", label: "Kardex",     icon: TrendingUp },
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

const CONFIG = [
  { to: "/configuracion/empresa",  label: "Mi empresa",          icon: Building2 },
  { to: "/configuracion/modulos",  label: "Módulos adicionales",  icon: CreditCard },
  { to: "/configuracion/dian",     label: "Resolución DIAN",     icon: Settings },
  { to: "/retenciones",            label: "Retenciones",         icon: Receipt },
  { to: "/periodos-contables",     label: "Períodos contables",   icon: Calendar },
];

export function AppLayout() {
  const { user, tenant, plan, empresas, logout, isContador, isVendedor, isFundador, cambiarEmpresa } = useAuth();
  const { isDark, toggleDark } = useDarkMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEmpresaMenu, setShowEmpresaMenu] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const empresaMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

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
              <Link to="/planes" className="text-xs text-action hover:text-action-hover flex items-center gap-0.5 w-fit">
                {plan?.nombre}
                <ChevronRight className="w-3 h-3" />
              </Link>
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
                      await cambiarEmpresa(emp.tenant_id);
                      navigate("/dashboard", { replace: true });
                    } finally {
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
              <NavItem to="/pos/cierre-dian" label="Cierre DIAN"  icon={Send}      isActive={active("/pos/cierre-dian")} />
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

          {!isContador && !isVendedor && CONFIG.map(({ to, label, icon: Icon }) => (
            <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} />
          ))}

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
