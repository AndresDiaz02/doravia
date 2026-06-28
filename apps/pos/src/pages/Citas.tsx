import { useEffect, useState, type FormEvent } from "react";
import {
  Plus, X, Clock, User, Scissors, ChevronLeft, ChevronRight,
  Pencil, Trash2, CheckCircle2, AlertCircle, Phone,
} from "lucide-react";
import { apiFetch, ApiError, type ApiError as ApiErrorType } from "../lib/api";
import { cn } from "../lib/cn";

interface Cita {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  fecha_hora: string;
  servicio: string;
  profesional: string | null;
  duracion_min: number | null;
  notas: string | null;
  estado: "programada" | "en_proceso" | "completada" | "cancelada";
  created_at: string;
}

const ESTADOS: { key: Cita["estado"]; label: string; color: string; dot: string }[] = [
  { key: "programada",  label: "Programada",  color: "bg-blue-100 text-blue-700",    dot: "bg-blue-400" },
  { key: "en_proceso",  label: "En proceso",  color: "bg-amber-100 text-amber-700",  dot: "bg-amber-400" },
  { key: "completada",  label: "Completada",  color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  { key: "cancelada",   label: "Cancelada",   color: "bg-red-100 text-red-500",      dot: "bg-red-400" },
];

function formatHora(fechaHora: string) {
  return new Date(fechaHora).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatFecha(d: Date) {
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const FORM_EMPTY = {
  cliente_nombre: "", cliente_telefono: "", fecha: isoDate(new Date()), hora: "09:00",
  servicio: "", profesional: "", duracion_min: "30", notas: "",
};

export default function Citas({ cajaId }: { cajaId: string }) {
  const [fecha, setFecha] = useState(new Date());
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Cita | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...FORM_EMPTY });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void cargar(); }, [fecha]);

  async function cargar() {
    setLoading(true);
    try {
      const data = await apiFetch<Cita[]>(`/api/pos/citas?fecha=${isoDate(fecha)}`);
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
        await apiFetch(`/api/pos/citas/${editando.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/pos/citas", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      setEditando(null);
      void cargar();
    } catch (err) {
      setError(err instanceof (ApiError as unknown as { new(s: number, m: string): ApiErrorType }) ? (err as ApiErrorType).message : "Error al guardar.");
    } finally { setGuardando(false); }
  }

  async function cambiarEstado(id: string, estado: Cita["estado"]) {
    await apiFetch(`/api/pos/citas/${id}`, { method: "PATCH", body: JSON.stringify({ estado }) });
    setCitas((prev) => prev.map((c) => c.id === id ? { ...c, estado } : c));
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta cita?")) return;
    await apiFetch(`/api/pos/citas/${id}`, { method: "DELETE" });
    setCitas((prev) => prev.filter((c) => c.id !== id));
  }

  function navDia(delta: number) {
    setFecha((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; });
  }

  const hoy = isoDate(fecha) === isoDate(new Date());

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navDia(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="font-semibold text-gray-900 capitalize">{formatFecha(fecha)}</p>
            {hoy && <p className="text-xs text-violet-600 font-medium">Hoy</p>}
          </div>
          <button onClick={() => navDia(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!hoy && (
            <button onClick={() => setFecha(new Date())} className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 rounded px-2 py-1">
              Hoy
            </button>
          )}
        </div>
        <button
          onClick={abrirNueva}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" /> Nueva cita
        </button>
      </div>

      {/* Resumen */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-3 text-xs flex-shrink-0">
        {ESTADOS.map((e) => {
          const n = citas.filter((c) => c.estado === e.key).length;
          return n > 0 ? (
            <span key={e.key} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${e.dot}`} />
              <span className="text-gray-600">{n} {e.label.toLowerCase()}{n > 1 ? "s" : ""}</span>
            </span>
          ) : null;
        })}
        {citas.length === 0 && !loading && (
          <span className="text-gray-400">Sin citas para este día</span>
        )}
      </div>

      {/* Lista de citas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <p className="text-center text-gray-400 py-10 text-sm">Cargando citas...</p>
        ) : citas.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay citas agendadas para este día</p>
            <button onClick={abrirNueva} className="mt-3 text-sm text-violet-600 hover:text-violet-800 font-medium">
              + Agendar primera cita
            </button>
          </div>
        ) : (
          citas.map((cita) => {
            const est = ESTADOS.find((e) => e.key === cita.estado)!;
            return (
              <div key={cita.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* Hora */}
                  <div className="flex-shrink-0 text-center w-14">
                    <p className="text-sm font-bold text-gray-900">{formatHora(cita.fecha_hora)}</p>
                    {cita.duracion_min && (
                      <p className="text-xs text-gray-400">{cita.duracion_min}min</p>
                    )}
                  </div>
                  {/* Separador */}
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full ${est.dot} mt-1`} />
                    <div className="w-px flex-1 bg-gray-100 min-h-[24px] my-1" />
                  </div>
                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-gray-900 truncate">{cita.cliente_nombre}</p>
                      <span className={`text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${est.color}`}>{est.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Scissors className="h-3 w-3" />{cita.servicio}</span>
                      {cita.profesional && <span className="flex items-center gap-1"><User className="h-3 w-3" />{cita.profesional}</span>}
                      {cita.cliente_telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{cita.cliente_telefono}</span>}
                    </div>
                    {cita.notas && <p className="text-xs text-gray-400 mt-1 italic truncate">{cita.notas}</p>}
                  </div>
                  {/* Acciones */}
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <button onClick={() => abrirEditar(cita)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => void eliminar(cita.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {/* Botones de estado */}
                {cita.estado !== "completada" && cita.estado !== "cancelada" && (
                  <div className="flex gap-1.5 mt-2 ml-14 pl-3">
                    {cita.estado === "programada" && (
                      <button
                        onClick={() => void cambiarEstado(cita.id, "en_proceso")}
                        className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 hover:bg-amber-100"
                      >
                        Iniciar
                      </button>
                    )}
                    {(cita.estado === "programada" || cita.estado === "en_proceso") && (
                      <button
                        onClick={() => void cambiarEstado(cita.id, "completada")}
                        className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 hover:bg-emerald-100 flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" />Completar
                      </button>
                    )}
                    <button
                      onClick={() => void cambiarEstado(cita.id, "cancelada")}
                      className="text-xs bg-red-50 text-red-500 border border-red-200 rounded-full px-2.5 py-0.5 hover:bg-red-100 flex items-center gap-1"
                    >
                      <AlertCircle className="h-3 w-3" />Cancelar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal crear / editar */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
              <p className="font-bold text-gray-900">{editando ? "Editar cita" : "Nueva cita"}</p>
              <button onClick={() => { setShowForm(false); setEditando(null); }} className="text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void guardar(e)} className="overflow-y-auto flex-1 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Nombre del cliente *</label>
                  <input autoFocus
                    value={form.cliente_nombre}
                    onChange={(e) => setForm((f) => ({ ...f, cliente_nombre: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                    placeholder="Ej: María García"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Teléfono</label>
                  <input type="tel"
                    value={form.cliente_telefono}
                    onChange={(e) => setForm((f) => ({ ...f, cliente_telefono: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                    placeholder="3001234567"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Duración (min)</label>
                  <input type="number" min="5" step="5"
                    value={form.duracion_min}
                    onChange={(e) => setForm((f) => ({ ...f, duracion_min: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Fecha *</label>
                  <input type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Hora *</label>
                  <input type="time"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Servicio *</label>
                  <input
                    value={form.servicio}
                    onChange={(e) => setForm((f) => ({ ...f, servicio: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                    placeholder="Ej: Baño y corte, Limpieza dental, Consulta..."
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Profesional / Encargado</label>
                  <input
                    value={form.profesional}
                    onChange={(e) => setForm((f) => ({ ...f, profesional: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                    placeholder="Ej: Dr. Pérez, Estilista Luisa..."
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Notas</label>
                  <textarea rows={2}
                    value={form.notas}
                    onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                    placeholder="Observaciones, alergias, instrucciones especiales..."
                  />
                </div>
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </form>

            <div className="p-4 border-t flex gap-3 flex-shrink-0">
              <button type="button" onClick={() => { setShowForm(false); setEditando(null); }}
                className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={(e) => void guardar(e as unknown as FormEvent)}
                disabled={guardando}
                className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40"
              >
                {guardando ? "Guardando..." : editando ? "Actualizar" : "Agendar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
