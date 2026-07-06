import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Truck, FileDown } from "lucide-react";
import { apiFetch, ApiError, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface Proveedor {
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
  activo: boolean;
}

const TIPOS_DOC = ["NIT", "CC", "CE", "PPN", "Otro"];

const formVacio = {
  nombre: "",
  tipo_documento: "NIT",
  nit: "",
  correo: "",
  telefono: "",
  direccion: "",
  ciudad: "",
  persona_contacto: "",
  terminos_pago: "0",
  observaciones: "",
};

export default function Proveedores() {
  const { isContador } = useAuth();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(formVacio);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void apiFetch<Proveedor[]>("/api/gastos/proveedores")
      .then(setProveedores)
      .finally(() => setLoading(false));
  }, []);

  function abrirNuevo() {
    setEditando(null);
    setForm(formVacio);
    setError(null);
    setOpen(true);
  }

  function abrirEditar(p: Proveedor) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      tipo_documento: p.tipo_documento ?? "NIT",
      nit: p.nit ?? "",
      correo: p.correo ?? "",
      telefono: p.telefono ?? "",
      direccion: p.direccion ?? "",
      ciudad: p.ciudad ?? "",
      persona_contacto: p.persona_contacto ?? "",
      terminos_pago: String(p.terminos_pago ?? 0),
      observaciones: "",
    });
    setError(null);
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
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
      };

      if (editando) {
        const actualizado = await apiFetch<Proveedor>(`/api/gastos/proveedores/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setProveedores((prev) =>
          prev.map((p) => (p.id === actualizado.id ? actualizado : p))
        );
      } else {
        const nuevo = await apiFetch<Proveedor>("/api/gastos/proveedores", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setProveedores((prev) => [nuevo, ...prev]);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  const filtrados = proveedores.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.nit ?? "").toLowerCase().includes(q) ||
      (p.ciudad ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Proveedores</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {proveedores.filter((p) => p.activo).length} activos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void descargarExcel("/api/exportar/proveedores", "proveedores.xlsx")}>
            <FileDown className="h-4 w-4" />
            Excel
          </Button>
          {!isContador && (
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" />
              Nuevo proveedor
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, NIT, ciudad…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <Truck className="h-8 w-8" />
            <p className="text-sm">
              {search ? "Sin resultados para la búsqueda" : "Sin proveedores registrados"}
            </p>
            {!search && !isContador && (
              <Button variant="secondary" size="sm" onClick={abrirNuevo}>
                Agregar primero
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Nombre</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Documento</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Ciudad</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Contacto</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Crédito</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link
                      to={`/proveedores/${p.id}`}
                      className="font-medium text-green-700 hover:underline"
                    >
                      {p.nombre}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {p.nit ? `${p.tipo_documento} ${p.nit}` : p.tipo_documento}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{p.ciudad ?? "—"}</td>
                  <td className="px-6 py-3 text-gray-500">
                    <div>{p.persona_contacto ?? "—"}</div>
                    {p.telefono && (
                      <div className="text-xs text-gray-400">{p.telefono}</div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {p.terminos_pago > 0 ? `${p.terminos_pago} días` : "Contado"}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={p.activo ? "green" : "gray"}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {!isContador && (
                      <button
                        onClick={() => abrirEditar(p)}
                        className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editando ? "Editar proveedor" : "Nuevo proveedor"}
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="prov_nombre">Nombre / Razón social *</Label>
              <Input
                id="prov_nombre"
                required
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de documento</Label>
              <select
                value={form.tipo_documento}
                onChange={(e) => set("tipo_documento", e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {TIPOS_DOC.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov_nit">Número de documento</Label>
              <Input
                id="prov_nit"
                value={form.nit}
                onChange={(e) => set("nit", e.target.value)}
                placeholder="900123456-7"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov_telefono">Teléfono</Label>
              <Input
                id="prov_telefono"
                value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov_correo">Correo</Label>
              <Input
                id="prov_correo"
                type="email"
                value={form.correo}
                onChange={(e) => set("correo", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov_ciudad">Ciudad</Label>
              <Input
                id="prov_ciudad"
                value={form.ciudad}
                onChange={(e) => set("ciudad", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prov_terminos">Términos de pago (días)</Label>
              <Input
                id="prov_terminos"
                type="number"
                min="0"
                value={form.terminos_pago}
                onChange={(e) => set("terminos_pago", e.target.value)}
                placeholder="0 = contado"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="prov_direccion">Dirección</Label>
              <Input
                id="prov_direccion"
                value={form.direccion}
                onChange={(e) => set("direccion", e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="prov_contacto">Persona de contacto</Label>
              <Input
                id="prov_contacto"
                value={form.persona_contacto}
                onChange={(e) => set("persona_contacto", e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : editando ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
