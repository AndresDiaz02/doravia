import { useEffect, useState } from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight, ChevronRight, ChevronDown } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";

type Tipo = "activo" | "pasivo" | "patrimonio" | "ingreso" | "costo" | "gasto";
type Naturaleza = "debito" | "credito";

interface Cuenta {
  id: string;
  tenant_id: string | null;
  codigo: string;
  nombre: string;
  tipo: Tipo;
  naturaleza: Naturaleza;
  nivel: number;
  padre_id: string | null;
  activo: boolean;
}

const TIPO_LABEL: Record<Tipo, string> = {
  activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio",
  ingreso: "Ingreso", costo: "Costo", gasto: "Gasto",
};
const TIPO_COLOR: Record<Tipo, "green" | "blue" | "gray" | "yellow" | "red"> = {
  activo: "green", pasivo: "red", patrimonio: "blue",
  ingreso: "green", costo: "yellow", gasto: "gray",
};

const TIPO_OPTIONS: Tipo[] = ["activo", "pasivo", "patrimonio", "ingreso", "costo", "gasto"];
const NAT_OPTIONS: { val: Naturaleza; label: string }[] = [
  { val: "debito", label: "Débito" },
  { val: "credito", label: "Crédito" },
];

// Niveles de sangría visual
const INDENT = [0, 0, 24, 40, 56];

function nivelNaturaleza(tipo: Tipo): Naturaleza {
  return ["activo", "gasto", "costo"].includes(tipo) ? "debito" : "credito";
}

export default function PlanCuentas() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");

  // Crear
  const [modalCrear, setModalCrear] = useState(false);
  const [nuevaCuenta, setNuevaCuenta] = useState({
    codigo: "", nombre: "", tipo: "activo" as Tipo, naturaleza: "debito" as Naturaleza, nivel: 4, padre_id: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [errCrear, setErrCrear] = useState<string | null>(null);

  // Editar
  const [editando, setEditando] = useState<Cuenta | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [errEditar, setErrEditar] = useState<string | null>(null);

  useEffect(() => { cargar(); }, []);

  function cargar() {
    setLoading(true);
    void apiFetch<Cuenta[]>("/api/contabilidad/plan-cuentas")
      .then(setCuentas)
      .finally(() => setLoading(false));
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  // Construir árbol y filtrar
  const cuentasVisible = busqueda
    ? cuentas.filter(
        (c) =>
          c.codigo.includes(busqueda) ||
          c.nombre.toLowerCase().includes(busqueda.toLowerCase()),
      )
    : (() => {
        // Filtrar colapsados: si un padre está colapsado, ocultar sus hijos
        const hidden = new Set<string>();
        return cuentas.filter((c) => {
          if (c.padre_id && hidden.has(c.padre_id)) {
            hidden.add(c.id); // propagar a hijos
            return false;
          }
          if (collapsed.has(c.id)) hidden.add(c.id);
          return true;
        });
      })();

  const tieneHijos = (id: string) => cuentas.some((c) => c.padre_id === id);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrCrear(null);
    try {
      const nueva = await apiFetch<Cuenta>("/api/contabilidad/plan-cuentas", {
        method: "POST",
        body: JSON.stringify({
          codigo: nuevaCuenta.codigo,
          nombre: nuevaCuenta.nombre,
          tipo: nuevaCuenta.tipo,
          naturaleza: nuevaCuenta.naturaleza,
          nivel: nuevaCuenta.nivel,
          padre_id: nuevaCuenta.padre_id || null,
        }),
      });
      setCuentas((prev) => [...prev, nueva].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      setModalCrear(false);
      setNuevaCuenta({ codigo: "", nombre: "", tipo: "activo", naturaleza: "debito", nivel: 4, padre_id: "" });
    } catch (err) {
      setErrCrear(err instanceof Error ? err.message : "Error al crear la cuenta.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleToggleActivo(cuenta: Cuenta) {
    try {
      const actualizada = await apiFetch<Cuenta>(`/api/contabilidad/plan-cuentas/${cuenta.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !cuenta.activo }),
      });
      setCuentas((prev) => prev.map((c) => (c.id === actualizada.id ? actualizada : c)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar.");
    }
  }

  async function handleGuardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setErrEditar(null);
    try {
      const actualizada = await apiFetch<Cuenta>(`/api/contabilidad/plan-cuentas/${editando.id}`, {
        method: "PATCH",
        body: JSON.stringify({ nombre: editNombre }),
      });
      setCuentas((prev) => prev.map((c) => (c.id === actualizada.id ? actualizada : c)));
      setEditando(null);
    } catch (err) {
      setErrEditar(err instanceof Error ? err.message : "Error al guardar.");
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Plan de cuentas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cuentas del sistema (PUC) en gris · Cuentas propias en verde
          </p>
        </div>
        <Button onClick={() => { setModalCrear(true); setErrCrear(null); }}>
          <Plus className="h-4 w-4" />
          Nueva cuenta
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Buscar por código o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        {busqueda && (
          <button onClick={() => setBusqueda("")} className="text-xs text-gray-400 hover:text-gray-600">
            Limpiar
          </button>
        )}
      </div>

      <Card>
        {loading ? (
          <CardContent className="py-12 text-center text-sm text-gray-400">Cargando...</CardContent>
        ) : (
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-36">Código</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-28">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-24">Naturaleza</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 w-20">Estado</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cuentasVisible.map((c) => {
                  const esSistema = c.tenant_id === null;
                  const hijos = tieneHijos(c.id);
                  const estaColapsado = collapsed.has(c.id);
                  const indent = INDENT[c.nivel] ?? 64;

                  return (
                    <tr
                      key={c.id}
                      className={`${!c.activo ? "opacity-40" : ""} ${esSistema ? "bg-white" : "bg-green-50/40"} hover:bg-gray-50`}
                    >
                      {/* Código con sangría y toggle colapso */}
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">
                        <div className="flex items-center gap-1" style={{ paddingLeft: `${indent}px` }}>
                          {hijos && !busqueda ? (
                            <button
                              onClick={() => toggleCollapse(c.id)}
                              className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                            >
                              {estaColapsado
                                ? <ChevronRight className="h-3 w-3" />
                                : <ChevronDown className="h-3 w-3" />}
                            </button>
                          ) : (
                            <span className="w-3 flex-shrink-0" />
                          )}
                          <span className={c.nivel <= 2 ? "font-bold text-gray-800" : ""}>{c.codigo}</span>
                        </div>
                      </td>

                      {/* Nombre */}
                      <td className="px-4 py-2">
                        <span className={`${c.nivel <= 2 ? "font-semibold text-gray-800" : "text-gray-700"} ${!esSistema ? "text-green-800" : ""}`}>
                          {c.nombre}
                        </span>
                        {!esSistema && (
                          <span className="ml-2 text-xs text-green-600 font-medium">· propia</span>
                        )}
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-2">
                        {c.nivel <= 2 && (
                          <Badge variant={TIPO_COLOR[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge>
                        )}
                      </td>

                      {/* Naturaleza */}
                      <td className="px-4 py-2 text-xs text-gray-500 capitalize">
                        {c.nivel >= 3 ? c.naturaleza : ""}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-2 text-center">
                        {esSistema ? (
                          <span className="text-xs text-gray-300">sistema</span>
                        ) : (
                          <button
                            onClick={() => void handleToggleActivo(c)}
                            className={`inline-flex items-center gap-1 text-xs font-medium ${c.activo ? "text-green-600" : "text-gray-400"}`}
                            title={c.activo ? "Desactivar cuenta" : "Activar cuenta"}
                          >
                            {c.activo
                              ? <ToggleRight className="h-4 w-4" />
                              : <ToggleLeft className="h-4 w-4" />}
                          </button>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-2 text-right">
                        {!esSistema && (
                          <button
                            onClick={() => { setEditando(c); setEditNombre(c.nombre); setErrEditar(null); }}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {cuentasVisible.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-gray-400">Sin resultados para "{busqueda}".</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Modal crear cuenta */}
      <Dialog open={modalCrear} onClose={() => setModalCrear(false)} title="Nueva cuenta contable">
        <form onSubmit={(e) => void handleCrear(e)} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Código <span className="text-gray-400 text-xs">(solo dígitos)</span></Label>
              <Input
                value={nuevaCuenta.codigo}
                onChange={(e) => setNuevaCuenta((p) => ({ ...p, codigo: e.target.value }))}
                placeholder="ej. 13051501"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nivel</Label>
              <select
                value={nuevaCuenta.nivel}
                onChange={(e) => setNuevaCuenta((p) => ({ ...p, nivel: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value={3}>3 — Cuenta</option>
                <option value={4}>4 — Subcuenta</option>
                <option value={5}>5 — Auxiliar</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nuevaCuenta.nombre}
              onChange={(e) => setNuevaCuenta((p) => ({ ...p, nombre: e.target.value }))}
              placeholder="ej. Cuentas por cobrar empleados"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select
                value={nuevaCuenta.tipo}
                onChange={(e) => {
                  const t = e.target.value as Tipo;
                  setNuevaCuenta((p) => ({ ...p, tipo: t, naturaleza: nivelNaturaleza(t) }));
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {TIPO_OPTIONS.map((t) => (
                  <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Naturaleza</Label>
              <select
                value={nuevaCuenta.naturaleza}
                onChange={(e) => setNuevaCuenta((p) => ({ ...p, naturaleza: e.target.value as Naturaleza }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {NAT_OPTIONS.map((n) => (
                  <option key={n.val} value={n.val}>{n.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cuenta padre <span className="text-gray-400 text-xs">(código, opcional)</span></Label>
            <select
              value={nuevaCuenta.padre_id}
              onChange={(e) => setNuevaCuenta((p) => ({ ...p, padre_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sin padre (raíz)</option>
              {cuentas
                .filter((c) => c.nivel < 5)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.nombre}
                  </option>
                ))}
            </select>
          </div>

          {errCrear && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errCrear}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalCrear(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Crear cuenta"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal editar nombre */}
      <Dialog open={!!editando} onClose={() => setEditando(null)} title="Editar cuenta">
        {editando && (
          <form onSubmit={(e) => void handleGuardarEdicion(e)} className="space-y-4 pt-2">
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Código: <span className="font-mono font-semibold">{editando.codigo}</span></p>
            </div>
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                required
                autoFocus
              />
            </div>
            {errEditar && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errEditar}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
