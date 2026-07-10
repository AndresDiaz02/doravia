import { useEffect, useState, useRef, type FormEvent } from "react";
import {
  Plus, X, Clock, User, Scissors, ChevronLeft, ChevronRight,
  Pencil, MessageCircle, AlertCircle, Phone, CheckCircle2,
  ShoppingCart, PawPrint, Loader2, LogIn, Users2, Trash2,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";

// ── Tipos ────────────────────────────────────────────────────────────────────

type EstadoCita =
  | "agendada" | "confirmada" | "en_atencion" | "lista_entrega"
  | "entregada_cobrada" | "no_show" | "cancelada";

interface Cita {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_id: string | null;
  sujeto_id: string | null;
  sujeto_nombre: string | null;
  sujeto_tipo_notas: string | null;
  fecha_hora: string;
  servicio: string;
  profesional: string | null;
  profesional_id: string | null;
  duracion_min: number | null;
  notas: string | null;
  estado: EstadoCita;
  llegada_at: string | null;
  listo_at: string | null;
  recordatorio_enviado_at: string | null;
  venta_pos_id: string | null;
}

interface ConfigAgenda {
  sujeto_label: string | null;
  citas_visible: boolean;
}

interface Profesional {
  id: string;
  nombre: string;
  especialidad: string | null;
  telefono: string | null;
  color: string;
  activo: boolean;
}

interface HorarioDia {
  id?: string;
  profesional_id?: string;
  dia_semana: number;
  activo: boolean;
  hora_inicio: string;
  hora_fin: string;
}

interface Bloqueo {
  id: string;
  profesional_id: string;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
}

interface SlotDisponibilidad {
  hora: string;
  disponible: boolean;
}

interface DisponibilidadProf {
  profesional: Profesional;
  libre: boolean;
  slots: SlotDisponibilidad[];
  motivo?: string;
}

// ── Config de estados ─────────────────────────────────────────────────────────

const ESTADO_META: Record<EstadoCita, { label: string; color: string; dot: string; pill: string }> = {
  agendada:           { label: "Agendada",           color: "bg-blue-50 text-blue-700",       dot: "bg-blue-400",    pill: "border-blue-200 text-blue-700" },
  confirmada:         { label: "Confirmada",          color: "bg-indigo-50 text-indigo-700",   dot: "bg-indigo-400",  pill: "border-indigo-200 text-indigo-700" },
  en_atencion:        { label: "En atención",         color: "bg-amber-50 text-amber-700",     dot: "bg-amber-400",   pill: "border-amber-200 text-amber-700" },
  lista_entrega:      { label: "Lista para entregar", color: "bg-orange-50 text-orange-700",   dot: "bg-orange-400",  pill: "border-orange-200 text-orange-700" },
  entregada_cobrada:  { label: "Entregada / Cobrada", color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-400", pill: "border-emerald-200 text-emerald-700" },
  no_show:            { label: "No show",             color: "bg-gray-100 text-gray-500",      dot: "bg-gray-400",    pill: "border-gray-200 text-gray-500" },
  cancelada:          { label: "Cancelada",           color: "bg-red-50 text-red-600",         dot: "bg-red-400",     pill: "border-red-200 text-red-600" },
};

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHora(fechaHora: string) {
  return new Date(fechaHora).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}
function formatFecha(d: Date) {
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function esFinalizado(estado: EstadoCita) {
  return estado === "entregada_cobrada" || estado === "no_show" || estado === "cancelada";
}

// ── Constante form vacío ──────────────────────────────────────────────────────

const FORM_EMPTY = {
  cliente_nombre: "", cliente_telefono: "", fecha: isoDate(new Date()), hora: "09:00",
  servicio: "", profesional: "", profesional_id: "", duracion_min: "30", notas: "",
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function Citas({
  cajaId,
  onIrAVenta,
}: {
  cajaId: string;
  onIrAVenta?: () => void;
}) {
  const [fecha, setFecha] = useState(new Date());
  const [citas, setCitas] = useState<Cita[]>([]);
  const [config, setConfig] = useState<ConfigAgenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Cita | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...FORM_EMPTY });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

  // ── Estado profesionales ──────────────────────────────────────────────────
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadProf[]>([]);
  const [loadingDisponibilidad, setLoadingDisponibilidad] = useState(false);
  const disponibilidadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Estado vista admin ────────────────────────────────────────────────────
  const [vistaAdmin, setVistaAdmin] = useState<"profesionales" | null>(null);
  const [tabAdmin, setTabAdmin] = useState<"equipo" | "horario">("equipo");
  const [profSeleccionado, setProfSeleccionado] = useState<Profesional | null>(null);
  const [horarios, setHorarios] = useState<HorarioDia[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [mesBloqueos, setMesBloqueos] = useState(isoDate(new Date()).slice(0, 7));
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const [showFormProf, setShowFormProf] = useState(false);
  const [editandoProf, setEditandoProf] = useState<Profesional | null>(null);
  const [formProf, setFormProf] = useState({ nombre: "", especialidad: "", telefono: "", color: "#6366F1" });
  const [guardandoProf, setGuardandoProf] = useState(false);

  useEffect(() => { void cargarConfig(); void cargarProfesionales(); }, []);
  useEffect(() => { void cargar(); }, [fecha]);

  // Cargar disponibilidad con debounce cuando cambia fecha u hora en el form
  useEffect(() => {
    if (!showForm) return;
    if (disponibilidadTimerRef.current) clearTimeout(disponibilidadTimerRef.current);
    disponibilidadTimerRef.current = setTimeout(() => {
      void fetchDisponibilidad(form.fecha, form.hora, Number(form.duracion_min) || 30);
    }, 300);
    return () => {
      if (disponibilidadTimerRef.current) clearTimeout(disponibilidadTimerRef.current);
    };
  }, [form.fecha, form.hora, form.duracion_min, showForm]);

  async function cargarConfig() {
    try {
      const c = await apiFetch<ConfigAgenda>("/api/agenda/config");
      setConfig(c);
    } catch { /* si falla config, sigue sin sujeto_label */ }
  }

  async function cargarProfesionales() {
    try {
      const data = await apiFetch<Profesional[]>("/api/agenda/profesionales");
      setProfesionales(data);
    } catch { /* si falla, la lista queda vacía */ }
  }

  async function fetchDisponibilidad(f: string, _h: string, duracion: number) {
    if (profesionales.length === 0) return;
    setLoadingDisponibilidad(true);
    try {
      const data = await apiFetch<DisponibilidadProf[]>(
        `/api/agenda/disponibilidad?fecha=${f}&duracion=${duracion}`
      );
      setDisponibilidad(data);
    } catch {
      setDisponibilidad([]);
    } finally {
      setLoadingDisponibilidad(false);
    }
  }

  async function cargar() {
    setLoading(true);
    try {
      const data = await apiFetch<Cita[]>(`/api/agenda/citas?fecha=${isoDate(fecha)}`);
      setCitas(data);
    } finally { setLoading(false); }
  }

  function abrirNueva() {
    setEditando(null);
    setForm({ ...FORM_EMPTY, fecha: isoDate(fecha) });
    setDisponibilidad([]);
    setError(null);
    setShowForm(true);
  }

  function abrirEditar(c: Cita) {
    const dt = new Date(c.fecha_hora);
    setEditando(c);
    setForm({
      cliente_nombre: c.cliente_nombre,
      cliente_telefono: c.cliente_telefono ?? "",
      fecha: isoDate(dt),
      hora: dt.toTimeString().slice(0, 5),
      servicio: c.servicio,
      profesional: c.profesional ?? "",
      profesional_id: c.profesional_id ?? "",
      duracion_min: String(c.duracion_min ?? 30),
      notas: c.notas ?? "",
    });
    setDisponibilidad([]);
    setError(null);
    setShowForm(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!form.cliente_nombre.trim()) { setError("Nombre del cliente requerido."); return; }
    if (!form.servicio.trim()) { setError("Servicio requerido."); return; }
    setGuardando(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_telefono: form.cliente_telefono.trim() || undefined,
        fecha_hora: `${form.fecha}T${form.hora}:00`,
        servicio: form.servicio.trim(),
        profesional: form.profesional.trim() || undefined,
        profesional_id: form.profesional_id || undefined,
        duracion_min: Number(form.duracion_min) || 30,
        notas: form.notas.trim() || undefined,
        caja_id: cajaId,
      };
      if (editando) {
        await apiFetch(`/api/agenda/citas/${editando.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/agenda/citas", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      setEditando(null);
      void cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally { setGuardando(false); }
  }

  async function cambiarEstado(cita: Cita, nuevoEstado: EstadoCita, extra?: Record<string, unknown>) {
    setAccionando(cita.id);
    try {
      const updated = await apiFetch<Cita>(`/api/agenda/citas/${cita.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: nuevoEstado, ...extra }),
      });
      setCitas((prev) => prev.map((c) => c.id === cita.id ? { ...c, ...updated } : c));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al cambiar estado.");
    } finally { setAccionando(null); }
  }

  async function abrirWhatsApp(citaId: string, tipo: "recordatorio" | "entrega") {
    setAccionando(citaId);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/agenda/citas/${citaId}/${tipo}`);
      window.open(url, "_blank", "noopener,noreferrer");
      void cargar();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al generar enlace.");
    } finally { setAccionando(null); }
  }

  function navDia(delta: number) {
    setFecha((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; });
  }

  // ── Admin: profesionales ──────────────────────────────────────────────────

  async function abrirAdminProf() {
    await cargarProfesionales();
    setVistaAdmin("profesionales");
    setTabAdmin("equipo");
    setProfSeleccionado(null);
    setShowFormProf(false);
  }

  function abrirFormProf(prof?: Profesional) {
    if (prof) {
      setEditandoProf(prof);
      setFormProf({
        nombre: prof.nombre,
        especialidad: prof.especialidad ?? "",
        telefono: prof.telefono ?? "",
        color: prof.color,
      });
    } else {
      setEditandoProf(null);
      setFormProf({ nombre: "", especialidad: "", telefono: "", color: "#6366F1" });
    }
    setShowFormProf(true);
  }

  async function guardarProf() {
    if (!formProf.nombre.trim()) return;
    setGuardandoProf(true);
    try {
      if (editandoProf) {
        const updated = await apiFetch<Profesional>(`/api/agenda/profesionales/${editandoProf.id}`, {
          method: "PATCH",
          body: JSON.stringify(formProf),
        });
        setProfesionales((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      } else {
        const nuevo = await apiFetch<Profesional>("/api/agenda/profesionales", {
          method: "POST",
          body: JSON.stringify(formProf),
        });
        setProfesionales((prev) => [...prev, nuevo]);
      }
      setShowFormProf(false);
      setEditandoProf(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar profesional.");
    } finally { setGuardandoProf(false); }
  }

  async function toggleActivoProf(prof: Profesional) {
    try {
      const updated = await apiFetch<Profesional>(`/api/agenda/profesionales/${prof.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !prof.activo }),
      });
      setProfesionales((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error.");
    }
  }

  async function seleccionarProfHorario(prof: Profesional) {
    setProfSeleccionado(prof);
    setTabAdmin("horario");
    try {
      const [hs, bs] = await Promise.all([
        apiFetch<HorarioDia[]>(`/api/agenda/profesionales/${prof.id}/horario`),
        apiFetch<Bloqueo[]>(`/api/agenda/profesionales/${prof.id}/bloqueos?mes=${mesBloqueos}`),
      ]);
      // Asegurar 7 días siempre presentes
      const filled: HorarioDia[] = [0, 1, 2, 3, 4, 5, 6].map((dia) => {
        const existing = hs.find((h) => h.dia_semana === dia);
        return existing ?? { dia_semana: dia, activo: dia !== 0, hora_inicio: "08:00", hora_fin: "18:00" };
      });
      setHorarios(filled);
      setBloqueos(bs);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al cargar horario.");
    }
  }

  async function guardarHorario() {
    if (!profSeleccionado) return;
    setGuardandoHorario(true);
    try {
      const saved = await apiFetch<HorarioDia[]>(`/api/agenda/profesionales/${profSeleccionado.id}/horario`, {
        method: "PUT",
        body: JSON.stringify(horarios.map(({ dia_semana, activo, hora_inicio, hora_fin }) => ({
          dia_semana, activo, hora_inicio, hora_fin,
        }))),
      });
      setHorarios(saved);
      alert("Horario guardado correctamente.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar horario.");
    } finally { setGuardandoHorario(false); }
  }

  async function agregarBloqueo(fechaBloqueo: string) {
    if (!profSeleccionado) return;
    const motivo = prompt(`Motivo del bloqueo para ${fechaBloqueo} (opcional):`);
    if (motivo === null) return; // usuario canceló
    try {
      const nuevo = await apiFetch<Bloqueo>(`/api/agenda/profesionales/${profSeleccionado.id}/bloqueos`, {
        method: "POST",
        body: JSON.stringify({ fecha: fechaBloqueo, motivo: motivo || undefined }),
      });
      setBloqueos((prev) => [...prev, nuevo]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al agregar bloqueo.");
    }
  }

  async function eliminarBloqueo(bloqueoId: string) {
    if (!profSeleccionado) return;
    try {
      await apiFetch(`/api/agenda/profesionales/${profSeleccionado.id}/bloqueos/${bloqueoId}`, { method: "DELETE" });
      setBloqueos((prev) => prev.filter((b) => b.id !== bloqueoId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar bloqueo.");
    }
  }

  const hoy = isoDate(fecha) === isoDate(new Date());
  const sujetoLabel = config?.sujeto_label ?? null;

  // Conteo para barra de resumen
  const conteo = citas.reduce<Record<string, number>>((acc, c) => {
    acc[c.estado] = (acc[c.estado] ?? 0) + 1;
    return acc;
  }, {});

  // Mapa rápido profesional_id → color
  const profColorMap = new Map(profesionales.map((p) => [p.id, p.color]));

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-[#0B0E1A]">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navDia(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="font-semibold text-gray-900 dark:text-slate-100 capitalize">{formatFecha(fecha)}</p>
            {hoy && <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">Hoy</p>}
          </div>
          <button onClick={() => navDia(1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
            <ChevronRight className="h-5 w-5" />
          </button>
          {!hoy && (
            <button onClick={() => setFecha(new Date())} className="text-xs text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-lg px-2 py-1">
              Hoy
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void abrirAdminProf()}
            className="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            title="Gestionar profesionales"
          >
            <Users2 className="h-4 w-4" />
          </button>
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" /> Nueva cita
          </button>
        </div>
      </div>

      {/* Barra resumen */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-4 py-2 flex gap-3 text-xs flex-shrink-0 overflow-x-auto">
        {(Object.keys(ESTADO_META) as EstadoCita[])
          .filter((k) => conteo[k])
          .map((k) => (
            <span key={k} className="flex items-center gap-1 flex-shrink-0">
              <span className={cn("w-2 h-2 rounded-full", ESTADO_META[k].dot)} />
              <span className="text-gray-600 dark:text-slate-400">
                {conteo[k]} {ESTADO_META[k].label.toLowerCase()}
              </span>
            </span>
          ))}
        {citas.length === 0 && !loading && (
          <span className="text-gray-400 dark:text-slate-600">Sin citas para este día</span>
        )}
      </div>

      {/* Lista de citas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <p className="text-center text-gray-400 dark:text-slate-600 py-10 text-sm">Cargando citas...</p>
        ) : citas.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-slate-600">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay citas agendadas para este día</p>
            <button onClick={abrirNueva} className="mt-3 text-sm text-violet-600 dark:text-violet-400 font-semibold">
              + Agendar primera cita
            </button>
          </div>
        ) : (
          citas.map((cita) => {
            const meta = ESTADO_META[cita.estado] ?? ESTADO_META.agendada;
            const cargando = accionando === cita.id;
            const finalizado = esFinalizado(cita.estado);
            const profColor = cita.profesional_id ? profColorMap.get(cita.profesional_id) : null;

            return (
              <div
                key={cita.id}
                className={cn(
                  "bg-white dark:bg-slate-900 rounded-2xl border shadow-sm overflow-hidden",
                  finalizado ? "border-gray-100 dark:border-slate-800 opacity-75" : "border-gray-100 dark:border-slate-800"
                )}
              >
                {/* Franja de color por estado */}
                <div className={cn("h-1 w-full", meta.dot)} />

                <div className="p-4">
                  {/* Fila principal */}
                  <div className="flex items-start gap-3">
                    {/* Hora + duración */}
                    <div className="flex-shrink-0 text-center w-14">
                      <p className="text-base font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                        {formatHora(cita.fecha_hora)}
                      </p>
                      {cita.duracion_min && (
                        <p className="text-xs text-gray-400 dark:text-slate-600">{cita.duracion_min}min</p>
                      )}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900 dark:text-slate-100 truncate text-base">
                          {cita.cliente_nombre}
                        </p>
                        <span className={cn("text-xs rounded-full px-2 py-0.5 flex-shrink-0 border", meta.pill)}>
                          {meta.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Scissors className="h-3 w-3" />
                          {cita.servicio}
                        </span>
                        {cita.profesional && (
                          <span className="flex items-center gap-1.5">
                            {profColor ? (
                              <span
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0 inline-block"
                                style={{ backgroundColor: profColor }}
                              />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            {cita.profesional}
                          </span>
                        )}
                        {cita.cliente_telefono && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {cita.cliente_telefono}
                          </span>
                        )}
                      </div>

                      {/* Sujeto (mascota / vehículo / prenda) */}
                      {cita.sujeto_nombre && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-violet-600 dark:text-violet-400 font-medium">
                          <PawPrint className="h-3 w-3" />
                          {sujetoLabel ? `${sujetoLabel}: ` : ""}{cita.sujeto_nombre}
                          {cita.sujeto_tipo_notas && (
                            <span className="text-gray-400 dark:text-slate-500 font-normal ml-1">
                              — {cita.sujeto_tipo_notas}
                            </span>
                          )}
                        </div>
                      )}

                      {cita.notas && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 italic line-clamp-2">
                          {cita.notas}
                        </p>
                      )}

                      {cita.recordatorio_enviado_at && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-1">
                          <MessageCircle className="h-3 w-3" />
                          Recordatorio enviado
                        </span>
                      )}
                    </div>

                    {/* Botón editar */}
                    {!finalizado && (
                      <button
                        onClick={() => abrirEditar(cita)}
                        className="flex-shrink-0 p-2 rounded-xl text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* ── Botones de acción por estado ── */}
                  {!finalizado && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cita.estado === "agendada" && (
                        <ActionBtn label="Confirmar" color="indigo" loading={cargando}
                          onClick={() => void cambiarEstado(cita, "confirmada")} />
                      )}
                      {(cita.estado === "agendada" || cita.estado === "confirmada") && (
                        <ActionBtn label="WhatsApp recordatorio" icon={<MessageCircle className="h-3.5 w-3.5" />}
                          color="green" loading={cargando}
                          onClick={() => void abrirWhatsApp(cita.id, "recordatorio")} />
                      )}
                      {(cita.estado === "agendada" || cita.estado === "confirmada") && (
                        <ActionBtn label="Check-in" icon={<LogIn className="h-3.5 w-3.5" />}
                          color="amber" loading={cargando}
                          onClick={() => void cambiarEstado(cita, "en_atencion")} />
                      )}
                      {cita.estado === "en_atencion" && (
                        <ActionBtn label="Listo para entrega" icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          color="orange" loading={cargando}
                          onClick={() => void cambiarEstado(cita, "lista_entrega")} />
                      )}
                      {cita.estado === "lista_entrega" && (
                        <ActionBtn label="WhatsApp aviso" icon={<MessageCircle className="h-3.5 w-3.5" />}
                          color="green" loading={cargando}
                          onClick={() => void abrirWhatsApp(cita.id, "entrega")} />
                      )}
                      {cita.estado === "lista_entrega" && onIrAVenta && (
                        <ActionBtn label="Cobrar en caja" icon={<ShoppingCart className="h-3.5 w-3.5" />}
                          color="violet" loading={false} onClick={onIrAVenta} />
                      )}
                      {cita.estado === "lista_entrega" && (
                        <ActionBtn label="Marcar cobrada" icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          color="emerald" loading={cargando}
                          onClick={() => void cambiarEstado(cita, "entregada_cobrada")} />
                      )}
                      {(cita.estado === "agendada" || cita.estado === "confirmada") && (
                        <ActionBtn label="No show" icon={<AlertCircle className="h-3.5 w-3.5" />}
                          color="gray" loading={cargando}
                          onClick={() => void cambiarEstado(cita, "no_show")} />
                      )}
                      <ActionBtn label="Cancelar" color="red" loading={cargando}
                        onClick={() => { if (confirm("¿Cancelar esta cita?")) void cambiarEstado(cita, "cancelada"); }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Modal crear / editar cita ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-800 flex-shrink-0">
              <p className="font-bold text-gray-900 dark:text-slate-100">
                {editando ? "Editar cita" : "Nueva cita"}
              </p>
              <button
                onClick={() => { setShowForm(false); setEditando(null); }}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void guardar(e)} className="overflow-y-auto flex-1 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">
                    Nombre del cliente *
                  </label>
                  <input
                    autoFocus
                    value={form.cliente_nombre}
                    onChange={(e) => setForm((f) => ({ ...f, cliente_nombre: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="Ej: María García"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Teléfono WhatsApp</label>
                  <input
                    type="tel"
                    value={form.cliente_telefono}
                    onChange={(e) => setForm((f) => ({ ...f, cliente_telefono: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="3001234567"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Duración (min)</label>
                  <input
                    type="number" min="5" step="5"
                    value={form.duracion_min}
                    onChange={(e) => setForm((f) => ({ ...f, duracion_min: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Fecha *</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Hora *</label>
                  <input
                    type="time"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Servicio *</label>
                  <input
                    value={form.servicio}
                    onChange={(e) => setForm((f) => ({ ...f, servicio: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="Ej: Baño y corte, Consulta, Lavado general..."
                  />
                </div>

                {/* Profesional: selector inteligente o fallback texto libre */}
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-2 block">
                    Profesional y disponibilidad
                  </label>
                  {loadingDisponibilidad ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando disponibilidad...
                    </div>
                  ) : disponibilidad.length === 0 ? (
                    /* Fallback: texto libre cuando no hay profesionales configurados */
                    <input
                      value={form.profesional}
                      onChange={(e) => setForm((f) => ({ ...f, profesional: e.target.value, profesional_id: "" }))}
                      className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="Nombre del profesional (opcional)"
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {disponibilidad.map(({ profesional: prof, slots }) => {
                        const slotActual = slots.find((s) => s.hora === form.hora);
                        const disponible = slotActual?.disponible ?? false;
                        const seleccionado = form.profesional_id === prof.id;
                        return (
                          <button
                            key={prof.id}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, profesional_id: prof.id, profesional: prof.nombre }))}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                              seleccionado
                                ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                                : "border-gray-200 dark:border-slate-700",
                              !disponible && "opacity-60"
                            )}
                          >
                            <div
                              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
                              style={{ backgroundColor: prof.color }}
                            >
                              {prof.nombre[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-slate-100 text-sm">{prof.nombre}</p>
                              {prof.especialidad && (
                                <p className="text-xs text-gray-500 dark:text-slate-400">{prof.especialidad}</p>
                              )}
                            </div>
                            <span className={cn(
                              "text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0",
                              disponible
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400"
                            )}>
                              {disponible ? "Disponible" : "Ocupado"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Notas</label>
                  <textarea
                    rows={2}
                    value={form.notas}
                    onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="Observaciones, alergias, instrucciones especiales..."
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              )}
            </form>

            <div className="p-4 border-t dark:border-slate-800 flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditando(null); }}
                className="flex-1 rounded-xl border border-gray-300 dark:border-slate-700 py-3.5 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={(e) => void guardar(e as unknown as FormEvent)}
                disabled={guardando}
                className="flex-1 rounded-xl bg-violet-600 py-3.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                {guardando ? "Guardando..." : editando ? "Actualizar" : "Agendar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal administración de profesionales ── */}
      {vistaAdmin === "profesionales" && (
        <div className="fixed inset-0 bg-black/60 flex items-stretch sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg shadow-2xl flex flex-col sm:rounded-2xl max-h-screen sm:max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-800 flex-shrink-0">
              <p className="font-bold text-gray-900 dark:text-slate-100">Gestión de profesionales</p>
              <button
                onClick={() => { setVistaAdmin(null); setProfSeleccionado(null); }}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pestañas */}
            <div className="flex border-b dark:border-slate-800 flex-shrink-0">
              <button
                onClick={() => setTabAdmin("equipo")}
                className={cn(
                  "flex-1 py-2.5 text-sm font-semibold transition-colors",
                  tabAdmin === "equipo"
                    ? "border-b-2 border-violet-600 text-violet-600"
                    : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                )}
              >
                Equipo
              </button>
              <button
                onClick={() => { if (profSeleccionado) setTabAdmin("horario"); }}
                className={cn(
                  "flex-1 py-2.5 text-sm font-semibold transition-colors truncate px-2",
                  tabAdmin === "horario"
                    ? "border-b-2 border-violet-600 text-violet-600"
                    : profSeleccionado
                      ? "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
                      : "text-gray-300 dark:text-slate-600 cursor-not-allowed"
                )}
              >
                Horario{profSeleccionado ? ` — ${profSeleccionado.nombre}` : ""}
              </button>
            </div>

            {/* Pestaña: Equipo */}
            {tabAdmin === "equipo" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <button
                  onClick={() => abrirFormProf()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700 py-3 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Agregar profesional
                </button>

                {profesionales.length === 0 && (
                  <p className="text-center text-gray-400 dark:text-slate-600 text-sm py-4">
                    Sin profesionales configurados aún
                  </p>
                )}

                {profesionales.map((prof) => (
                  <div key={prof.id} className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: prof.color }}
                    >
                      {prof.nombre[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-slate-100 text-sm truncate">{prof.nombre}</p>
                      {prof.especialidad && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{prof.especialidad}</p>
                      )}
                      {!prof.activo && (
                        <span className="text-xs text-red-500 dark:text-red-400">Inactivo</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => void seleccionarProfHorario(prof)}
                        className="p-2 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                        title="Ver horario"
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => abrirFormProf(prof)}
                        className="p-2 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void toggleActivoProf(prof)}
                        className={cn(
                          "p-2 rounded-lg",
                          prof.activo
                            ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            : "text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                        )}
                        title={prof.activo ? "Desactivar" : "Activar"}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pestaña: Horario */}
            {tabAdmin === "horario" && profSeleccionado && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                  Horario semanal
                </p>

                <div className="space-y-2">
                  {horarios.map((h, i) => (
                    <div key={h.dia_semana} className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800 rounded-xl p-3">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...horarios];
                          updated[i] = { ...updated[i], activo: !updated[i].activo };
                          setHorarios(updated);
                        }}
                        className={cn(
                          "w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors",
                          h.activo
                            ? "bg-violet-600 border-violet-600"
                            : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                        )}
                      >
                        {h.activo && <span className="w-2 h-2 rounded-full bg-white" />}
                      </button>
                      <span className="w-20 text-sm font-medium text-gray-700 dark:text-slate-300 flex-shrink-0">
                        {DIAS_SEMANA[h.dia_semana]}
                      </span>
                      {h.activo ? (
                        <>
                          <input
                            type="time"
                            value={h.hora_inicio}
                            onChange={(e) => {
                              const updated = [...horarios];
                              updated[i] = { ...updated[i], hora_inicio: e.target.value };
                              setHorarios(updated);
                            }}
                            className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-400"
                          />
                          <span className="text-gray-400 text-xs">–</span>
                          <input
                            type="time"
                            value={h.hora_fin}
                            onChange={(e) => {
                              const updated = [...horarios];
                              updated[i] = { ...updated[i], hora_fin: e.target.value };
                              setHorarios(updated);
                            }}
                            className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-400"
                          />
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-slate-600">Día libre</span>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => void guardarHorario()}
                  disabled={guardandoHorario}
                  className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {guardandoHorario && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar horario
                </button>

                {/* Bloqueos del mes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wide">
                      Bloqueos del mes
                    </p>
                    <input
                      type="month"
                      value={mesBloqueos}
                      onChange={async (e) => {
                        setMesBloqueos(e.target.value);
                        try {
                          const bs = await apiFetch<Bloqueo[]>(
                            `/api/agenda/profesionales/${profSeleccionado.id}/bloqueos?mes=${e.target.value}`
                          );
                          setBloqueos(bs);
                        } catch { /* ignore */ }
                      }}
                      className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs dark:text-slate-100 focus:outline-none"
                    />
                  </div>

                  {bloqueos.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-slate-600 text-center py-2">
                      Sin bloqueos en este mes
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {bloqueos.map((b) => (
                        <div key={b.id} className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">
                          <span className="text-xs font-semibold text-red-700 dark:text-red-400">{b.fecha}</span>
                          {b.hora_inicio && (
                            <span className="text-xs text-red-600 dark:text-red-300">
                              {b.hora_inicio}–{b.hora_fin}
                            </span>
                          )}
                          {b.motivo && (
                            <span className="text-xs text-red-500 dark:text-red-400 flex-1 truncate">{b.motivo}</span>
                          )}
                          <button
                            onClick={() => void eliminarBloqueo(b.id)}
                            className="flex-shrink-0 text-red-400 hover:text-red-600 p-0.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => void agregarBloqueo(isoDate(new Date()))}
                    className="mt-2 w-full rounded-xl border-2 border-dashed border-red-200 dark:border-red-800 py-2 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  >
                    + Agregar bloqueo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal crear / editar profesional ── */}
      {showFormProf && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900 dark:text-slate-100">
                {editandoProf ? "Editar profesional" : "Nuevo profesional"}
              </p>
              <button
                onClick={() => { setShowFormProf(false); setEditandoProf(null); }}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Nombre *</label>
              <input
                autoFocus
                value={formProf.nombre}
                onChange={(e) => setFormProf((f) => ({ ...f, nombre: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="Ej: Dra. Lucía Martínez"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Especialidad</label>
              <input
                value={formProf.especialidad}
                onChange={(e) => setFormProf((f) => ({ ...f, especialidad: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="Ej: Corte y color, Medicina general..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Teléfono</label>
              <input
                type="tel"
                value={formProf.telefono}
                onChange={(e) => setFormProf((f) => ({ ...f, telefono: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="3001234567"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Color identificador</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formProf.color}
                  onChange={(e) => setFormProf((f) => ({ ...f, color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-gray-300 dark:border-slate-700 cursor-pointer p-0.5"
                />
                <span className="text-sm text-gray-700 dark:text-slate-300 font-mono">{formProf.color}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowFormProf(false); setEditandoProf(null); }}
                className="flex-1 rounded-xl border border-gray-300 dark:border-slate-700 py-3 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarProf()}
                disabled={guardandoProf || !formProf.nombre.trim()}
                className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {guardandoProf && <Loader2 className="h-4 w-4 animate-spin" />}
                {editandoProf ? "Actualizar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente botón de acción ────────────────────────────────────────────────

type BtnColor = "indigo" | "amber" | "orange" | "emerald" | "green" | "violet" | "red" | "gray";

const BTN_COLORS: Record<BtnColor, string> = {
  indigo:  "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50",
  amber:   "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50",
  orange:  "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/50",
  emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50",
  green:   "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50",
  violet:  "bg-violet-600 text-white border border-violet-600 hover:bg-violet-700",
  red:     "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50",
  gray:    "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700",
};

function ActionBtn({
  label, icon, color, loading, onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  color: BtnColor;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors active:scale-95 disabled:opacity-50",
        BTN_COLORS[color]
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
