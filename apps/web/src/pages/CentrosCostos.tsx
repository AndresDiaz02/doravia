import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Plus, BarChart2, Building } from "lucide-react";

interface CentroCosto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface ReporteCentro {
  centro: CentroCosto;
  contabilidad: { debito: number; credito: number; neto: number };
  gastos_directos: number;
}

const emptyForm = { codigo: "", nombre: "", descripcion: "" };

export default function CentrosCostos() {
  const { isContador } = useAuth();
  const [centros, setCentros] = useState<CentroCosto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CentroCosto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [guardando, setGuardando] = useState(false);
  const [reporte, setReporte] = useState<ReporteCentro | null>(null);
  const [reporteId, setReporteId] = useState<string | null>(null);
  const [loadingReporte, setLoadingReporte] = useState(false);

  async function cargar() {
    try {
      const rows = await apiFetch<CentroCosto[]>("/api/centros-costos");
      setCentros(rows);
    } catch { setError("No se pudo cargar los centros de costos."); }
    finally { setLoading(false); }
  }

  useEffect(() => { cargar(); }, []);

  function abrir(cc?: CentroCosto) {
    setEditing(cc ?? null);
    setForm(cc ? { codigo: cc.codigo, nombre: cc.nombre, descripcion: cc.descripcion ?? "" } : emptyForm);
    setDialogOpen(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!form.codigo || !form.nombre) return;
    setGuardando(true);
    try {
      if (editing) {
        await apiFetch(`/api/centros-costos/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre: form.nombre, descripcion: form.descripcion || null }),
        });
      } else {
        await apiFetch("/api/centros-costos", {
          method: "POST",
          body: JSON.stringify({ codigo: form.codigo, nombre: form.nombre, descripcion: form.descripcion || null }),
        });
      }
      setDialogOpen(false);
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally { setGuardando(false); }
  }

  async function toggleActivo(cc: CentroCosto) {
    try {
      await apiFetch(`/api/centros-costos/${cc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !cc.activo }),
      });
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error.");
    }
  }

  async function verReporte(id: string) {
    setReporteId(id);
    setLoadingReporte(true);
    try {
      const r = await apiFetch<ReporteCentro>(`/api/centros-costos/${id}/reporte`);
      setReporte(r);
    } catch { setError("No se pudo cargar el reporte."); }
    finally { setLoadingReporte(false); }
  }

  if (loading) return <p className="p-8 text-gray-500">Cargando centros de costos…</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Centros de costos</h1>
          <p className="text-sm text-gray-500 mt-1">Distribuye gastos e ingresos por área, proyecto o sucursal</p>
        </div>
        {!isContador && (
          <Button onClick={() => abrir()}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo centro
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {centros.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <Building className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">No hay centros de costos. Crea el primero para empezar a distribuir gastos.</p>
            {!isContador && <Button onClick={() => abrir()}><Plus className="w-4 h-4 mr-1" /> Crear centro</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {centros.map((cc) => (
            <Card key={cc.id} className={cc.activo ? "" : "opacity-60"}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{cc.codigo}</span>
                      {!cc.activo && <Badge variant="gray">Inactivo</Badge>}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mt-1">{cc.nombre}</h3>
                    {cc.descripcion && <p className="text-sm text-gray-500 mt-0.5">{cc.descripcion}</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="text-xs text-green-600 hover:underline"
                    onClick={() => void verReporte(cc.id)}
                  >
                    <BarChart2 className="w-3.5 h-3.5 inline mr-0.5" /> Ver reporte
                  </button>
                  <span className="text-gray-300">|</span>
                  <button className="text-xs text-gray-500 hover:underline" onClick={() => abrir(cc)}>Editar</button>
                  <span className="text-gray-300">|</span>
                  <button className="text-xs text-gray-500 hover:underline" onClick={() => void toggleActivo(cc)}>
                    {cc.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Editar centro de costo" : "Nuevo centro de costo"}>
        <form onSubmit={(e) => void guardar(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="Ej: ADM, VENTAS, PROD"
                disabled={!!editing}
              />
            </div>
            <div>
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Administración" />
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Descripción</Label>
            <Input id="desc" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Opcional" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando || !form.codigo || !form.nombre}>{guardando ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </Dialog>

      {/* Dialog reporte */}
      <Dialog open={reporteId !== null} onClose={() => { setReporteId(null); setReporte(null); }} title="Reporte del centro de costo">
        {loadingReporte ? (
          <p className="text-sm text-gray-500 py-4">Cargando reporte…</p>
        ) : reporte ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700">{reporte.centro.codigo} — {reporte.centro.nombre}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-xs text-green-700 mb-1">Ingresos (créditos)</p>
                <p className="font-semibold text-green-800">{cop(reporte.contabilidad.credito)}</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                <p className="text-xs text-red-700 mb-1">Egresos (débitos)</p>
                <p className="font-semibold text-red-800">{cop(reporte.contabilidad.debito)}</p>
              </div>
              <div className={`rounded-lg border p-3 text-center ${reporte.contabilidad.neto >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
                <p className="text-xs text-gray-600 mb-1">Neto contable</p>
                <p className={`font-semibold ${reporte.contabilidad.neto >= 0 ? "text-blue-800" : "text-orange-700"}`}>
                  {cop(reporte.contabilidad.neto)}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-600">Gastos directos asignados</span>
              <span className="font-medium">{cop(reporte.gastos_directos)}</span>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
