import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, ShieldOff, Calendar, PawPrint, Scissors, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetch, cop, fecha } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/cn";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ClienteDetalle {
  id: string;
  tipo_persona: string;
  tipo_documento: string;
  numero_documento: string;
  digito_verificacion: string | null;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  municipio: string | null;
  departamento: string | null;
  historial: {
    id: string;
    numero: string;
    fecha_emision: string;
    estado: string;
    total: string;
  }[];
}

interface CitaHistorial {
  id: string;
  cliente_nombre: string;
  sujeto_nombre: string | null;
  fecha_hora: string;
  servicio: string;
  profesional: string | null;
  estado: string;
  venta_pos_id: string | null;
}

// ── Badges ────────────────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  aceptada: "green", borrador: "yellow", rechazada: "red", anulada: "gray", enviada: "blue",
};

const CITA_DOT: Record<string, string> = {
  agendada:          "bg-blue-400",
  confirmada:        "bg-indigo-400",
  en_atencion:       "bg-amber-400",
  lista_entrega:     "bg-orange-400",
  entregada_cobrada: "bg-emerald-400",
  no_show:           "bg-gray-400",
  cancelada:         "bg-red-400",
};

const CITA_LABEL: Record<string, string> = {
  agendada:          "Agendada",
  confirmada:        "Confirmada",
  en_atencion:       "En atención",
  lista_entrega:     "Lista para entregar",
  entregada_cobrada: "Entregada / Cobrada",
  no_show:           "No show",
  cancelada:         "Cancelada",
};

// ── Componente ────────────────────────────────────────────────────────────────

export function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, plan } = useAuth();
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [anonimizando, setAnonimizando] = useState(false);
  const [tab, setTab] = useState<"facturas" | "citas">("facturas");
  const [citas, setCitas] = useState<CitaHistorial[]>([]);
  const [citasLoading, setCitasLoading] = useState(false);

  const tieneAgenda = (plan?.features as Record<string, boolean> | undefined)?.agenda_servicios === true;

  async function handleAnonimizar() {
    if (!confirm("¿Confirmas que deseas anonimizar los datos personales de este cliente? Esta acción no se puede deshacer. Los registros fiscales (número de documento, facturas) se conservan por obligación legal.")) return;
    setAnonimizando(true);
    try {
      await apiFetch(`/api/clientes/${id!}/anonimizar`, { method: "DELETE" });
      navigate("/clientes", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al anonimizar.";
      alert(msg);
    } finally {
      setAnonimizando(false);
    }
  }

  useEffect(() => {
    void apiFetch<ClienteDetalle>(`/api/clientes/${id!}`)
      .then(setCliente)
      .catch(() => navigate("/clientes", { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (tab === "citas" && tieneAgenda && id) {
      setCitasLoading(true);
      void apiFetch<CitaHistorial[]>(`/api/agenda/citas?cliente_id=${id}`)
        .then(setCitas)
        .catch(() => setCitas([]))
        .finally(() => setCitasLoading(false));
    }
  }, [tab, tieneAgenda, id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!cliente) return null;

  const totalFacturado = cliente.historial
    .filter((f) => f.estado === "aceptada")
    .reduce((s, f) => s + Number(f.total), 0);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{cliente.nombre}</h1>
        </div>
        {user?.role === "admin" && cliente.nombre !== "DATOS ELIMINADOS" && (
          <Button
            variant="secondary"
            onClick={() => void handleAnonimizar()}
            disabled={anonimizando}
            className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
          >
            <ShieldOff className="h-4 w-4" />
            {anonimizando ? "Anonimizando..." : "Anonimizar datos (Ley 1581)"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Datos del cliente */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Información</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Tipo" value={cliente.tipo_persona === "natural" ? "Persona natural" : "Persona jurídica"} />
            <Row
              label={cliente.tipo_documento}
              value={
                cliente.tipo_documento === "NIT" && cliente.digito_verificacion
                  ? `${cliente.numero_documento}-${cliente.digito_verificacion}`
                  : cliente.numero_documento
              }
            />
            {cliente.correo && <Row label="Correo" value={cliente.correo} />}
            {cliente.telefono && <Row label="Teléfono" value={cliente.telefono} />}
            {cliente.direccion && <Row label="Dirección" value={cliente.direccion} />}
            {cliente.municipio && (
              <Row
                label="Ubicación"
                value={[cliente.municipio, cliente.departamento].filter(Boolean).join(", ")}
              />
            )}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <Row label="Total facturado" value={cop(totalFacturado)} bold />
            </div>
          </CardContent>
        </Card>

        {/* Panel derecho con tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab("facturas")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                tab === "facturas"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <FileText className="h-4 w-4" />
              Facturas
            </button>
            {tieneAgenda && (
              <button
                onClick={() => setTab("citas")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  tab === "citas"
                    ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                <Calendar className="h-4 w-4" />
                Historial de citas
              </button>
            )}
          </div>

          {/* Tab: Facturas */}
          {tab === "facturas" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  Historial de facturas
                </CardTitle>
                <Link
                  to={`/facturas/nueva?cliente_id=${cliente.id}`}
                  className="text-xs font-medium text-green-600 hover:underline"
                >
                  + Nueva factura
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {cliente.historial.length === 0 ? (
                  <p className="px-6 py-6 text-center text-sm text-gray-400">
                    Sin facturas registradas.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-6 py-3 text-left font-medium text-gray-500">Número</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                        <th className="px-6 py-3 text-left font-medium text-gray-500">Estado</th>
                        <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {cliente.historial.map((f) => (
                        <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                          <td className="px-6 py-3">
                            <Link
                              to={`/facturas/${f.id}`}
                              className="font-medium text-green-700 dark:text-green-400 hover:underline"
                            >
                              {f.numero}
                            </Link>
                          </td>
                          <td className="px-6 py-3 text-gray-600 dark:text-gray-400">{fecha(f.fecha_emision)}</td>
                          <td className="px-6 py-3">
                            <Badge variant={ESTADO_BADGE[f.estado] ?? "gray"}>{f.estado}</Badge>
                          </td>
                          <td className="px-6 py-3 text-right font-medium dark:text-gray-200">{cop(f.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab: Historial de citas */}
          {tab === "citas" && tieneAgenda && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-violet-500" />
                  Historial de citas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {citasLoading ? (
                  <p className="px-6 py-6 text-center text-sm text-gray-400">Cargando citas...</p>
                ) : citas.length === 0 ? (
                  <p className="px-6 py-6 text-center text-sm text-gray-400">Sin citas registradas.</p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {citas.map((c) => (
                      <div key={c.id} className="px-6 py-3 flex items-center gap-3">
                        <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", CITA_DOT[c.estado] ?? "bg-gray-400")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                              {new Date(c.fecha_hora).toLocaleDateString("es-CO", {
                                day: "numeric", month: "short", year: "numeric",
                              })}
                              {" "}
                              {new Date(c.fecha_hora).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <Scissors className="h-3 w-3" />
                              {c.servicio}
                            </span>
                            {c.sujeto_nombre && (
                              <span className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
                                <PawPrint className="h-3 w-3" />
                                {c.sujeto_nombre}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {CITA_LABEL[c.estado] ?? c.estado}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className={cn(bold ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}>
        {value}
      </p>
    </div>
  );
}
