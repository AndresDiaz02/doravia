import { useEffect, useState, useRef, type FormEvent } from "react";
import { Plus, Upload, Download } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo: "producto" | "servicio";
  precio_base: string;
  iva_pct: string;
  activo: boolean;
}

const emptyForm = {
  codigo: "",
  nombre: "",
  descripcion: "",
  tipo: "producto" as "producto" | "servicio",
  precio_base: "",
  iva_pct: "19",
};

export function Productos() {
  const { isContador } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<{ creados: number; actualizados: number; errores: { fila: number; mensaje: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void apiFetch<{ data: Producto[] }>("/api/productos?limit=200")
      .then((r) => setProductos(r.data))
      .finally(() => setLoading(false));
  }, []);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(p: Producto) {
    setEditing(p);
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      tipo: p.tipo,
      precio_base: p.precio_base,
      iva_pct: p.iva_pct,
    });
    setError(null);
    setOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const actualizado = await apiFetch<Producto>(`/api/productos/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nombre: form.nombre,
            descripcion: form.descripcion || null,
            precio_base: form.precio_base,
            iva_pct: form.iva_pct,
          }),
        });
        setProductos((prev) => prev.map((p) => (p.id === editing.id ? actualizado : p)));
      } else {
        const nuevo = await apiFetch<Producto>("/api/productos", {
          method: "POST",
          body: JSON.stringify({ ...form, descripcion: form.descripcion || null }),
        });
        setProductos((prev) => [...prev, nuevo]);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  function descargarPlantilla() {
    const token = localStorage.getItem("access_token");
    fetch("/api/productos/plantilla", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (r) => {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_productos.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  async function handleImportar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportando(true);
    setImportResult(null);
    try {
      const token = localStorage.getItem("access_token");
      const fd = new FormData();
      fd.append("archivo", file);
      const resp = await fetch("/api/productos/importar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await resp.json() as { creados: number; actualizados: number; errores: { fila: number; mensaje: string }[]; error?: string };
      if (!resp.ok) throw new Error(data.error ?? "Error al importar.");
      setImportResult(data);
      const { data: nuevos } = await apiFetch<{ data: Producto[] }>("/api/productos?limit=200");
      setProductos(nuevos);
    } catch (err) {
      setImportResult({ creados: 0, actualizados: 0, errores: [{ fila: 0, mensaje: err instanceof Error ? err.message : "Error desconocido" }] });
    } finally {
      setImportando(false);
    }
  }

  async function toggleActivo(p: Producto) {
    const actualizado = await apiFetch<Producto>(`/api/productos/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ activo: !p.activo }),
    });
    setProductos((prev) => prev.map((x) => (x.id === p.id ? actualizado : x)));
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Productos y servicios</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={descargarPlantilla}>
            <Download className="h-4 w-4" />
            Plantilla
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importando}>
            <Upload className="h-4 w-4" />
            {importando ? "Importando..." : "Importar Excel"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void handleImportar(e)} />
          {!isContador && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Nuevo
            </Button>
          )}
        </div>
      </div>

      {importResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${importResult.errores.length > 0 && importResult.creados + importResult.actualizados === 0 ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"}`}>
          <p className="font-medium">
            Importacion completada: {importResult.creados} creados, {importResult.actualizados} actualizados
            {importResult.errores.length > 0 && `, ${importResult.errores.length} errores`}
          </p>
          {importResult.errores.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {importResult.errores.slice(0, 5).map((e) => (
                <li key={e.fila}>Fila {e.fila}: {e.mensaje}</li>
              ))}
              {importResult.errores.length > 5 && <li>... y {importResult.errores.length - 5} mas</li>}
            </ul>
          )}
        </div>
      )}

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : productos.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Sin productos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Código</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Nombre</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Tipo</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Precio base</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">IVA</th>
                <th className="px-6 py-3 text-center font-medium text-gray-500">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productos.map((p) => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? "opacity-50" : ""}`}>
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">{p.codigo}</td>
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{p.nombre}</p>
                    {p.descripcion && <p className="text-xs text-gray-400">{p.descripcion}</p>}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={p.tipo === "producto" ? "blue" : "gray"}>
                      {p.tipo === "producto" ? "Producto" : "Servicio"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right font-medium">{cop(p.precio_base)}</td>
                  <td className="px-6 py-3 text-right text-gray-600">{p.iva_pct}%</td>
                  <td className="px-6 py-3 text-center">
                    <Badge variant={p.activo ? "green" : "gray"}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="mr-2 text-xs text-green-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void toggleActivo(p)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      {p.activo ? "Desactivar" : "Activar"}
                    </button>
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
        title={editing ? "Editar producto" : "Nuevo producto"}
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cod_p">Código *</Label>
              <Input
                id="cod_p"
                required
                disabled={!!editing}
                value={form.codigo}
                onChange={(e) => set("codigo", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <select
                value={form.tipo}
                onChange={(e) => set("tipo", e.target.value)}
                disabled={!!editing}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-50"
              >
                <option value="producto">Producto</option>
                <option value="servicio">Servicio</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nom_p">Nombre *</Label>
            <Input
              id="nom_p"
              required
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc_p">Descripción</Label>
            <Input
              id="desc_p"
              value={form.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="precio_p">Precio base *</Label>
              <Input
                id="precio_p"
                type="number"
                min="0"
                step="any"
                required
                value={form.precio_base}
                onChange={(e) => set("precio_base", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>IVA %</Label>
              <select
                value={form.iva_pct}
                onChange={(e) => set("iva_pct", e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="19">19%</option>
              </select>
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
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
