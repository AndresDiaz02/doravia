import { useEffect, useState, type FormEvent } from "react";
import { UserPlus, AlertCircle } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  role: string;
  activo: boolean;
  created_at: string;
}

const ROLES = ["admin", "contador", "vendedor", "operario"] as const;
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  contador: "Contador",
  vendedor: "Vendedor",
  operario: "Operario",
};

export function Usuarios() {
  const { user, plan } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", nombre: "", password: "", role: "operario" });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    void apiFetch<Usuario[]>("/api/usuarios")
      .then(setUsuarios)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const nuevo = await apiFetch<Usuario>("/api/usuarios", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setUsuarios((prev) => [...prev, nuevo]);
      setOpen(false);
      setForm({ email: "", nombre: "", password: "", role: "operario" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(u: Usuario) {
    if (u.id === user?.id) return;
    const actualizado = await apiFetch<Usuario>(`/api/usuarios/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ activo: !u.activo }),
    });
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? actualizado : x)));
  }

  const activos = usuarios.filter((u) => u.activo).length;
  const maxUsuarios = plan?.max_usuarios;

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Usuarios</h1>
          {maxUsuarios && (
            <p className="text-sm text-gray-500">
              {activos} de {maxUsuarios} usuarios activos
            </p>
          )}
        </div>
        <Button
          onClick={() => { setError(null); setOpen(true); }}
          disabled={maxUsuarios !== null && activos >= (maxUsuarios ?? 0)}
        >
          <UserPlus className="h-4 w-4" />
          Invitar usuario
        </Button>
      </div>

      {maxUsuarios != null && activos >= maxUsuarios && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-800">
            Tu plan ({plan?.nombre}) permite hasta <strong>{maxUsuarios}</strong> usuario(s) activo(s).
            Desactiva uno existente o actualiza tu plan para agregar más.
          </p>
        </div>
      )}

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Nombre</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Correo</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Rol</th>
                <th className="px-6 py-3 text-center font-medium text-gray-500">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map((u) => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? "opacity-50" : ""}`}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">
                      {u.nombre}
                      {u.id === user?.id && (
                        <span className="ml-2 text-xs text-gray-400">(tú)</span>
                      )}
                    </p>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{u.email}</td>
                  <td className="px-6 py-3">
                    <Badge variant={u.role === "admin" ? "green" : "gray"}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <Badge variant={u.activo ? "green" : "gray"}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {u.id !== user?.id && (
                      <button
                        onClick={() => void toggleActivo(u)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="Invitar usuario">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nom_u">Nombre</Label>
            <Input
              id="nom_u"
              required
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email_u">Correo electrónico</Label>
            <Input
              id="email_u"
              type="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pass_u">Contraseña temporal</Label>
            <Input
              id="pass_u"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
            <p className="text-xs text-gray-400">Mínimo 8 caracteres</p>
          </div>

          <div className="space-y-1.5">
            <Label>Rol</Label>
            <select
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creando..." : "Crear usuario"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
