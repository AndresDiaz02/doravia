import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, Clock, Edit2 } from "lucide-react";
import { apiFetch, ApiError, cop, fecha } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface GastoHistorial {
  id: string;
  descripcion: string;
  categoria: string;
  fecha: string;
  total: string;
  estado: string;
}

interface ProveedorDetalle {
  id: string;
  nombre: string;
  tipo_documento: string;
  nit: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  persona_contacto: string | null;
  terminos_pago: number;
  observaciones: string | null;
  activo: boolean;
  historial: GastoHistorial[];
  totalCompras: number;
  totalPendiente: number;
}

const CATEGORIA_LABEL: Record<string, string> = {
  arrendamiento: "Arrendamiento", nomina: "Nómina",
  servicios_publicos: "Servicios públicos", transporte: "Transporte",
  publicidad: "Publicidad", papeleria: "Papelería",
  tecnologia: "Tecnología", mantenimiento: "Mantenimiento",
  impuestos: "Impuestos", honorarios: "Honorarios",
  compra_mercancia: "Compra de mercancía", otros: "Otros",
};

const ESTADO_BADGE: Record<string, "yellow" | "green" | "blue"> = {
  borrador: "yellow", aprobado: "blue", pagado: "green",
};

const TIPOS_DOC = ["NIT", "CC", "CE", "PPN", "Otro"];

export default function ProveedorDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isContador } = useAuth();
  const [prov, setProv] = useState<ProveedorDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "", tipo_documento: "NIT", nit: "", correo: "",
    telefono: "", direccion: "", ciudad: "", persona_contacto: "",
    terminos_pago: "0", observaciones: "", activo: true,
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void apiFetch<ProveedorDetalle>(`/api/gastos/proveedores/${id!}`)
      .then((data) => {
        setProv(data);
        setForm({
          nombre: data.nombre,
          tipo_documento: data.tipo_documento ?? "NIT",
          nit: data.nit ?? "",
          correo: data.correo ?? "",
          telefono: data.telefono ?? "",
          direccion: data.direccion ?? "",
          ciudad: data.ciudad ?? "",
          persona_contacto: data.persona_contacto ?? "",
          terminos_pago: String(data.terminos_pago ?? 0),
          observaciones: data.observaciones ?? "",
          activo: data.activo,
        });
      })
      .catch(() => navigate("/proveedores", { replace: true }))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  async function handleSave() {
    if (!prov) return;
    setSaving(true);
    setError(null);
    try {
      const actualizado = await apiFetch<ProveedorDetalle>(`/api/gastos/proveedores/${prov.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          tipo_documento: form.tipo_documento,
          nit: form.nit.trim() || null,
          correo: form.correo.trim() || null,
          telefono: form.telefono.trim() || null,
          direccion: form.direccion.trim() || null,
          ciudad: form.ciudad.trim() || null,
          persona_contacto: form.persona_contacto.trim() || null,
          terminos_pago: Number(form.terminos_pago) || 0,
          observaciones: form.observaciones.trim() || null,
          activo: form.activo,
        }),
      });
      setProv((prev) => prev ? { ...prev, ...actualizado } : prev);
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center text-sm text-gray-400">Cargando...</div>
  );
  if (!prov) return null;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{prov.nombre}</h1>
              <Badge variant={prov.activo ? "green" : "gray"}>
                {prov.activo ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <p className="text-sm text-gray-500">
              {prov.tipo_documento} {prov.nit ?? "Sin documento"}
            </p>
          </div>
        </div>
        {!isContador && (
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4" />
            Editar
          </Button>
        )}
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Total compras registradas</p>
            <p className="text-xl font-semibold text-gray-900">{cop(prov.totalCompras)}</p>
            <p className="text-xs text-gray-400">{prov.historial.length} registros</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Saldo pendiente (CxP)</p>
            <p className={`text-xl font-semibold ${prov.totalPendiente > 0 ? "text-red-600" : "text-gray-900"}`}>
              {cop(prov.totalPendiente)}
            </p>
            <p className="text-xs text-gray-400">
              {prov.historial.filter((g) => g.estado !== "pagado").length} gastos sin pagar
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500">Términos de pago</p>
            <p className="text-xl font-semibold text-gray-900">
              {prov.terminos_pago > 0 ? `${prov.terminos_pago} días` : "Contado"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Info de contacto */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Información</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {prov.telefono && (
              <div className="flex items-center gap-2 text-gray-700">
                <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                {prov.telefono}
              </div>
            )}
            {prov.correo && (
              <div className="flex items-center gap-2 text-gray-700">
                <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <a href={`mailto:${prov.correo}`} className="hover:underline">{prov.correo}</a>
              </div>
            )}
            {(prov.direccion || prov.ciudad) && (
              <div className="flex items-start gap-2 text-gray-700">
                <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{[prov.direccion, prov.ciudad].filter(Boolean).join(", ")}</span>
              </div>
            )}
            {prov.persona_contacto && (
              <div>
                <p className="text-xs text-gray-400">Contacto</p>
                <p className="text-gray-700">{prov.persona_contacto}</p>
              </div>
            )}
            {prov.observaciones && (
              <div>
                <p className="text-xs text-gray-400">Observaciones</p>
                <p className="text-gray-700">{prov.observaciones}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historial de gastos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              Historial de compras
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {prov.historial.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-400">
                Sin compras registradas aún.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">Descripción</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">Categoría</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prov.historial.map((g) => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900 max-w-xs truncate">{g.descripcion}</td>
                      <td className="px-6 py-3 text-gray-500">
                        {CATEGORIA_LABEL[g.categoria] ?? g.categoria}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{fecha(g.fecha)}</td>
                      <td className="px-6 py-3 text-right font-medium">{cop(g.total)}</td>
                      <td className="px-6 py-3">
                        <Badge variant={ESTADO_BADGE[g.estado] ?? "gray"}>
                          {g.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog editar */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Editar proveedor">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nombre / Razón social *</Label>
              <Input required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de documento</Label>
              <select
                value={form.tipo_documento}
                onChange={(e) => set("tipo_documento", e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {TIPOS_DOC.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Número de documento</Label>
              <Input value={form.nit} onChange={(e) => set("nit", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Correo</Label>
              <Input type="email" value={form.correo} onChange={(e) => set("correo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Términos de pago (días)</Label>
              <Input type="number" min="0" value={form.terminos_pago} onChange={(e) => set("terminos_pago", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Dirección</Label>
              <Input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Persona de contacto</Label>
              <Input value={form.persona_contacto} onChange={(e) => set("persona_contacto", e.target.value)} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="prov_activo"
                type="checkbox"
                checked={form.activo}
                onChange={(e) => set("activo", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="prov_activo">Proveedor activo</Label>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
