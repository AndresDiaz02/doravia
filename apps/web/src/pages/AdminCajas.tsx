import { useEffect, useState } from "react";
import { Plus, Monitor, Pencil, ToggleLeft, ToggleRight, ExternalLink, Scale, Cpu, ChevronDown, ChevronUp, Loader2, HelpCircle, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";

interface GrameraConfig {
  habilitada: boolean;
  marca: string;
  modelo: string;
  tipo: "serial" | "keyboard";
  baudRate?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  regex: string;
  unidad: "kg" | "g" | "lb";
}

interface CajaConfig {
  gramera?: GrameraConfig;
}

interface Caja {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  config: CajaConfig | null;
  created_at: string;
}

export default function AdminCajas() {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editando, setEditando] = useState<Caja | null>(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showTutorial, setShowTutorial] = useState(false);

  // Config gramera por caja
  const [expandedGramera, setExpandedGramera] = useState<string | null>(null);
  const [grameraForm, setGrameraForm] = useState<Record<string, { marca: string; modelo: string }>>({});
  const [detectando, setDetectando] = useState<string | null>(null);
  const [notaIA, setNotaIA] = useState<Record<string, string>>({});

  useEffect(() => { void cargar(); }, []);

  async function cargar() {
    const data = await apiFetch<Caja[]>("/api/pos/cajas");
    setCajas(data);
    setLoading(false);
  }

  function abrirCrear() {
    setEditando(null);
    setForm({ nombre: "", descripcion: "" });
    setError(null);
    setShowDialog(true);
  }

  function abrirEditar(caja: Caja) {
    setEditando(caja);
    setForm({ nombre: caja.nombre, descripcion: caja.descripcion ?? "" });
    setError(null);
    setShowDialog(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError("El nombre es requerido."); return; }
    setGuardando(true);
    setError(null);
    try {
      if (editando) {
        await apiFetch(`/api/pos/cajas/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre: form.nombre, descripcion: form.descripcion || null }),
        });
      } else {
        await apiFetch("/api/pos/cajas", {
          method: "POST",
          body: JSON.stringify({ nombre: form.nombre, descripcion: form.descripcion || null }),
        });
      }
      setShowDialog(false);
      void cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(caja: Caja) {
    await apiFetch(`/api/pos/cajas/${caja.id}`, {
      method: "PATCH",
      body: JSON.stringify({ activo: !caja.activo }),
    });
    void cargar();
  }

  async function detectarGramera(caja: Caja) {
    const f = grameraForm[caja.id] ?? { marca: "", modelo: "" };
    if (!f.marca.trim() || !f.modelo.trim()) return;
    setDetectando(caja.id);
    setNotaIA((n) => ({ ...n, [caja.id]: "" }));
    try {
      const res = await apiFetch<{ config: CajaConfig; nota: string }>(
        `/api/pos/cajas/${caja.id}/gramera-detectar`,
        { method: "POST", body: JSON.stringify({ marca: f.marca.trim(), modelo: f.modelo.trim() }) }
      );
      setNotaIA((n) => ({ ...n, [caja.id]: res.nota }));
      await cargar();
    } catch (err) {
      setNotaIA((n) => ({ ...n, [caja.id]: err instanceof ApiError ? err.message : "Error al detectar." }));
    } finally {
      setDetectando(null);
    }
  }

  async function toggleGramera(caja: Caja) {
    const actual = caja.config?.gramera;
    if (!actual) return;
    await apiFetch(`/api/pos/cajas/${caja.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        config: { ...caja.config, gramera: { ...actual, habilitada: !actual.habilitada } }
      }),
    });
    void cargar();
  }

  async function quitarGramera(caja: Caja) {
    const { gramera: _g, ...resto } = caja.config ?? {};
    await apiFetch(`/api/pos/cajas/${caja.id}`, {
      method: "PATCH",
      body: JSON.stringify({ config: Object.keys(resto).length ? resto : null }),
    });
    void cargar();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cajas POS</h1>
          <p className="text-sm text-gray-500 mt-0.5">Administra las cajas y sus periféricos</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={import.meta.env.VITE_POS_URL ?? "https://stirring-longma-af504d.netlify.app"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> Ir al POS
          </a>
          <Button onClick={abrirCrear}>
            <Plus className="h-4 w-4 mr-1.5" /> Nueva caja
          </Button>
        </div>
      </div>

      {/* Tutorial grameras */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
        <button
          onClick={() => setShowTutorial((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-violet-100 transition-colors"
        >
          <HelpCircle className="h-4 w-4 text-violet-600 flex-shrink-0" />
          <span className="text-sm font-medium text-violet-800 flex-1">¿Cómo conectar una báscula / gramera?</span>
          {showTutorial ? <ChevronUp className="h-4 w-4 text-violet-500" /> : <ChevronDown className="h-4 w-4 text-violet-500" />}
        </button>
        {showTutorial && (
          <div className="px-4 pb-4 space-y-3">
            <div className="space-y-2">
              {[
                { n: 1, titulo: "Crea o selecciona una caja", desc: "Cada caja puede tener su propia báscula. Haz clic en el ícono ⚖️ de la caja donde irá conectada." },
                { n: 2, titulo: "Escribe marca y modelo", desc: 'Ejemplo: Marca "CAS" · Modelo "SW-1". Puedes encontrarlo en la etiqueta del equipo.' },
                { n: 3, titulo: 'Detectar protocolo con IA', desc: 'Haz clic en "Detectar con IA". El sistema detecta automáticamente si es USB-teclado o serial, y configura los parámetros de comunicación.' },
                { n: 4, titulo: "En el POS — tipo teclado (USB básico)", desc: 'La báscula funciona sola. Agrega un producto al carrito, pesa el artículo y el peso aparece automáticamente. Haz clic en "Aplicar".' },
                { n: 5, titulo: "En el POS — tipo serial (RS-232 o USB-Serial)", desc: 'Haz clic en "Conectar" en el POS y selecciona el puerto del computador. Requiere Chrome o Edge en escritorio. El peso se actualiza en tiempo real.' },
              ].map((paso) => (
                <div key={paso.n} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {paso.n}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-violet-900">{paso.titulo}</p>
                    <p className="text-xs text-violet-700">{paso.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>¿No sabes el modelo exacto?</strong> La IA usa el modelo más común de esa marca. Puedes volver a detectar si cambia de equipo.
              </p>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : cajas.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <Monitor className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin cajas configuradas</p>
          <p className="text-sm text-gray-400 mt-1">Crea la primera caja para que los cajeros puedan iniciar turnos.</p>
          <Button className="mt-4" onClick={abrirCrear}>
            <Plus className="h-4 w-4 mr-1.5" /> Crear caja
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {cajas.map((caja) => {
            const gramera = caja.config?.gramera;
            const showGramera = expandedGramera === caja.id;
            const gf = grameraForm[caja.id] ?? { marca: gramera?.marca ?? "", modelo: gramera?.modelo ?? "" };

            return (
              <div
                key={caja.id}
                className={`rounded-xl border bg-white overflow-hidden ${
                  caja.activo ? "border-gray-200" : "border-gray-100 opacity-60"
                }`}
              >
                {/* Fila principal de la caja */}
                <div className="p-4 flex items-center gap-4">
                  <div className={`rounded-lg p-2.5 ${caja.activo ? "bg-blue-50" : "bg-gray-100"}`}>
                    <Monitor className={`h-5 w-5 ${caja.activo ? "text-blue-600" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{caja.nombre}</p>
                    {caja.descripcion && <p className="text-sm text-gray-400 truncate">{caja.descripcion}</p>}
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-gray-300">
                        Creada {new Date(caja.created_at).toLocaleDateString("es-CO")}
                      </p>
                      {gramera && (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          gramera.habilitada
                            ? "bg-violet-100 text-violet-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          <Scale className="h-3 w-3" />
                          {gramera.marca} {gramera.modelo}
                          {!gramera.habilitada && " (desactivada)"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      caja.activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {caja.activo ? "Activa" : "Inactiva"}
                    </span>
                    <button
                      onClick={() => setExpandedGramera(showGramera ? null : caja.id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                      title="Periféricos"
                    >
                      <Scale className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => abrirEditar(caja)}
                      className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void toggleActivo(caja)}
                      className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      title={caja.activo ? "Desactivar" : "Activar"}
                    >
                      {caja.activo
                        ? <ToggleRight className="h-5 w-5 text-blue-500" />
                        : <ToggleLeft className="h-5 w-5" />
                      }
                    </button>
                  </div>
                </div>

                {/* Panel de periféricos expandible */}
                {showGramera && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-violet-600" />
                      <p className="text-sm font-semibold text-gray-800">Gramera / Báscula</p>
                      {gramera && (
                        <button
                          onClick={() => void toggleGramera(caja)}
                          className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                            gramera.habilitada
                              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {gramera.habilitada ? "Habilitada" : "Deshabilitada"}
                        </button>
                      )}
                    </div>

                    {gramera ? (
                      <div className="space-y-3">
                        {/* Resumen del protocolo detectado */}
                        <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Protocolo detectado</span>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                              gramera.tipo === "keyboard"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-orange-50 text-orange-700"
                            }`}>
                              <Cpu className="h-3 w-3" />
                              {gramera.tipo === "keyboard" ? "Emulación teclado" : `Serial ${gramera.baudRate} baud`}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <span className="text-gray-500">Marca / Modelo</span>
                            <span className="font-medium text-gray-900">{gramera.marca} {gramera.modelo}</span>
                            <span className="text-gray-500">Unidad</span>
                            <span className="font-medium text-gray-900">{gramera.unidad}</span>
                            {gramera.tipo === "serial" && (
                              <>
                                <span className="text-gray-500">Paridad</span>
                                <span className="font-medium text-gray-900">{gramera.parity ?? "none"}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => void quitarGramera(caja)}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        >
                          Quitar gramera de esta caja
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-500">
                          Ingresa marca y modelo — la IA detecta el protocolo de comunicación automáticamente.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Marca</label>
                            <Input
                              placeholder="Ej: Epelsa, CAS, Mettler"
                              value={gf.marca}
                              onChange={(e) => setGrameraForm((f) => ({
                                ...f, [caja.id]: { ...gf, marca: e.target.value }
                              }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Modelo</label>
                            <Input
                              placeholder="Ej: SW-1, EP-15, SW-500"
                              value={gf.modelo}
                              onChange={(e) => setGrameraForm((f) => ({
                                ...f, [caja.id]: { ...gf, modelo: e.target.value }
                              }))}
                            />
                          </div>
                        </div>

                        {notaIA[caja.id] && (
                          <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                            {notaIA[caja.id]}
                          </p>
                        )}

                        <Button
                          onClick={() => void detectarGramera(caja)}
                          disabled={detectando === caja.id || !gf.marca.trim() || !gf.modelo.trim()}
                          className="w-full"
                        >
                          {detectando === caja.id ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Detectando protocolo...</>
                          ) : (
                            <><Scale className="h-4 w-4 mr-2" /> Detectar con IA</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={editando ? `Editar — ${editando.nombre}` : "Nueva caja"}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="caja-nombre">Nombre *</Label>
            <Input
              id="caja-nombre"
              autoFocus
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Caja principal, Caja 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caja-desc">Descripción (opcional)</Label>
            <Input
              id="caja-desc"
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              placeholder="Ej: Entrada principal"
            />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear caja"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
