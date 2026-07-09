import { useEffect, useState } from "react";
import {
  Calendar, BarChart2, Settings, ChevronLeft, ChevronRight,
  MessageCircle, AlertCircle, CheckCircle2, Clock, PawPrint,
  Scissors, User, TrendingDown, Save, Phone,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { HelpTooltip } from "../components/HelpTooltip";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/cn";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoCita =
  | "agendada" | "confirmada" | "en_atencion" | "lista_entrega"
  | "entregada_cobrada" | "no_show" | "cancelada";

interface Cita {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  sujeto_nombre: string | null;
  fecha_hora: string;
  servicio: string;
  profesional: string | null;
  duracion_min: number | null;
  estado: EstadoCita;
  recordatorio_enviado_at: string | null;
}

interface ConfigAgenda {
  sujeto_label: string | null;
  citas_visible: boolean;
}

interface Reportes {
  periodo: { desde: string; hasta: string };
  total: number;
  atendidas: number;
  no_shows: number;
  canceladas: number;
  tasa_no_show: number;
  ingresos_citas: number;
  por_estado: { estado: string; cantidad: number }[];
  sujetos_sin_visita: {
    id: string; nombre: string; tipo_notas: string | null;
    ultima_visita: string | null; dias_sin_visita: number;
  }[];
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ESTADO_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  agendada:          { label: "Agendada",           variant: "outline" },
  confirmada:        { label: "Confirmada",          variant: "default" },
  en_atencion:       { label: "En atención",         variant: "secondary" },
  lista_entrega:     { label: "Lista para entregar", variant: "secondary" },
  entregada_cobrada: { label: "Entregada / Cobrada", variant: "default" },
  no_show:           { label: "No show",             variant: "destructive" },
  cancelada:         { label: "Cancelada",           variant: "destructive" },
};

const ESTADO_DOT: Record<string, string> = {
  agendada:          "bg-blue-400",
  confirmada:        "bg-indigo-400",
  en_atencion:       "bg-amber-400",
  lista_entrega:     "bg-orange-400",
  entregada_cobrada: "bg-emerald-400",
  no_show:           "bg-gray-400",
  cancelada:         "bg-red-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function formatHora(fechaHora: string) {
  return new Date(fechaHora).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatFechaCorta(fechaStr: string) {
  const d = new Date(fechaStr + "T12:00:00");
  return d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

function inicioSemana(ref: Date) {
  const d = new Date(ref);
  const dow = d.getDay(); // 0=dom
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// ── Componente principal ──────────────────────────────────────────────────────

type Tab = "agenda" | "reportes" | "config";

export default function AgendaServicios() {
  const { isContador } = useAuth();
  const [tab, setTab] = useState<Tab>("agenda");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Agenda de servicios</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Gestión de citas, ciclo de atención y reportes de no-show
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {(["agenda", "reportes", ...(!isContador ? ["config"] : [])] as Tab[]).map((t) => {
            const labels: Record<Tab, string> = {
              agenda: "Agenda semanal",
              reportes: "Reportes",
              config: "Configuración",
            };
            const icons: Record<Tab, React.ReactNode> = {
              agenda: <Calendar className="h-4 w-4" />,
              reportes: <BarChart2 className="h-4 w-4" />,
              config: <Settings className="h-4 w-4" />,
            };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  tab === t
                    ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                {icons[t]}
                {labels[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-hidden">
        {tab === "agenda"   && <TabAgenda />}
        {tab === "reportes" && <TabReportes />}
        {tab === "config"   && !isContador && <TabConfig />}
      </div>
    </div>
  );
}

// ── Tab: Agenda semanal ───────────────────────────────────────────────────────

function TabAgenda() {
  const [semana, setSemana] = useState(() => inicioSemana(new Date()));
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);

  const desde = isoDate(semana);
  const finSemana = new Date(semana);
  finSemana.setDate(finSemana.getDate() + 6);
  const hasta = isoDate(finSemana);

  useEffect(() => {
    void cargar();
  }, [semana]);

  async function cargar() {
    setLoading(true);
    try {
      const data = await apiFetch<Cita[]>(`/api/agenda/citas?desde=${desde}&hasta=${hasta}`);
      setCitas(data);
    } finally { setLoading(false); }
  }

  function navSemana(delta: number) {
    setSemana((s) => {
      const n = new Date(s);
      n.setDate(n.getDate() + delta * 7);
      return n;
    });
  }

  const dias: { fecha: string; label: string; citas: Cita[] }[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(semana);
    d.setDate(d.getDate() + i);
    const f = isoDate(d);
    return {
      fecha: f,
      label: formatFechaCorta(f),
      citas: citas.filter((c) => c.fecha_hora.startsWith(f)),
    };
  });

  const hoyStr = isoDate(new Date());

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Nav semana */}
      <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-shrink-0 bg-white dark:bg-gray-950">
        <button onClick={() => navSemana(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
          {formatFechaCorta(desde)} — {formatFechaCorta(hasta)}
        </span>
        <button onClick={() => navSemana(1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => setSemana(inicioSemana(new Date()))}
          className="text-xs text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-lg px-2 py-1"
        >
          Esta semana
        </button>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-600">
          {citas.length} cita{citas.length !== 1 ? "s" : ""} esta semana
        </span>
      </div>

      {/* Grid de días */}
      {loading ? (
        <p className="text-center text-gray-400 dark:text-gray-600 py-16 text-sm">Cargando agenda...</p>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-7 gap-2 min-w-[900px]">
            {dias.map(({ fecha, label, citas: citasDia }) => (
              <div
                key={fecha}
                className={cn(
                  "rounded-xl border min-h-[200px] flex flex-col",
                  fecha === hoyStr
                    ? "border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-950/20"
                    : "border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
                )}
              >
                <div className={cn(
                  "px-2 py-1.5 text-xs font-semibold rounded-t-xl border-b",
                  fecha === hoyStr
                    ? "text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800 bg-violet-100/50 dark:bg-violet-900/30"
                    : "text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-800"
                )}>
                  {label}
                  {fecha === hoyStr && <span className="ml-1 text-violet-500">· hoy</span>}
                </div>
                <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto">
                  {citasDia.length === 0 ? (
                    <p className="text-xs text-gray-300 dark:text-gray-700 text-center mt-4">—</p>
                  ) : (
                    citasDia.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-1.5 text-xs shadow-sm"
                      >
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", ESTADO_DOT[c.estado] ?? "bg-gray-400")} />
                          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {formatHora(c.fecha_hora)} {c.cliente_nombre}
                          </span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                          <Scissors className="h-2.5 w-2.5 flex-shrink-0" />
                          {c.servicio}
                        </p>
                        {c.sujeto_nombre && (
                          <p className="text-violet-500 dark:text-violet-400 truncate flex items-center gap-1 mt-0.5">
                            <PawPrint className="h-2.5 w-2.5 flex-shrink-0" />
                            {c.sujeto_nombre}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Reportes ─────────────────────────────────────────────────────────────

function TabReportes() {
  const hoy = isoDate(new Date());
  const hace30 = isoDate(new Date(Date.now() - 30 * 86_400_000));
  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);
  const [diasSinVisita, setDiasSinVisita] = useState("30");
  const [reporte, setReporte] = useState<Reportes | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { void cargar(); }, []);

  async function cargar() {
    setLoading(true);
    try {
      const data = await apiFetch<Reportes>(
        `/api/agenda/reportes?desde=${desde}&hasta=${hasta}&dias_sin_visita=${diasSinVisita}`
      );
      setReporte(data);
    } finally { setLoading(false); }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>Sujetos sin visita hace (días)</Label>
              <Input
                type="number" min="1" value={diasSinVisita}
                onChange={(e) => setDiasSinVisita(e.target.value)}
                className="w-24"
              />
            </div>
            <Button onClick={() => void cargar()} disabled={loading}>
              {loading ? "Cargando..." : "Consultar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {reporte && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Total citas"
              value={reporte.total}
              icon={<Calendar className="h-5 w-5 text-violet-500" />}
            />
            <KpiCard
              label="Atendidas"
              value={reporte.atendidas}
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            />
            <KpiCard
              label="No-shows"
              labelExtra={<HelpTooltip text="Cliente que tenía cita agendada y no se presentó sin avisar. Una tasa de no-show superior al 15% suele indicar que hay que mejorar los recordatorios." side="bottom" />}
              value={reporte.no_shows}
              extra={`${reporte.tasa_no_show}% del total`}
              highlight={reporte.tasa_no_show >= 15}
              icon={<AlertCircle className="h-5 w-5 text-red-400" />}
            />
            <KpiCard
              label="Ingresos por citas"
              value={cop(reporte.ingresos_citas)}
              icon={<TrendingDown className="h-5 w-5 text-blue-500" />}
            />
          </div>

          {/* Por estado */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribución por estado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {reporte.por_estado.map((s) => (
                  <div key={s.estado} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <span className={cn("w-2.5 h-2.5 rounded-full", ESTADO_DOT[s.estado] ?? "bg-gray-400")} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {ESTADO_META[s.estado]?.label ?? s.estado}
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{s.cantidad}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sujetos sin visita */}
          {reporte.sujetos_sin_visita.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PawPrint className="h-4 w-4 text-violet-500" />
                  Sujetos sin visita hace más de {diasSinVisita} días
                  <HelpTooltip text="'Sujeto' es lo que trae el cliente al servicio: su mascota, vehículo, prenda, etc. Esta lista muestra sujetos que llevan mucho tiempo sin volver — útil para campañas de reactivación." side="bottom" />
                  <Badge variant="secondary">{reporte.sujetos_sin_visita.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reporte.sujetos_sin_visita.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0 dark:border-gray-800">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{s.nombre}</p>
                        {s.tipo_notas && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{s.tipo_notas}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {s.dias_sin_visita === -1 ? "Nunca visitado" : `${s.dias_sin_visita} días`}
                        </p>
                        {s.ultima_visita && (
                          <p className="text-xs text-gray-400 dark:text-gray-600">
                            Último: {new Date(s.ultima_visita).toLocaleDateString("es-CO")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab: Configuración ────────────────────────────────────────────────────────

function TabConfig() {
  const [config, setConfig] = useState<ConfigAgenda | null>(null);
  const [sujetoLabel, setSujetoLabel] = useState("");
  const [citasVisible, setCitasVisible] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<ConfigAgenda>("/api/agenda/config").then((c) => {
      setConfig(c);
      setSujetoLabel(c.sujeto_label ?? "");
      setCitasVisible(c.citas_visible);
    });
  }, []);

  async function guardar() {
    setGuardando(true);
    setOk(false);
    setError(null);
    try {
      await apiFetch("/api/agenda/config", {
        method: "PATCH",
        body: JSON.stringify({
          sujeto_label: sujetoLabel.trim() || null,
          citas_visible: citasVisible,
        }),
      });
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally { setGuardando(false); }
  }

  if (!config) return <p className="p-6 text-gray-400 text-sm">Cargando configuración...</p>;

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuración de la agenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sujeto label */}
          <div className="space-y-2">
            <Label>Nombre del sujeto del servicio</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Define cómo se llama el sujeto en tu negocio. Ej: «Mascota» para pet shops, «Vehículo»
              para talleres, «Prenda» para lavanderías. Déjalo en blanco si tu negocio no tiene sujeto
              (ej: barbería, spa).
            </p>
            <Input
              value={sujetoLabel}
              onChange={(e) => setSujetoLabel(e.target.value)}
              placeholder="Ej: Mascota, Vehículo, Prenda... (opcional)"
              maxLength={50}
            />
            {sujetoLabel && (
              <p className="text-xs text-violet-600 dark:text-violet-400">
                En el POS aparecerá: <strong>{sujetoLabel}</strong>
              </p>
            )}
          </div>

          {/* Citas visible en POS */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Mostrar agenda en el POS</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Activa o desactiva el módulo de agenda en la aplicación POS para tus cajeros.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCitasVisible((v) => !v)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                citasVisible ? "bg-violet-600" : "bg-gray-200 dark:bg-gray-700"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                citasVisible ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          {ok && (
            <p className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              Configuración guardada correctamente.
            </p>
          )}

          <Button onClick={() => void guardar()} disabled={guardando} className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({
  label, labelExtra, value, extra, highlight, icon,
}: {
  label: string;
  labelExtra?: React.ReactNode;
  value: string | number;
  extra?: string;
  highlight?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card className={cn(highlight && "border-red-300 dark:border-red-700")}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">{label}{labelExtra}</p>
            <p className={cn(
              "text-2xl font-bold",
              highlight ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"
            )}>
              {value}
            </p>
            {extra && (
              <p className={cn(
                "text-xs mt-1",
                highlight ? "text-red-500 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-gray-600"
              )}>
                {extra}
              </p>
            )}
          </div>
          <div className="flex-shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
