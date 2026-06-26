import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Plus, Warehouse } from "lucide-react";

interface Bodega {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
}

export default function Bodegas() {
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Bodega | null>(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "" });
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      const data = await apiFetch<Bodega[]>("/api/bodegas");
      setBodegas(data);
    } catch {
      setError("No se pudo cargar el listado de bodegas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirCrear() {
    setEditando(null);
    setForm({ nombre: "", descripcion: "" });
    setDialogOpen(true);
  }

  function abrirEditar(b: Bodega) {
    setEditando(b);
    setForm({ nombre: b.nombre, descripcion: b.descripcion ?? "" });
    setDialogOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    try {
      if (editando) {
        await apiFetch(`/api/bodegas/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre: form.nombre, descripcion: form.descripcion || null }),
        });
      } else {
        await apiFetch("/api/bodegas", {
          method: "POST",
          body: JSON.stringify({ nombre: form.nombre, descripcion: form.descripcion || null }),
        });
      }
      setDialogOpen(false);
      cargar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar la bodega.";
      setError(msg);
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(b: Bodega) {
    try {
      await apiFetch(`/api/bodegas/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !b.activo }),
      });
      cargar();
    } catch {
      setError("No se pudo actualizar el estado de la bodega.");
    }
  }

  if (loading) return <p className="p-8 text-gray-500">Cargando bodegas…</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bodegas</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de almacenes y puntos de inventario</p>
        </div>
        <Button onClick={abrirCrear}>
          <Plus className="w-4 h-4 mr-1" /> Nueva bodega
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {bodegas.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <Warehouse className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">Todavía no hay bodegas registradas.</p>
            <Button onClick={abrirCrear}>
              <Plus className="w-4 h-4 mr-1" /> Crear primera bodega
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {bodegas.map((b) => (
            <Card key={b.id} className={b.activo ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{b.nombre}</CardTitle>
                  <Badge variant={b.activo ? "green" : "gray"}>
                    {b.activo ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                {b.descripcion && (
                  <p className="text-sm text-gray-500">{b.descripcion}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => abrirEditar(b)}>
                  Editar
                </Button>
                <Button
                  variant={b.activo ? "ghost" : "secondary"}
                  size="sm"
                  onClick={() => toggleActivo(b)}
                >
                  {b.activo ? "Desactivar" : "Activar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <h2 className="text-lg font-semibold mb-4">
          {editando ? "Editar bodega" : "Nueva bodega"}
        </h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Bodega principal, Punto de venta norte"
            />
          </div>
          <div>
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || !form.nombre.trim()}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
