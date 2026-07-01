import { useEffect, useState } from "react";
import { Building2, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { apiFetch, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

interface EmpresaContador {
  acceso_id: string;
  tenant_id: string;
  nombre: string;
  nit: string;
  plan_nombre: string;
  plan_slug: string;
  activo: boolean;
  plan_ends_at: string;
  role: string;
}

interface Comision {
  id: string;
  tenant_nombre: string;
  tipo: "venta_inicial" | "renovacion";
  base_cop: number;
  valor_cop: number;
  porcentaje: string;
  pagada: boolean;
  fecha_pago: string | null;
  created_at: string;
}

interface ComisionesRes {
  comisiones: Comision[];
  pendiente: number;
  pagada_total: number;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

export default function ContadorDashboard() {
  const { user, cambiarEmpresa } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaContador[]>([]);
  const [comisiones, setComisiones] = useState<ComisionesRes | null>(null);
  const [tab, setTab] = useState<"empresas" | "comisiones">("empresas");
  const [loading, setLoading] = useState(true);
  const [cambiando, setCambiando] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<EmpresaContador[]>("/api/contadores/mis-empresas"),
      apiFetch<ComisionesRes>("/api/contadores/mis-comisiones"),
    ]).then(([e, c]) => {
      setEmpresas(e);
      setComisiones(c);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleEntrar(tenantId: string) {
    setCambiando(tenantId);
    try {
      await cambiarEmpresa(tenantId);
      window.location.href = "/dashboard";
    } catch {
      setCambiando(null);
    }
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-action border-t-transparent" />
    </div>
  );

  return (
    <div className="flex-1 space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Panel de contador</h1>
        <p className="text-sm text-gray-500">Hola, {user?.nombre}. Gestiona tus empresas y consulta tus comisiones.</p>
      </div>

      {/* Resumen comisiones */}
      {comisiones && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Comisiones pendientes</p>
              <p className="text-lg font-bold text-gray-900">{cop(comisiones.pendiente)}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Total pagado</p>
              <p className="text-lg font-bold text-gray-900">{cop(comisiones.pagada_total)}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["empresas", "comisiones"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-action text-action" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "empresas" ? `Mis empresas (${empresas.length})` : "Comisiones"}
          </button>
        ))}
      </div>

      {tab === "empresas" && (
        <div className="space-y-3">
          {empresas.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              Aún no tienes empresas asignadas. Cuando una empresa te invite por correo aparecerá aquí.
            </p>
          ) : (
            empresas.map((e) => (
              <Card key={e.acceso_id} className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-action to-action/70 text-white flex-shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{e.nombre}</p>
                  <p className="text-xs text-gray-400">NIT {e.nit} · {e.plan_nombre}</p>
                  <p className="text-xs text-gray-400">Vence: {fmtDate(e.plan_ends_at)}</p>
                </div>
                <Button
                  size="sm"
                  disabled={cambiando === e.tenant_id}
                  onClick={() => void handleEntrar(e.tenant_id)}
                >
                  {cambiando === e.tenant_id ? "Entrando…" : "Entrar →"}
                </Button>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "comisiones" && (
        <div className="space-y-2">
          {!comisiones?.comisiones.length ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              Tus comisiones aparecerán aquí cuando las empresas que referiste realicen pagos.
            </p>
          ) : (
            comisiones.comisiones.map((c) => (
              <Card key={c.id} className="p-4 flex items-center gap-4">
                <TrendingUp className={`h-5 w-5 flex-shrink-0 ${c.pagada ? "text-green-500" : "text-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{c.tenant_nombre}</p>
                  <p className="text-xs text-gray-400">
                    {c.tipo === "venta_inicial" ? "Venta inicial" : "Renovación"} · {c.porcentaje}% de {cop(c.base_cop)} · {fmtDate(c.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{cop(c.valor_cop)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.pagada ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {c.pagada ? "Pagada" : "Pendiente"}
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
