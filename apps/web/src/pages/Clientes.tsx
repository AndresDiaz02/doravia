import { useEffect, useState, useRef, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, FileDown, Upload, Download } from "lucide-react";
import { apiFetchPaged, apiFetch, ApiError, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Card } from "../components/ui/card";

interface Cliente {
  id: string;
  tipo_persona: string;
  tipo_documento: string;
  numero_documento: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  municipio: string | null;
  activo: boolean;
}

const TIPOS_DOC = ["CC", "NIT", "CE", "PPN", "TI"];
const TIPOS_PERSONA = ["natural", "juridica"];

export function Clientes() {
  const { isContador } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<{ importados: number; actualizados: number; errores: { fila: number; mensaje: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    tipo_persona: "natural",
    tipo_documento: "CC",
    numero_documento: "",
    digito_verificacion: "",
    nombre: "",
    correo: "",
    telefono: "",
    direccion: "",
    municipio: "",
    departamento: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void apiFetchPaged<Cliente>("/api/clientes", 1, 200)
      .then((r) => setClientes(r.data))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const nuevo = await apiFetch<Cliente>("/api/clientes", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setClientes((prev) => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setOpen(false);
      setForm({
        tipo_persona: "natural", tipo_documento: "CC", numero_documento: "",
        digito_verificacion: "", nombre: "", correo: "", telefono: "",
        direccion: "", municipio: "", departamento: "",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  function descargarPlantilla() {
    const token = localStorage.getItem("access_token");
    fetch("/api/clientes/plantilla-importacion", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (r) => {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_clientes.csv";
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
      const resp = await fetch("/api/clientes/importar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await resp.json() as { importados: number; actualizados: number; errores: { fila: number; mensaje: string }[]; error?: string };
      if (!resp.ok) throw new Error(data.error ?? "Error al importar.");
      setImportResult(data);
      const r = await apiFetchPaged<Cliente>("/api/clientes", 1, 200);
      setClientes(r.data);
    } catch (err) {
      setImportResult({ importados: 0, actualizados: 0, errores: [{ fila: 0, mensaje: err instanceof Error ? err.message : "Error desconocido" }] });
    } finally {
      setImportando(false);
    }
  }

  const filtrados = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.numero_documento.includes(search),
  );

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Clientes</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" disabled={exportando} onClick={() => {
            setExportando(true);
            void descargarExcel("/api/exportar/clientes", "clientes.xlsx").finally(() => setExportando(false));
          }}>
            <FileDown className="h-4 w-4" />
            {exportando ? "Exportando..." : "Exportar Excel"}
          </Button>
          {!isContador && (
            <>
              <Button variant="secondary" onClick={descargarPlantilla}>
                <Download className="h-4 w-4" />
                Plantilla
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importando}>
                <Upload className="h-4 w-4" />
                {importando ? "Importando..." : "Importar Excel"}
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void handleImportar(e)} />
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Nuevo cliente
              </Button>
            </>
          )}
        </div>
      </div>

      {importResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${importResult.errores.length > 0 && importResult.importados + importResult.actualizados === 0 ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"}`}>
          <p className="font-medium">
            Importación completada: {importResult.importados} creados, {importResult.actualizados} actualizados
            {importResult.errores.length > 0 && `, ${importResult.errores.length} errores`}
          </p>
          {importResult.errores.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {importResult.errores.slice(0, 5).map((e) => (
                <li key={e.fila}>Fila {e.fila}: {e.mensaje}</li>
              ))}
              {importResult.errores.length > 5 && <li>... y {importResult.errores.length - 5} más</li>}
            </ul>
          )}
        </div>
      )}

      {/* Buscador */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por nombre o documento..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabla */}
      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : filtrados.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            {search ? "Sin resultados." : isContador ? "Aún no hay clientes registrados en el sistema." : "Aún no tienes clientes."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Nombre</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Documento</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Correo</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Teléfono</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link
                      to={`/clientes/${c.id}`}
                      className="font-medium text-green-700 hover:underline"
                    >
                      {c.nombre}
                    </Link>
                    <p className="text-xs text-gray-400">{c.tipo_persona}</p>
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {c.tipo_documento} {c.numero_documento}
                  </td>
                  <td className="px-6 py-3 text-gray-600">{c.correo ?? "—"}</td>
                  <td className="px-6 py-3 text-gray-600">{c.telefono ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modal nuevo cliente */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo cliente"
        className="max-w-2xl"
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de persona</Label>
              <select
                value={form.tipo_persona}
                onChange={(e) => set("tipo_persona", e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {TIPOS_PERSONA.map((t) => (
                  <option key={t} value={t}>{t === "natural" ? "Natural" : "Jurídica"}</option>
                ))}
              </select>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="num_doc">Número de documento</Label>
              <Input
                id="num_doc"
                required
                value={form.numero_documento}
                onChange={(e) => set("numero_documento", e.target.value)}
              />
            </div>
            {form.tipo_documento === "NIT" && (
              <div className="space-y-1.5">
                <Label htmlFor="dv">Dígito de verificación</Label>
                <Input
                  id="dv"
                  maxLength={1}
                  value={form.digito_verificacion}
                  onChange={(e) => set("digito_verificacion", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nombre_c">
              {form.tipo_persona === "natural" ? "Nombre completo" : "Razón social"}
            </Label>
            <Input
              id="nombre_c"
              required
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="correo_c">Correo</Label>
              <Input
                id="correo_c"
                type="email"
                value={form.correo}
                onChange={(e) => set("correo", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel_c">Teléfono</Label>
              <Input
                id="tel_c"
                value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dir_c">Dirección</Label>
            <Input
              id="dir_c"
              value={form.direccion}
              onChange={(e) => set("direccion", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mun_c">Municipio</Label>
              <Input
                id="mun_c"
                value={form.municipio}
                onChange={(e) => set("municipio", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep_c">Departamento</Label>
              <Input
                id="dep_c"
                value={form.departamento}
                onChange={(e) => set("departamento", e.target.value)}
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
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
