import { type ElementType, useState, type FormEvent } from "react";
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
  Monitor,
  Package,
  PackagePlus,
  Receipt,
  Send,
  Settings,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
  Warehouse,
  Calendar,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useAuth } from "../lib/auth";
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
];

// Ítems que requieren feature "cotizaciones" (Semilla+)
const NAV_VENTAS = [
  { to: "/cotizaciones", label: "Cotizaciones", icon: ShoppingCart },
];

// Ítems que requieren feature "gastos" (Semilla+)
const NAV_GASTOS = [
  { to: "/gastos", label: "Gastos", icon: Receipt },
];

// Ítems que requieren feature "inventario" (Raíz y superior)
const NAV_INVENTARIO = [
  { to: "/bodegas",           label: "Bodegas",    icon: Warehouse },
  { to: "/inventario",        label: "Inventario", icon: Package },
  { to: "/inventario/kardex", label: "Kardex",     icon: TrendingUp },
];

// Ítems que requieren facturacion_ilimitada (Raíz y superior)
const NAV_COBRO = [
  { to: "/alertas/cobro", label: "Alertas de cobro", icon: AlertCircle },
];

// Ítems que requieren facturacion_recurrente (Brote y superior)
const NAV_BROTE = [
  { to: "/recurrentes", label: "Recurrentes", icon: CalendarClock },
];

// Ítems exclusivos de Cosecha
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
  const { user, tenant, plan, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        {/* Cabecera empresa */}
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-green-600 text-white">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{tenant?.nombre}</p>
            <Link to="/planes" className="text-xs text-green-600 hover:text-green-800 flex items-center gap-0.5 w-fit">
              {plan?.nombre}
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_BASE.map(({ to, label, icon: Icon }) => (
            <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} />
          ))}

          {/* Cotizaciones y Gastos: Semilla+ */}
          {NAV_VENTAS.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.cotizaciones === true;
            return <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />;
          })}
          {NAV_GASTOS.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.gastos === true;
            return <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />;
          })}

          {/* Sección inventario: visible para todos, bloqueada si no tiene el feature */}
          <div className="my-2 border-t border-gray-100" />
          {NAV_INVENTARIO.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.inventario === true;
            return (
              <NavItem
                key={to}
                to={to}
                label={label}
                icon={Icon}
                isActive={active(to)}
                locked={!hasFeature}
              />
            );
          })}

          {/* Alertas de cobro: requiere Raíz+ */}
          {NAV_COBRO.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.facturacion_ilimitada === true;
            return (
              <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />
            );
          })}

          {/* Recurrentes: requiere Brote+ */}
          {NAV_BROTE.map(({ to, label, icon: Icon }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.facturacion_recurrente === true;
            return (
              <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />
            );
          })}

          {/* Módulos Cosecha */}
          {NAV_COSECHA.map(({ to, label, icon: Icon, feature }) => {
            const hasFeature = (plan?.features as Record<string, boolean> | undefined)?.[feature] === true;
            return (
              <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} locked={!hasFeature} />
            );
          })}

          <div className="my-2 border-t border-gray-100" />

          {/* Admin de cajas y cierre DIAN — solo si tiene POS */}
          {(plan?.features as Record<string, boolean> | undefined)?.pos === true && (
            <>
              <NavItem to="/pos/cajas"       label="Cajas POS"    icon={Monitor}   isActive={active("/pos/cajas")} />
              <NavItem to="/pos/cierre-dian" label="Cierre DIAN"  icon={Send}      isActive={active("/pos/cierre-dian")} />
            </>
          )}

          {/* Botón POS — abre la app de POS en nueva pestaña con el token */}
          {(() => {
            const hasPos = (plan?.features as Record<string, boolean> | undefined)?.pos === true;
            const posUrl = import.meta.env.VITE_POS_URL ?? "http://localhost:5174";
            return hasPos ? (
              <a
                href={`${posUrl}?token=${encodeURIComponent(localStorage.getItem("access_token") ?? "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors"
              >
                <Monitor className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Punto de venta</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
              </a>
            ) : (
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

          <div className="my-2 border-t border-gray-100" />

          {CONFIG.map(({ to, label, icon: Icon }) => (
            <NavItem key={to} to={to} label={label} icon={Icon} isActive={active(to)} />
          ))}

          {user?.role === "admin" && (
            <NavItem to="/usuarios" label="Usuarios" icon={UserCog} isActive={active("/usuarios")} />
          )}
        </nav>

        {/* Footer usuario */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{user?.nombre}</p>
              <p className="truncate text-xs text-gray-400">{user?.email}</p>
            </div>
            <button
              onClick={() => { setPassError(null); setPassOk(false); setShowPassword(true); }}
              className="flex-shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Cambiar contraseña"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={() => void handleLogout()}
              className="flex-shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Dialog cambio de contraseña */}
      <Dialog open={showPassword} onClose={() => setShowPassword(false)} title="Cambiar contraseña">
        {passOk ? (
          <p className="py-2 text-center text-sm font-medium text-green-700">
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

      {/* Área principal */}
      <main className="flex flex-1 flex-col overflow-auto">
        <Outlet />
      </main>
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
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-300 cursor-not-allowed"
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
          ? "bg-green-50 font-medium text-green-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </Link>
  );
}
