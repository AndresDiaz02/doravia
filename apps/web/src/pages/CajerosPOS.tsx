import { useEffect, useState } from "react";
import { Eye, EyeOff, Plus, RefreshCw, UserCheck, UserX } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";

interface Cajero {
  id: string;
  nombre: string;
  usuario_pos: string | null;
  activo: boolean;
  created_at: string;
}

export default function CajerosPOS() {
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal nuevo cajero
  const [modalNuevo, setModalNuevo] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", usuario_pos: "", password: "" });
  const [mostrarPassNuevo, setMostrarPassNuevo] = useState(false);
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  // Modal reset contraseña
  const [modalReset, setModalReset] = useState<Cajero | null>(null);
  const [resetPass, setResetPass] = useState({ nueva: "", confirmar: "" });
  const [mostrarPassReset, setMostrarPassReset] = useState(false);
  const [guardandoReset, setGuardandoReset] = useState(false);
  const [errorReset, setErrorReset] = useState<string | null>(null);

  async function cargarCajeros() {
    setCargando(true);
    setError(null);
    try {
      const data = await apiFetch<Cajero[]>("/api/usuarios/cajeros");
      setCajeros(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar cajeros.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargarCajeros(); }, []);

  async function handleCrearCajero() {
    setErrorNuevo(null);
    if (!nuevo.nombre.trim() || !nuevo.usuario_pos.trim()) {
      setErrorNuevo("Nombre y usuario POS son requeridos.");
      return;
    }
    if (nuevo.password.length < 6) {
      setErrorNuevo("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (/\s|@/.test(nuevo.usuario_pos)) {
      setErrorNuevo("El usuario POS no puede contener espacios ni @.");
      return;
    }
    setGuardandoNuevo(true);
    try {
      await apiFetch("/api/usuarios/cajeros", {
        method: "POST",
        body: JSON.stringify({
          nombre: nuevo.nombre.trim(),
          usuario_pos: nuevo.usuario_pos.trim().toLowerCase(),
          password: nuevo.password,
        }),
      });
      setModalNuevo(false);
      setNuevo({ nombre: "", usuario_pos: "", password: "" });
      void cargarCajeros();
    } catch (err) {
      setErrorNuevo(err instanceof ApiError ? err.message : "Error al crear cajero.");
    } finally {
      setGuardandoNuevo(false);
    }
  }

  async function handleResetPassword() {
    if (!modalReset) return;
    setErrorReset(null);
    if (resetPass.nueva.length < 6) {
      setErrorReset("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (resetPass.nueva !== resetPass.confirmar) {
      setErrorReset("Las contraseñas no coinciden.");
      return;
    }
    setGuardandoReset(true);
    try {
      await apiFetch(`/api/usuarios/cajeros/${modalReset.id}/reset-password`, {
        method: "PATCH",
        body: JSON.stringify({ nueva_password: resetPass.nueva }),
      });
      setModalReset(null);
      setResetPass({ nueva: "", confirmar: "" });
    } catch (err) {
      setErrorReset(err instanceof ApiError ? err.message : "Error al restablecer contraseña.");
    } finally {
      setGuardandoReset(false);
    }
  }

  async function toggleActivo(cajero: Cajero) {
    try {
      await apiFetch(`/api/usuarios/cajeros/${cajero.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !cajero.activo }),
      });
      void cargarCajeros();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Error al actualizar cajero.");
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Cajeros POS</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Los cajeros ingresan al POS con su usuario y contraseña, sin necesidad de correo electrónico.
          </p>
        </div>
        <Button onClick={() => { setModalNuevo(true); setErrorNuevo(null); setNuevo({ nombre: "", usuario_pos: "", password: "" }); }}>
          <Plus className="h-4 w-4" />
          Agregar cajero
        </Button>
      </div>

      {/* Aviso informativo */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <strong>Instrucción para cajeros:</strong> El cajero ingresa al POS usando su <em>usuario</em> (sin @)
        y contraseña. No necesita correo electrónico.
      </div>

      {/* Lista de cajeros */}
      {cargando ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">Cargando cajeros...</div>
      ) : error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : cajeros.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-400">
          <p className="text-sm">No hay cajeros registrados.</p>
          <p className="text-xs">Agrega un cajero usando el botón de arriba.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Usuario POS</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Estado</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cajeros.map((cajero) => (
                <tr key={cajero.id} className={`${!cajero.activo ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{cajero.nombre}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-mono text-gray-700 dark:text-gray-300">
                      {cajero.usuario_pos}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    {cajero.activo ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => { setModalReset(cajero); setResetPass({ nueva: "", confirmar: "" }); setErrorReset(null); setMostrarPassReset(false); }}
                        title="Restablecer contraseña"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Restablecer contraseña
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void toggleActivo(cajero)}
                        title={cajero.activo ? "Desactivar" : "Activar"}
                      >
                        {cajero.activo
                          ? <><UserX className="h-3.5 w-3.5" /> Desactivar</>
                          : <><UserCheck className="h-3.5 w-3.5" /> Activar</>
                        }
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Nuevo cajero */}
      <Dialog open={modalNuevo} onClose={() => setModalNuevo(false)} title="Nuevo cajero POS">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            El cajero usará su <strong>usuario</strong> (sin @) y contraseña para ingresar al POS.
            No se requiere correo electrónico.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="nuevo-nombre">Nombre completo</Label>
            <Input
              id="nuevo-nombre"
              placeholder="Ej: María García"
              value={nuevo.nombre}
              onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nuevo-usuario">Usuario POS</Label>
            <Input
              id="nuevo-usuario"
              placeholder="Ej: cajero1 (sin espacios ni @)"
              value={nuevo.usuario_pos}
              onChange={(e) => setNuevo((p) => ({ ...p, usuario_pos: e.target.value.replace(/[\s@]/g, "") }))}
            />
            <p className="text-xs text-gray-400">Sin espacios ni @ — el cajero lo escribirá en el POS.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nuevo-password">Contraseña (mínimo 6 caracteres)</Label>
            <div className="relative">
              <Input
                id="nuevo-password"
                type={mostrarPassNuevo ? "text" : "password"}
                placeholder="Contraseña"
                value={nuevo.password}
                onChange={(e) => setNuevo((p) => ({ ...p, password: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setMostrarPassNuevo((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {mostrarPassNuevo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {errorNuevo && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorNuevo}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setModalNuevo(false)}>Cancelar</Button>
            <Button disabled={guardandoNuevo} onClick={() => void handleCrearCajero()}>
              {guardandoNuevo ? "Creando..." : "Crear cajero"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal: Restablecer contraseña */}
      <Dialog
        open={modalReset !== null}
        onClose={() => setModalReset(null)}
        title={`Restablecer contraseña — ${modalReset?.nombre ?? ""}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Ingresa una nueva contraseña para el cajero <strong>{modalReset?.usuario_pos}</strong>.
            No se requiere la contraseña actual.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="reset-nueva">Nueva contraseña</Label>
            <div className="relative">
              <Input
                id="reset-nueva"
                type={mostrarPassReset ? "text" : "password"}
                placeholder="Nueva contraseña (mínimo 6 caracteres)"
                value={resetPass.nueva}
                onChange={(e) => setResetPass((p) => ({ ...p, nueva: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setMostrarPassReset((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {mostrarPassReset ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reset-confirmar">Confirmar nueva contraseña</Label>
            <Input
              id="reset-confirmar"
              type={mostrarPassReset ? "text" : "password"}
              placeholder="Repite la contraseña"
              value={resetPass.confirmar}
              onChange={(e) => setResetPass((p) => ({ ...p, confirmar: e.target.value }))}
            />
          </div>

          {errorReset && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorReset}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => setModalReset(null)}>Cancelar</Button>
            <Button disabled={guardandoReset} onClick={() => void handleResetPassword()}>
              {guardandoReset ? "Guardando..." : "Restablecer contraseña"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
