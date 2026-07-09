import { useEffect, useState, type FormEvent } from "react";
import {
  Plus, X, Clock, User, Scissors, ChevronLeft, ChevronRight,
  Pencil, MessageCircle, AlertCircle, Phone, CheckCircle2,
  ShoppingCart, PawPrint, Loader2, LogIn,
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

// ── Config de estados ─────────────────────────────────────────────────────────

const ESTADO_META: Record<EstadoCita, { label: string; color: string; dot: string; pill: string }> = {
  agendada:           { label: "Agendada",          color: "bg-blue-50 text-blue-700",     dot: "bg-blue-400",    pill: "border-blue-200 text-blue-700" },
  confirmada:         { label: "Confirmada",         color: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-400",  pill: "border-indigo-200 text-indigo-700" },
  en_atencion:        { label: "En atención",        color: "bg-amber-50 text-amber-700",   dot: "bg-amber-400",   pill: "border-amber-200 text-amber-700" },
  lista_entrega:      { label: "Lista para entregar",color: "bg-orange-50 text-orange-700", dot: "bg-orange-400",  pill: "border-orange-200 text-orange-700" },
  entregada_cobrada:  { label: "Entregada / Cobrada",color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-400", pill: "border-emerald-200 text-emerald-700" },
  no_show:            { label: "No show",            color: "bg-gray-100 text-gray-500",    dot: "bg-gray-400",    pill: "border-gray-200 text-gray-500" },
  cancelada:          { label: "Cancelada",          color: "bg-red-50 text-red-600",       dot: "bg-red-400",     pill: "border-red-200 text-red-600" },
};

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
  servicio: "", profesional: "", duracion_min: "30", notas: "",
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
  const [accionando, setAccionando] = useState<string | null>(null); // id de cita con acción en curso

  useEffect(() => { void cargarConfig(); }, []);
  useEffect(() => { void cargar(); }, [fecha]);

  async function cargarConfig() {
    try {
      const c = await apiFetch<ConfigAgenda>("/api/agenda/config");
      setConfig(c);
    } catch { /* si falla config, sigue sin sujeto_label */ }
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
      duracion_min: String(c.duracion_min ?? 30),
      notas: c.notas ?? "",
    });
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
      const body = {
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_telefono: form.cliente_telefono.trim() || undefined,
        fecha_hora: `${form.fecha}T${form.hora}:00`,
        servicio: form.servicio.trim(),
        profesional: form.profesional.trim() || undefined,
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
      void cargar(); // refresca para actualizar recordatorio_enviado_at
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al generar enlace.");
    } finally { setAccionando(null); }
  }

  function navDia(delta: number) {
    setFecha((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; });
  }

  const hoy = isoDate(fecha) === isoDate(new Date());
  const sujetoLabel = config?.sujeto_label ?? null;

  // Conteo para barra de resumen
  const conteo = citas.reduce<Record<string, number>>((acc, c) => {
    acc[c.estado] = (acc[c.estado] ?? 0) + 1;
    return acc;
  }, {});

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
        <button
          onClick={abrirNueva}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4" /> Nueva cita
        </button>
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

      {/* Lista */}
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
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
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

                      {/* Indicadores secundarios */}
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
                      {/* agendada → confirmada */}
                      {cita.estado === "agendada" && (
                        <ActionBtn
                          label="Confirmar"
                          color="indigo"
                          loading={cargando}
                          onClick={() => void cambiarEstado(cita, "confirmada")}
                        />
                      )}

                      {/* agendada | confirmada → WhatsApp recordatorio */}
                      {(cita.estado === "agendada" || cita.estado === "confirmada") && (
                        <ActionBtn
                          label="WhatsApp recordatorio"
                          icon={<MessageCircle className="h-3.5 w-3.5" />}
                          color="green"
                          loading={cargando}
                          onClick={() => void abrirWhatsApp(cita.id, "recordatorio")}
                        />
                      )}

                      {/* agendada | confirmada → check-in */}
                      {(cita.estado === "agendada" || cita.estado === "confirmada") && (
                        <ActionBtn
                          label="Check-in"
                          icon={<LogIn className="h-3.5 w-3.5" />}
                          color="amber"
                          loading={cargando}
                          onClick={() => void cambiarEstado(cita, "en_atencion")}
                        />
                      )}

                      {/* en_atencion → lista_entrega */}
                      {cita.estado === "en_atencion" && (
                        <ActionBtn
                          label="Listo para entrega"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          color="orange"
                          loading={cargando}
                          onClick={() => void cambiarEstado(cita, "lista_entrega")}
                        />
                      )}

                      {/* lista_entrega → WhatsApp aviso entrega */}
                      {cita.estado === "lista_entrega" && (
                        <ActionBtn
                          label="WhatsApp aviso"
                          icon={<MessageCircle className="h-3.5 w-3.5" />}
                          color="green"
                          loading={cargando}
                          onClick={() => void abrirWhatsApp(cita.id, "entrega")}
                        />
                      )}

                      {/* lista_entrega → Cobrar (ir a Venta) */}
                      {cita.estado === "lista_entrega" && onIrAVenta && (
                        <ActionBtn
                          label="Cobrar en caja"
                          icon={<ShoppingCart className="h-3.5 w-3.5" />}
                          color="violet"
                          loading={false}
                          onClick={onIrAVenta}
                        />
                      )}

                      {/* lista_entrega → marcar cobrada */}
                      {cita.estado === "lista_entrega" && (
                        <ActionBtn
                          label="Marcar cobrada"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          color="emerald"
                          loading={cargando}
                          onClick={() => void cambiarEstado(cita, "entregada_cobrada")}
                        />
                      )}

                      {/* no-show */}
                      {(cita.estado === "agendada" || cita.estado === "confirmada") && (
                        <ActionBtn
                          label="No show"
                          icon={<AlertCircle className="h-3.5 w-3.5" />}
                          color="gray"
                          loading={cargando}
                          onClick={() => void cambiarEstado(cita, "no_show")}
                        />
                      )}

                      {/* cancelar */}
                      <ActionBtn
                        label="Cancelar"
                        color="red"
                        loading={cargando}
                        onClick={() => {
                          if (confirm("¿Cancelar esta cita?")) void cambiarEstado(cita, "cancelada");
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal crear / editar */}
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

                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Profesional / Encargado</label>
                  <input
                    value={form.profesional}
                    onChange={(e) => setForm((f) => ({ ...f, profesional: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="Ej: Dr. Pérez, Estilista Luisa..."
                  />
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
