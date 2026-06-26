import { useEffect, useState, type FormEvent } from "react";
import { Plus, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError, fecha } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface Resolucion {
  id: string;
  numero_resolucion: string;
  fecha_resolucion: string;
  prefijo: string;
  consecutivo_desde: number;
  consecutivo_hasta: number;
  consecutivo_actual: number;
  fecha_desde: string;
  fecha_hasta: string;
  activa: boolean;
  created_at: string;
}

const emptyForm = {
  numero_resolucion: "",
  fecha_resolucion: "",
  prefijo: "",
  consecutivo_desde: "",
  consecutivo_hasta: "",
  fecha_desde: "",
  fecha_hasta: "",
};

export function ResolucionesDian() {
  const [resoluciones, setResoluciones] = useState<Resolucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void apiFetch<Resolucion[]>("/api/resoluciones-dian")
      .then(setResoluciones)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const nueva = await apiFetch<Resolucion>("/api/resoluciones-dian", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          consecutivo_desde: Number(form.consecutivo_desde),
          consecutivo_hasta: Number(form.consecutivo_hasta),
        }),
      });
      setResoluciones((prev) =>
        [nueva, ...prev.map((r) => ({ ...r, activa: false }))],
      );
      setShowForm(false);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function activar(id: string) {
    const actualizada = await apiFetch<Resolucion>(`/api/resoluciones-dian/${id}/activar`, {
      method: "PATCH",
    });
    setResoluciones((prev) =>
      prev.map((r) => (r.id === id ? actualizada : { ...r, activa: false })),
    );
  }

  const activa = resoluciones.find((r) => r.activa);
  const usadas = activa ? activa.consecutivo_actual - activa.consecutivo_desde : 0;
  const disponibles = activa ? activa.consecutivo_hasta - activa.consecutivo_actual + 1 : 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Resolución DIAN</h1>
          <p className="text-sm text-gray-500">
            Necesitas una resolución activa para emitir facturas electrónicas
          </p>
        </div>
        <Button onClick={() => { setError(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" />
          Registrar resolución
        </Button>
      </div>

      {/* Resolución activa */}
      {activa && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-5 w-5" />
              Resolución activa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Dato label="N.º Resolución" value={activa.numero_resolucion} />
              <Dato label="Prefijo" value={activa.prefijo} />
              <Dato
                label="Rango"
                value={`${activa.consecutivo_desde} – ${activa.consecutivo_hasta}`}
              />
              <Dato
                label="Consecutivo actual"
                value={String(activa.consecutivo_actual)}
              />
              <Dato label="Vigente desde" value={fecha(activa.fecha_desde)} />
              <Dato label="Vigente hasta" value={fecha(activa.fecha_hasta)} />
              <Dato label="Usadas" value={String(usadas)} />
              <Dato
                label="Disponibles"
                value={String(disponibles)}
                bold={disponibles < 50}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {!activa && !loading && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          No hay una resolución DIAN activa. Registra una para poder emitir facturas electrónicas.
        </div>
      )}

      {/* Formulario nueva resolución */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva resolución</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="num_res">N.º de resolución DIAN *</Label>
                  <Input
                    id="num_res"
                    required
                    value={form.numero_resolucion}
                    onChange={(e) => set("numero_resolucion", e.target.value)}
                    placeholder="18764024157"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fecha_res">Fecha de la resolución *</Label>
                  <Input
                    id="fecha_res"
                    type="date"
                    required
                    value={form.fecha_resolucion}
                    onChange={(e) => set("fecha_resolucion", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pref">Prefijo *</Label>
                  <Input
                    id="pref"
                    required
                    value={form.prefijo}
                    onChange={(e) => set("prefijo", e.target.value)}
                    placeholder="FV"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-1" />
                <div className="space-y-1.5">
                  <Label htmlFor="cons_desde">Consecutivo desde *</Label>
                  <Input
                    id="cons_desde"
                    type="number"
                    min="1"
                    required
                    value={form.consecutivo_desde}
                    onChange={(e) => set("consecutivo_desde", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cons_hasta">Consecutivo hasta *</Label>
                  <Input
                    id="cons_hasta"
                    type="number"
                    min="1"
                    required
                    value={form.consecutivo_hasta}
                    onChange={(e) => set("consecutivo_hasta", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f_desde">Vigente desde *</Label>
                  <Input
                    id="f_desde"
                    type="date"
                    required
                    value={form.fecha_desde}
                    onChange={(e) => set("fecha_desde", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f_hasta">Vigente hasta *</Label>
                  <Input
                    id="f_hasta"
                    type="date"
                    required
                    value={form.fecha_hasta}
                    onChange={(e) => set("fecha_hasta", e.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Al registrar esta resolución quedará activa automáticamente y la anterior pasará a inactiva.
              </p>

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Registrar y activar"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Historial */}
      {resoluciones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de resoluciones</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">N.º Resolución</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Prefijo</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Rango</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Vigencia</th>
                  <th className="px-6 py-3 text-center font-medium text-gray-500">Estado</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resoluciones.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{r.numero_resolucion}</td>
                    <td className="px-6 py-3 font-mono text-gray-600">{r.prefijo}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {r.consecutivo_desde} – {r.consecutivo_hasta}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {fecha(r.fecha_desde)} → {fecha(r.fecha_hasta)}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <Badge variant={r.activa ? "green" : "gray"}>
                        {r.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {!r.activa && (
                        <button
                          onClick={() => void activar(r.id)}
                          className="text-xs text-green-600 hover:underline"
                        >
                          Activar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Dato({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-green-700/60">{label}</p>
      <p className={`text-green-900 ${bold ? "font-bold text-orange-700" : "font-medium"}`}>
        {value}
      </p>
    </div>
  );
}
