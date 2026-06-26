import { useEffect, useState } from "react";
import { Lock, LockOpen, Plus } from "lucide-react";
import { apiFetch, ApiError, fecha } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface Periodo {
  id: string;
  nombre: string;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: "abierto" | "cerrado";
  cerrado_at: string | null;
}

export default function PeriodosContables() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", tipo: "mensual", fecha_inicio: "", fecha_fin: "" });

  async function cargar() {
    const data = await apiFetch<Periodo[]>("/api/contabilidad/periodos");
    setPeriodos(data);
  }

  useEffect(() => {
    void cargar().finally(() => setLoading(false));
  }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/api/contabilidad/periodos", {
        method: "POST",
        body: JSON.stringify(form),
      });
      await cargar();
      setOpenDialog(false);
      setForm({ nombre: "", tipo: "mensual", fecha_inicio: "", fecha_fin: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el período.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleCambiarEstado(id: string, accion: "cerrar" | "reabrir") {
    try {
      const updated = await apiFetch<Periodo>(`/api/contabilidad/periodos/${id}/${accion}`, { method: "PATCH" });
      setPeriodos((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Error.");
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Períodos contables</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cierra un período para proteger sus asientos y evitar modificaciones accidentales.</p>
        </div>
        <Button onClick={() => setOpenDialog(true)}>
          <Plus className="h-4 w-4" />
          Nuevo período
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Períodos registrados</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
          ) : periodos.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">No hay períodos registrados. Crea el primero para empezar a controlar cierres.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Período</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Tipo</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Fechas</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Estado</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Cerrado el</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {periodos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{p.nombre}</td>
                    <td className="px-6 py-3 capitalize text-gray-600">{p.tipo}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {fecha(p.fecha_inicio)} — {fecha(p.fecha_fin)}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={p.estado === "cerrado" ? "red" : "green"}>
                        {p.estado === "cerrado" ? "Cerrado" : "Abierto"}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-gray-500">{p.cerrado_at ? fecha(p.cerrado_at) : "—"}</td>
                    <td className="px-6 py-3 text-right">
                      {p.estado === "abierto" ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (confirm(`¿Cerrar el período "${p.nombre}"? Los asientos en este rango quedarán bloqueados.`)) {
                              void handleCambiarEstado(p.id, "cerrar");
                            }
                          }}
                        >
                          <Lock className="h-4 w-4" />
                          Cerrar
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => void handleCambiarEstado(p.id, "reabrir")}
                        >
                          <LockOpen className="h-4 w-4" />
                          Reabrir
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} title="Nuevo período contable">
        <form onSubmit={(e) => void handleCrear(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p_nombre">Nombre *</Label>
            <Input id="p_nombre" required placeholder="Ej: Enero 2026" value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p_inicio">Fecha inicio *</Label>
              <Input id="p_inicio" type="date" required value={form.fecha_inicio}
                onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p_fin">Fecha fin *</Label>
              <Input id="p_fin" type="date" required value={form.fecha_fin}
                onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
              <option value="trimestral">Trimestral</option>
            </select>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? "Guardando..." : "Crear período"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
