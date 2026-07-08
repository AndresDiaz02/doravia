import { useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, TrendingDown } from "lucide-react";
import { apiFetch, ApiError, cop, fecha } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface ActivoFijo {
  id: string;
  descripcion: string;
  categoria: string | null;
  valor_adquisicion: string;
  valor_residual: string;
  depreciacion_acumulada: string;
  valor_neto: string;
  vida_util_meses: number;
  metodo: "lineal" | "reduccion_saldos";
  fecha_adquisicion: string;
  fecha_inicio_depreciacion: string;
  cuenta_activo: string | null;
  cuenta_depreciacion: string | null;
  cuenta_gasto: string | null;
  estado: "activo" | "depreciado" | "dado_de_baja";
  observaciones: string | null;
}

interface Depreciacion {
  id: string;
  ano: number;
  mes: number;
  valor: string;
  valor_neto_al_final: string;
}

interface ActivoDetalle extends ActivoFijo {
  depreciaciones: Depreciacion[];
}

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const emptyForm = {
  descripcion: "",
  categoria: "",
  valor_adquisicion: "",
  valor_residual: "0",
  vida_util_meses: "60",
  metodo: "lineal" as "lineal" | "reduccion_saldos",
  fecha_adquisicion: new Date().toISOString().slice(0, 10),
  cuenta_activo: "",
  cuenta_depreciacion: "",
  cuenta_gasto: "",
  observaciones: "",
};

export default function ActivosFijos() {
  const [activos, setActivos] = useState<ActivoFijo[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNuevo, setOpenNuevo] = useState(false);
  const [openDetalle, setOpenDetalle] = useState(false);
  const [detalle, setDetalle] = useState<ActivoDetalle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depreciando, setDepreciando] = useState(false);
  const [mensajeDepr, setMensajeDepr] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    try {
      const rows = await apiFetch<ActivoFijo[]>("/api/activos-fijos");
      setActivos(rows);
    } finally {
      setLoading(false);
    }
  }

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/activos-fijos", {
        method: "POST",
        body: JSON.stringify({
          descripcion: form.descripcion,
          categoria: form.categoria || undefined,
          valor_adquisicion: Number(form.valor_adquisicion),
          valor_residual: Number(form.valor_residual),
          vida_util_meses: Number(form.vida_util_meses),
          metodo: form.metodo,
          fecha_adquisicion: form.fecha_adquisicion,
          cuenta_activo: form.cuenta_activo || undefined,
          cuenta_depreciacion: form.cuenta_depreciacion || undefined,
          cuenta_gasto: form.cuenta_gasto || undefined,
          observaciones: form.observaciones || undefined,
        }),
      });
      setOpenNuevo(false);
      setForm(emptyForm);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function verDetalle(activo: ActivoFijo) {
    const d = await apiFetch<ActivoDetalle>(`/api/activos-fijos/${activo.id}`);
    setDetalle(d);
    setMensajeDepr(null);
    setOpenDetalle(true);
  }

  async function calcularDepreciacion() {
    if (!detalle) return;
    setDepreciando(true);
    setMensajeDepr(null);
    try {
      const hoy = new Date();
      const resp = await apiFetch<{ valor_depreciado: number; valor_neto_nuevo: number; estado_activo: string }>(
        `/api/activos-fijos/${detalle.id}/calcular-depreciacion`,
        {
          method: "POST",
          body: JSON.stringify({ ano: hoy.getFullYear(), mes: hoy.getMonth() + 1 }),
        },
      );
      setMensajeDepr(`Depreciación registrada: ${cop(resp.valor_depreciado)}. Valor neto: ${cop(resp.valor_neto_nuevo)}`);
      const d = await apiFetch<ActivoDetalle>(`/api/activos-fijos/${detalle.id}`);
      setDetalle(d);
      await cargar();
    } catch (err) {
      setMensajeDepr(err instanceof ApiError ? err.message : "Error al calcular depreciación.");
    } finally {
      setDepreciando(false);
    }
  }

  const estadoBadge: Record<string, "green" | "gray" | "red"> = {
    activo: "green",
    depreciado: "gray",
    dado_de_baja: "red",
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Activos fijos</h1>
        <Button onClick={() => { setForm(emptyForm); setError(null); setOpenNuevo(true); }}>
          <Plus className="h-4 w-4" />
          Nuevo activo
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : activos.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">No hay activos fijos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Descripción</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Método</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Valor adquisición</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Depr. acumulada</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Valor neto</th>
                <th className="px-6 py-3 text-center font-medium text-gray-500">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activos.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{a.descripcion}</p>
                    {a.categoria && <p className="text-xs text-gray-400">{a.categoria}</p>}
                    <p className="text-xs text-gray-400">{fecha(a.fecha_adquisicion)} · {a.vida_util_meses} meses</p>
                  </td>
                  <td className="px-6 py-3 text-gray-600 capitalize">{a.metodo === "lineal" ? "Lineal" : "Reducción saldos"}</td>
                  <td className="px-6 py-3 text-right">{cop(a.valor_adquisicion)}</td>
                  <td className="px-6 py-3 text-right text-red-600">{cop(a.depreciacion_acumulada)}</td>
                  <td className="px-6 py-3 text-right font-medium">{cop(a.valor_neto)}</td>
                  <td className="px-6 py-3 text-center">
                    <Badge variant={estadoBadge[a.estado] ?? "gray"}>
                      {a.estado === "activo" ? "Activo" : a.estado === "depreciado" ? "Depreciado" : "Dado de baja"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => void verDetalle(a)}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Dialog: Nuevo activo */}
      <Dialog open={openNuevo} onClose={() => setOpenNuevo(false)} title="Nuevo activo fijo">
        <form onSubmit={(e) => void handleCrear(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Descripción *</Label>
            <Input required value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Ej. Computador portátil Dell" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Input value={form.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="Ej. Equipo de cómputo" />
            </div>
            <div className="space-y-1.5">
              <Label>Método depreciación</Label>
              <select value={form.metodo} onChange={(e) => set("metodo", e.target.value)} className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                <option value="lineal">Línea recta</option>
                <option value="reduccion_saldos">Reducción de saldos</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor adquisición *</Label>
              <Input required type="number" min="0" step="any" value={form.valor_adquisicion} onChange={(e) => set("valor_adquisicion", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor residual</Label>
              <Input type="number" min="0" step="any" value={form.valor_residual} onChange={(e) => set("valor_residual", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Vida útil (meses) *</Label>
              <Input required type="number" min="1" value={form.vida_util_meses} onChange={(e) => set("vida_util_meses", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha adquisición *</Label>
              <Input required type="date" value={form.fecha_adquisicion} onChange={(e) => set("fecha_adquisicion", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Cuenta activo (PUC)</Label>
              <Input placeholder="1524" value={form.cuenta_activo} onChange={(e) => set("cuenta_activo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta depr. acumulada</Label>
              <Input placeholder="159205" value={form.cuenta_depreciacion} onChange={(e) => set("cuenta_depreciacion", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta gasto depr.</Label>
              <Input placeholder="519905" value={form.cuenta_gasto} onChange={(e) => set("cuenta_gasto", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Input value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </Dialog>

      {/* Dialog: Detalle y depreciación */}
      <Dialog open={openDetalle} onClose={() => setOpenDetalle(false)} title={detalle?.descripcion ?? ""}>
        {detalle && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Valor adquisición:</span> <span className="font-medium">{cop(detalle.valor_adquisicion)}</span></div>
              <div><span className="text-gray-500">Valor neto:</span> <span className="font-medium">{cop(detalle.valor_neto)}</span></div>
              <div><span className="text-gray-500">Depr. acumulada:</span> <span className="font-medium text-red-600">{cop(detalle.depreciacion_acumulada)}</span></div>
              <div><span className="text-gray-500">Vida útil:</span> <span className="font-medium">{detalle.vida_util_meses} meses</span></div>
              <div><span className="text-gray-500">Método:</span> <span className="font-medium capitalize">{detalle.metodo === "lineal" ? "Línea recta" : "Reducción saldos"}</span></div>
              <div><span className="text-gray-500">Estado:</span> <span className="font-medium capitalize">{detalle.estado}</span></div>
            </div>

            {detalle.estado === "activo" && (
              <div className="space-y-2">
                <Button variant="secondary" onClick={() => void calcularDepreciacion()} disabled={depreciando}>
                  <TrendingDown className="h-4 w-4" />
                  {depreciando ? "Calculando..." : "Calcular depreciación del mes"}
                </Button>
                {mensajeDepr && (
                  <p className={`text-sm rounded-md px-3 py-2 ${mensajeDepr.startsWith("Depreciación") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {mensajeDepr}
                  </p>
                )}
              </div>
            )}

            {detalle.depreciaciones.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Historial de depreciaciones</h3>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">Periodo</th>
                      <th className="px-3 py-2 text-right text-gray-500">Depreciación</th>
                      <th className="px-3 py-2 text-right text-gray-500">Valor neto final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detalle.depreciaciones.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2">{MESES[d.mes]} {d.ano}</td>
                        <td className="px-3 py-2 text-right text-red-600">{cop(d.valor)}</td>
                        <td className="px-3 py-2 text-right">{cop(d.valor_neto_al_final)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setOpenDetalle(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
