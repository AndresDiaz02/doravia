import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, FileDown } from "lucide-react";
import { apiFetch, ApiError, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";

interface RetencionConfig {
  id: string;
  nombre: string;
  tipo: "retefuente" | "reteiva" | "reteica";
  porcentaje: string;
  activo: boolean;
}

const TIPO_LABEL: Record<string, string> = {
  retefuente: "Retefuente",
  reteiva:    "Reteiva",
  reteica:    "Reteica",
};

const TIPO_COLOR: Record<string, "blue" | "green" | "yellow"> = {
  retefuente: "blue",
  reteiva:    "green",
  reteica:    "yellow",
};

const TIPOS_PREDEFINIDOS = [
  { nombre: "Retefuente servicios generales 11%", tipo: "retefuente", porcentaje: "11" },
  { nombre: "Retefuente servicios 6%",            tipo: "retefuente", porcentaje: "6" },
  { nombre: "Retefuente honorarios 11%",          tipo: "retefuente", porcentaje: "11" },
  { nombre: "Retefuente compras 2.5%",            tipo: "retefuente", porcentaje: "2.5" },
  { nombre: "Reteiva (15% del IVA)",              tipo: "reteiva",    porcentaje: "15" },
  { nombre: "Reteica Bogotá 0.414%",              tipo: "reteica",    porcentaje: "0.414" },
];

const emptyForm = { nombre: "", tipo: "retefuente" as "retefuente" | "reteiva" | "reteica", porcentaje: "" };

export default function Retenciones() {
  const { isContador } = useAuth();
  const [retenciones, setRetenciones] = useState<RetencionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void apiFetch<RetencionConfig[]>("/api/retenciones")
      .then(setRetenciones)
      .finally(() => setLoading(false));
  }, []);

  function openNew(prefill?: typeof emptyForm) {
    setForm(prefill ?? emptyForm);
    setError(null);
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const nueva = await apiFetch<RetencionConfig>("/api/retenciones", {
        method: "POST",
        body: JSON.stringify({ ...form, porcentaje: Number(form.porcentaje) }),
      });
      setRetenciones((prev) => [...prev, nueva]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(r: RetencionConfig) {
    const actualizada = await apiFetch<RetencionConfig>(`/api/retenciones/${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({ activo: !r.activo }),
    });
    setRetenciones((prev) => prev.map((x) => (x.id === r.id ? actualizada : x)));
  }

  async function handleEliminar(r: RetencionConfig) {
    if (!confirm(`¿Eliminar "${r.nombre}"?`)) return;
    await apiFetch(`/api/retenciones/${r.id}`, { method: "DELETE" });
    setRetenciones((prev) => prev.filter((x) => x.id !== r.id));
  }

  const activas = retenciones.filter((r) => r.activo);
  const inactivas = retenciones.filter((r) => !r.activo);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Retenciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configura las retenciones que aplican tus clientes (retefuente, reteiva, reteica)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={exportando} onClick={() => {
            setExportando(true);
            void descargarExcel("/api/exportar/retenciones", "certificado_retenciones.xlsx").finally(() => setExportando(false));
          }}>
            <FileDown className="h-4 w-4" />
            {exportando ? "Exportando..." : "Certificado Excel"}
          </Button>
          {!isContador && (
            <Button onClick={() => openNew()}>
              <Plus className="h-4 w-4" />
              Nueva retención
            </Button>
          )}
        </div>
      </div>

      {/* Predefinidas */}
      {retenciones.length === 0 && !loading && (
        <Card>
          <div className="p-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Tarifas más comunes en Colombia — haz clic para agregar:</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS_PREDEFINIDOS.map((t) => (
                <button
                  key={t.nombre}
                  onClick={() => openNew({ nombre: t.nombre, tipo: t.tipo as "retefuente" | "reteiva" | "reteica", porcentaje: t.porcentaje })}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:border-green-400 hover:text-green-700 transition-colors"
                >
                  + {t.nombre}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>
      ) : (
        <Card>
          {retenciones.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">Sin retenciones configuradas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Nombre</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Tipo</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Porcentaje</th>
                  <th className="px-6 py-3 text-center font-medium text-gray-500">Estado</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...activas, ...inactivas].map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${!r.activo ? "opacity-50" : ""}`}>
                    <td className="px-6 py-3 font-medium text-gray-900">{r.nombre}</td>
                    <td className="px-6 py-3">
                      <Badge variant={TIPO_COLOR[r.tipo] ?? "gray"}>{TIPO_LABEL[r.tipo]}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right font-mono">{r.porcentaje}%</td>
                    <td className="px-6 py-3 text-center">
                      <Badge variant={r.activo ? "green" : "gray"}>{r.activo ? "Activa" : "Inactiva"}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => void toggleActivo(r)} className="mr-3 text-xs text-gray-400 hover:text-gray-600">
                        {r.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button onClick={() => void handleEliminar(r)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Nueva retención">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ret_nombre">Nombre</Label>
            <Input id="ret_nombre" required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Retefuente servicios 11%" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select
                value={form.tipo}
                onChange={(e) => set("tipo", e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="retefuente">Retefuente</option>
                <option value="reteiva">Reteiva</option>
                <option value="reteica">Reteica</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret_pct">Porcentaje %</Label>
              <Input id="ret_pct" type="number" required step="0.001" min="0.001" max="100" value={form.porcentaje} onChange={(e) => set("porcentaje", e.target.value)} placeholder="Ej: 11" />
            </div>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
