import { useEffect, useState } from "react";
import { Plus, Monitor, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";

interface Caja {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
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

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cajas POS</h1>
          <p className="text-sm text-gray-500 mt-0.5">Administra las cajas registradoras del punto de venta</p>
        </div>
        <Button onClick={abrirCrear}>
          <Plus className="h-4 w-4 mr-1.5" /> Nueva caja
        </Button>
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
        <div className="space-y-2">
          {cajas.map((caja) => (
            <div
              key={caja.id}
              className={`rounded-xl border bg-white p-4 flex items-center gap-4 ${
                caja.activo ? "border-gray-200" : "border-gray-100 opacity-60"
              }`}
            >
              <div className={`rounded-lg p-2.5 ${caja.activo ? "bg-blue-50" : "bg-gray-100"}`}>
                <Monitor className={`h-5 w-5 ${caja.activo ? "text-blue-600" : "text-gray-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{caja.nombre}</p>
                {caja.descripcion && <p className="text-sm text-gray-400 truncate">{caja.descripcion}</p>}
                <p className="text-xs text-gray-300 mt-0.5">
                  Creada {new Date(caja.created_at).toLocaleDateString("es-CO")}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  caja.activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {caja.activo ? "Activa" : "Inactiva"}
                </span>
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
          ))}
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
