import { useEffect, useState, useRef } from "react";
import {
  Plus, Upload, CheckCircle, XCircle, RefreshCw, Lock, ChevronLeft, AlertTriangle,
  Building2, FileText, Sparkles, Trash2, X
} from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { HelpTooltip } from "../components/HelpTooltip";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface CuentaBancaria {
  id: string;
  nombre: string;
  banco: string;
  numero_cuenta: string | null;
  cuenta_contable_id: string | null;
  activa: boolean;
}

interface Conciliacion {
  id: string;
  cuenta_bancaria_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  saldo_inicial_banco: string;
  saldo_final_banco: string;
  estado: "en_proceso" | "cerrada";
  cerrada_at: string | null;
}

interface MovimientoBanco {
  id: string;
  fecha: string;
  descripcion: string;
  monto: string;
  referencia: string | null;
  estado: "pendiente" | "conciliado" | "sin_libro";
  linea_asiento_id: string | null;
}

interface Sugerencia {
  movimiento_banco_id: string;
  linea_asiento_id: string;
  confianza: "fuerte" | "debil";
  motivo: string;
  mov_fecha: string;
  mov_monto: string;
  mov_descripcion: string;
  linea_fecha: string;
  linea_monto: string;
  linea_descripcion: string;
  asiento_numero: string;
}

interface Resumen {
  saldo_banco: number;
  saldo_libros: number;
  diferencia: number;
  diferencia_abs: number;
  cuadrado: boolean;
  banco_sin_libro: { cantidad: number; total: number; detalle: MovimientoBanco[] };
  libro_sin_banco: { cantidad: number; total: number; detalle: unknown[] };
}

// ── Utilidades ────────────────────────────────────────────────────────────────

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function fechaCorta(s: string) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

// ── Componente principal ───────────────────────────────────────────────────────

type Vista = "cuentas" | "conciliaciones" | "detalle";

export default function ConciliacionBancaria() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [vista, setVista] = useState<Vista>("cuentas");
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [cuentaActual, setCuentaActual] = useState<CuentaBancaria | null>(null);
  const [conciliaciones, setConciliaciones] = useState<{ conciliacion: Conciliacion; cuenta: CuentaBancaria }[]>([]);
  const [concActual, setConcActual] = useState<Conciliacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal crear cuenta
  const [modalCuenta, setModalCuenta] = useState(false);
  const [formCuenta, setFormCuenta] = useState({ nombre: "", banco: "", numero_cuenta: "" });
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);

  // Modal crear conciliación
  const [modalConc, setModalConc] = useState(false);
  const [formConc, setFormConc] = useState({ fecha_desde: "", fecha_hasta: "", saldo_inicial_banco: "", saldo_final_banco: "" });
  const [guardandoConc, setGuardandoConc] = useState(false);

  async function cargarCuentas() {
    const data = await apiFetch<CuentaBancaria[]>("/api/conciliacion/cuentas");
    setCuentas(data);
  }

  async function cargarConciliaciones(cuentaId?: string) {
    const qs = cuentaId ? `?cuenta_bancaria_id=${cuentaId}` : "";
    const data = await apiFetch<{ conciliacion: Conciliacion; cuenta: CuentaBancaria }[]>(`/api/conciliacion${qs}`);
    setConciliaciones(data);
  }

  useEffect(() => {
    void cargarCuentas().finally(() => setLoading(false));
  }, []);

  async function handleCrearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setGuardandoCuenta(true);
    setError(null);
    try {
      await apiFetch("/api/conciliacion/cuentas", { method: "POST", body: JSON.stringify(formCuenta) });
      await cargarCuentas();
      setModalCuenta(false);
      setFormCuenta({ nombre: "", banco: "", numero_cuenta: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la cuenta.");
    } finally {
      setGuardandoCuenta(false);
    }
  }

  async function abrirCuenta(cuenta: CuentaBancaria) {
    setCuentaActual(cuenta);
    setLoading(true);
    await cargarConciliaciones(cuenta.id);
    setLoading(false);
    setVista("conciliaciones");
  }

  async function handleCrearConc(e: React.FormEvent) {
    e.preventDefault();
    if (!cuentaActual) return;
    setGuardandoConc(true);
    setError(null);
    try {
      await apiFetch("/api/conciliacion", {
        method: "POST",
        body: JSON.stringify({
          cuenta_bancaria_id: cuentaActual.id,
          fecha_desde: formConc.fecha_desde,
          fecha_hasta: formConc.fecha_hasta,
          saldo_inicial_banco: parseFloat(formConc.saldo_inicial_banco.replace(/[,$]/g, "")),
          saldo_final_banco: parseFloat(formConc.saldo_final_banco.replace(/[,$]/g, "")),
        }),
      });
      await cargarConciliaciones(cuentaActual.id);
      setModalConc(false);
      setFormConc({ fecha_desde: "", fecha_hasta: "", saldo_inicial_banco: "", saldo_final_banco: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la conciliación.");
    } finally {
      setGuardandoConc(false);
    }
  }

  async function abrirConciliacion(conc: Conciliacion, cuenta: CuentaBancaria) {
    setConcActual(conc);
    setCuentaActual(cuenta);
    setVista("detalle");
  }

  // ── Vista: lista de cuentas bancarias ──────────────────────────────────────

  if (vista === "cuentas") {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Conciliación bancaria</h1>
            <HelpTooltip
              text="Conciliar significa comparar los movimientos de tu extracto bancario con los registros de tu contabilidad para verificar que coincidan. Ayuda a detectar comisiones, GMF y cheques pendientes."
              side="right"
            />
          </div>
          {isAdmin && (
            <Button onClick={() => setModalCuenta(true)}>
              <Plus className="w-4 h-4 mr-2" /> Nueva cuenta bancaria
            </Button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : cuentas.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin cuentas bancarias</p>
            <p className="text-sm mt-1">Agrega tu primera cuenta para empezar a conciliar.</p>
            {isAdmin && (
              <Button className="mt-4" onClick={() => setModalCuenta(true)}>
                <Plus className="w-4 h-4 mr-2" /> Agregar cuenta
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cuentas.map((c) => (
              <Card
                key={c.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => abrirCuenta(c)}
              >
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{c.nombre}</p>
                      <p className="text-sm text-gray-500">{c.banco}{c.numero_cuenta ? ` · ${c.numero_cuenta}` : ""}</p>
                    </div>
                    <Badge variant={c.activa ? "default" : "secondary"}>{c.activa ? "Activa" : "Inactiva"}</Badge>
                  </div>
                  <p className="text-xs text-indigo-600 mt-3">Ver conciliaciones →</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modal crear cuenta */}
        {modalCuenta && (
          <Dialog open onOpenChange={setModalCuenta}>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <h2 className="text-lg font-bold mb-4">Nueva cuenta bancaria</h2>
                <form onSubmit={handleCrearCuenta} className="space-y-4">
                  <div>
                    <Label>Nombre de la cuenta *</Label>
                    <Input
                      placeholder="Ej. Bancolombia Ahorros"
                      value={formCuenta.nombre}
                      onChange={(e) => setFormCuenta({ ...formCuenta, nombre: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Banco *</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      value={formCuenta.banco}
                      onChange={(e) => setFormCuenta({ ...formCuenta, banco: e.target.value })}
                      required
                    >
                      <option value="">Selecciona...</option>
                      {["Bancolombia", "Davivienda", "BBVA Colombia", "Banco de Bogotá", "Nequi", "Daviplata", "Banco Popular", "Scotiabank Colpatria", "Otro"].map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Número de cuenta (opcional)</Label>
                    <Input
                      placeholder="Últimos 4 dígitos o número completo"
                      value={formCuenta.numero_cuenta}
                      onChange={(e) => setFormCuenta({ ...formCuenta, numero_cuenta: e.target.value })}
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => { setModalCuenta(false); setError(null); }}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={guardandoCuenta}>
                      {guardandoCuenta ? "Guardando..." : "Crear cuenta"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </Dialog>
        )}
      </div>
    );
  }

  // ── Vista: conciliaciones de una cuenta ────────────────────────────────────

  if (vista === "conciliaciones" && cuentaActual) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setVista("cuentas")}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Cuentas
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">{cuentaActual.nombre}</h1>
          <Badge variant="outline">{cuentaActual.banco}</Badge>
        </div>

        <div className="flex justify-end">
          {isAdmin && (
            <Button onClick={() => { setModalConc(true); setError(null); }}>
              <Plus className="w-4 h-4 mr-2" /> Nueva conciliación
            </Button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : conciliaciones.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Sin conciliaciones para esta cuenta.</p>
            {isAdmin && (
              <Button className="mt-4" onClick={() => setModalConc(true)}>
                <Plus className="w-4 h-4 mr-2" /> Crear primera conciliación
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {conciliaciones.map(({ conciliacion: c, cuenta }) => (
              <Card
                key={c.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => abrirConciliacion(c, cuenta)}
              >
                <CardContent className="pt-4 pb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{fechaCorta(c.fecha_desde)} — {fechaCorta(c.fecha_hasta)}</p>
                    <p className="text-sm text-gray-500">
                      Saldo banco: {cop(Number(c.saldo_final_banco))}
                    </p>
                  </div>
                  <Badge variant={c.estado === "cerrada" ? "secondary" : "default"}>
                    {c.estado === "cerrada" ? "Cerrada" : "En proceso"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modal nueva conciliación */}
        {modalConc && (
          <Dialog open onOpenChange={setModalConc}>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <h2 className="text-lg font-bold mb-4">Nueva conciliación</h2>
                <form onSubmit={handleCrearConc} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Fecha desde *</Label>
                      <Input type="date" value={formConc.fecha_desde} onChange={(e) => setFormConc({ ...formConc, fecha_desde: e.target.value })} required />
                    </div>
                    <div>
                      <Label>Fecha hasta *</Label>
                      <Input type="date" value={formConc.fecha_hasta} onChange={(e) => setFormConc({ ...formConc, fecha_hasta: e.target.value })} required />
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      Saldo inicial según banco *
                      <HelpTooltip text="El saldo que tenías en tu cuenta bancaria al inicio del período del extracto." />
                    </Label>
                    <Input
                      type="number" step="0.01" placeholder="0"
                      value={formConc.saldo_inicial_banco}
                      onChange={(e) => setFormConc({ ...formConc, saldo_inicial_banco: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      Saldo final según banco *
                      <HelpTooltip text="El saldo que muestra tu extracto bancario al final del período." />
                    </Label>
                    <Input
                      type="number" step="0.01" placeholder="0"
                      value={formConc.saldo_final_banco}
                      onChange={(e) => setFormConc({ ...formConc, saldo_final_banco: e.target.value })}
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => { setModalConc(false); setError(null); }}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={guardandoConc}>
                      {guardandoConc ? "Creando..." : "Crear conciliación"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </Dialog>
        )}
      </div>
    );
  }

  // ── Vista: detalle de conciliación ─────────────────────────────────────────

  if (vista === "detalle" && concActual && cuentaActual) {
    return (
      <DetalleConciliacion
        conciliacion={concActual}
        cuenta={cuentaActual}
        isAdmin={isAdmin}
        onVolver={() => {
          setVista("conciliaciones");
          void cargarConciliaciones(cuentaActual.id);
        }}
        onConciliacionActualizada={(updated) => setConcActual(updated)}
      />
    );
  }

  return null;
}

// ── Subcomponente: detalle de conciliación ────────────────────────────────────

function DetalleConciliacion({
  conciliacion: conc,
  cuenta,
  isAdmin,
  onVolver,
  onConciliacionActualizada,
}: {
  conciliacion: Conciliacion;
  cuenta: CuentaBancaria;
  isAdmin: boolean;
  onVolver: () => void;
  onConciliacionActualizada: (c: Conciliacion) => void;
}) {
  const [movimientos, setMovimientos] = useState<MovimientoBanco[]>([]);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSug, setLoadingSug] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Importar extracto
  const fileRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [previewData, setPreviewData] = useState<{ columnas: string[]; mapeo: Record<string, string> } | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [archivoBuffer, setArchivoBuffer] = useState<File | null>(null);
  const [modoMapeo, setModoMapeo] = useState(false);

  // Movimiento manual
  const [modalMovManual, setModalMovManual] = useState(false);
  const [formMov, setFormMov] = useState({ fecha: "", descripcion: "", monto: "", tipo: "ingreso", referencia: "" });
  const [guardandoMov, setGuardandoMov] = useState(false);

  // Cerrar
  const [cerrando, setCerrando] = useState(false);

  const cerrada = conc.estado === "cerrada";

  async function cargar() {
    const [movs, res] = await Promise.all([
      apiFetch<MovimientoBanco[]>(`/api/conciliacion/${conc.id}/movimientos`),
      apiFetch<Resumen>(`/api/conciliacion/${conc.id}/resumen`),
    ]);
    setMovimientos(movs);
    setResumen(res);
  }

  useEffect(() => {
    void cargar().finally(() => setLoading(false));
  }, [conc.id]);

  async function generarSugerencias() {
    setLoadingSug(true);
    setError(null);
    try {
      const data = await apiFetch<Sugerencia[]>(`/api/conciliacion/${conc.id}/sugerencias`);
      setSugerencias(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al generar sugerencias.");
    } finally {
      setLoadingSug(false);
    }
  }

  async function confirmarMatch(sug: Sugerencia) {
    try {
      await apiFetch(`/api/conciliacion/${conc.id}/match`, {
        method: "POST",
        body: JSON.stringify({ movimiento_banco_id: sug.movimiento_banco_id, linea_asiento_id: sug.linea_asiento_id }),
      });
      setSugerencias((prev) => prev.filter((s) => s.movimiento_banco_id !== sug.movimiento_banco_id && s.linea_asiento_id !== sug.linea_asiento_id));
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al confirmar match.");
    }
  }

  async function deshacerMatch(movId: string) {
    try {
      await apiFetch(`/api/conciliacion/${conc.id}/match/${movId}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al deshacer match.");
    }
  }

  async function eliminarMovimiento(movId: string) {
    if (!confirm("¿Eliminar este movimiento del extracto?")) return;
    try {
      await apiFetch(`/api/conciliacion/${conc.id}/movimientos/${movId}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al eliminar movimiento.");
    }
  }

  // ── Importar extracto ──────────────────────────────────────────────────────

  async function handleSeleccionArchivo(file: File) {
    setArchivoBuffer(file);
    setImportando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const data = await apiFetch<{ columnas_detectadas: string[]; mapeo_aplicado?: Record<string, string>; preview?: unknown[] }>(
        `/api/conciliacion/${conc.id}/importar?preview=1`, { method: "POST", body: fd }
      );
      if (data.mapeo_aplicado) {
        // Auto-detectado: mostrar confirmación de mapeo
        setPreviewData({ columnas: data.columnas_detectadas, mapeo: data.mapeo_aplicado as Record<string, string> });
        setMapeo(data.mapeo_aplicado as Record<string, string>);
        setModoMapeo(true);
      } else {
        // No detectado: pedir mapeo manual
        setPreviewData({ columnas: data.columnas_detectadas, mapeo: {} });
        setMapeo({});
        setModoMapeo(true);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const body = err.message;
        // Si trae columnas_detectadas, mostrar mapeo
        setError(body);
      } else {
        setError(err instanceof ApiError ? err.message : "Error al leer el archivo.");
      }
    } finally {
      setImportando(false);
    }
  }

  async function handleImportar() {
    if (!archivoBuffer) return;
    setImportando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivoBuffer);
      // Agregar mapeo como campos del form
      for (const [k, v] of Object.entries(mapeo)) {
        if (v) fd.append(k, v);
      }
      const result = await apiFetch<{ importados: number; errores: unknown[] }>(
        `/api/conciliacion/${conc.id}/importar`, { method: "POST", body: fd }
      );
      setModoMapeo(false);
      setPreviewData(null);
      setArchivoBuffer(null);
      await cargar();
      alert(`Se importaron ${result.importados} movimientos exitosamente.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al importar.");
    } finally {
      setImportando(false);
    }
  }

  // ── Movimiento manual ─────────────────────────────────────────────────────

  async function handleAgregarMovManual(e: React.FormEvent) {
    e.preventDefault();
    setGuardandoMov(true);
    setError(null);
    try {
      const monto = parseFloat(formMov.monto) * (formMov.tipo === "salida" ? -1 : 1);
      await apiFetch(`/api/conciliacion/${conc.id}/movimientos`, {
        method: "POST",
        body: JSON.stringify({ fecha: formMov.fecha, descripcion: formMov.descripcion, monto, referencia: formMov.referencia || undefined }),
      });
      setModalMovManual(false);
      setFormMov({ fecha: "", descripcion: "", monto: "", tipo: "ingreso", referencia: "" });
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al agregar movimiento.");
    } finally {
      setGuardandoMov(false);
    }
  }

  // ── Cerrar conciliación ──────────────────────────────────────────────────

  async function handleCerrar() {
    if (!confirm("¿Cerrar la conciliación? No podrás agregar ni cambiar matches después.")) return;
    setCerrando(true);
    try {
      const updated = await apiFetch<Conciliacion>(`/api/conciliacion/${conc.id}/cerrar`, { method: "PATCH" });
      onConciliacionActualizada(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cerrar.");
    } finally {
      setCerrando(false);
    }
  }

  const pendientes = movimientos.filter((m) => m.estado === "pendiente");
  const conciliados = movimientos.filter((m) => m.estado === "conciliado");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onVolver}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {cuenta.nombre}
          </Button>
          <h1 className="text-xl font-bold text-gray-900">
            Conciliación {fechaCorta(conc.fecha_desde)} — {fechaCorta(conc.fecha_hasta)}
          </h1>
          <Badge variant={cerrada ? "secondary" : "default"}>{cerrada ? "Cerrada" : "En proceso"}</Badge>
        </div>
        {isAdmin && !cerrada && (
          <Button variant="outline" className="text-red-600 border-red-300" onClick={handleCerrar} disabled={cerrando}>
            <Lock className="w-4 h-4 mr-2" /> {cerrando ? "Cerrando..." : "Cerrar conciliación"}
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Panel de resumen */}
      {resumen && (
        <div className={`rounded-xl border-2 p-5 ${resumen.cuadrado ? "border-green-400 bg-green-50" : "border-amber-400 bg-amber-50"}`}>
          <div className="flex items-center gap-2 mb-4">
            {resumen.cuadrado
              ? <CheckCircle className="w-5 h-5 text-green-600" />
              : <AlertTriangle className="w-5 h-5 text-amber-600" />}
            <span className="font-semibold text-gray-800">
              {resumen.cuadrado ? "¡Conciliación cuadrada!" : "Diferencia pendiente"}
            </span>
            <HelpTooltip
              text="Una conciliación está 'cuadrada' cuando el saldo del banco y el saldo de tus libros contables coinciden. Si hay diferencia, busca comisiones bancarias o GMF no registrados, o cheques que aún no se han cobrado."
              side="right"
            />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">Saldo según banco</p>
              <p className="text-xl font-bold text-gray-900">{cop(resumen.saldo_banco)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Saldo según libros</p>
              <p className="text-xl font-bold text-gray-900">{cop(resumen.saldo_libros)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Diferencia</p>
              <p className={`text-xl font-bold ${Math.abs(resumen.diferencia) < 0.01 ? "text-green-600" : "text-amber-700"}`}>
                {cop(resumen.diferencia)}
              </p>
            </div>
          </div>
          {!resumen.cuadrado && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3 border">
                <p className="font-medium text-gray-700 mb-1">
                  Banco sin registro en libros ({resumen.banco_sin_libro.cantidad})
                  <HelpTooltip text="Movimientos en tu extracto que aún no tienen asiento contable. Típicamente: comisiones del banco, GMF (4×1000), cargos automáticos." side="right" />
                </p>
                <p className="font-bold">{cop(resumen.banco_sin_libro.total)}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <p className="font-medium text-gray-700 mb-1">
                  Libros sin reflejo en banco ({resumen.libro_sin_banco.cantidad})
                  <HelpTooltip text="Asientos contables de la cuenta bancaria que aún no aparecen en el extracto. Típicamente: cheques en tránsito, depósitos no acreditados aún." side="right" />
                </p>
                <p className="font-bold">{cop(Math.abs(resumen.libro_sin_banco.total))}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Acciones de importación */}
      {isAdmin && !cerrada && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importando}
          >
            <Upload className="w-4 h-4 mr-2" />
            {importando ? "Leyendo archivo..." : "Importar extracto (CSV/Excel)"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSeleccionArchivo(f); e.target.value = ""; }}
          />
          <Button variant="outline" onClick={() => setModalMovManual(true)}>
            <Plus className="w-4 h-4 mr-2" /> Agregar movimiento manual
          </Button>
          {pendientes.length > 0 && (
            <Button onClick={generarSugerencias} disabled={loadingSug}>
              <Sparkles className="w-4 h-4 mr-2" />
              {loadingSug ? "Analizando..." : `Sugerencias de match (${pendientes.length} pendientes)`}
            </Button>
          )}
        </div>
      )}

      {/* Modal mapeo de columnas */}
      {modoMapeo && previewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-bold">Mapeo de columnas del extracto</h2>
            <p className="text-sm text-gray-600">
              Indica qué columna del archivo corresponde a cada campo.
              Columnas detectadas: <span className="font-mono text-xs">{previewData.columnas.join(", ")}</span>
            </p>
            <div className="space-y-3">
              {[
                { key: "col_fecha", label: "Fecha *" },
                { key: "col_descripcion", label: "Descripción *" },
                { key: "col_monto", label: "Monto (columna única +/-)" },
                { key: "col_debito", label: "Débito (salidas)" },
                { key: "col_credito", label: "Crédito (entradas)" },
                { key: "col_referencia", label: "Referencia (opcional)" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <Label className="w-44 text-sm">{label}</Label>
                  <select
                    className="flex-1 border rounded-md px-3 py-1.5 text-sm"
                    value={(mapeo as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setMapeo({ ...mapeo, [key]: e.target.value })}
                  >
                    <option value="">— no usar —</option>
                    {previewData.columnas.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setModoMapeo(false); setPreviewData(null); setArchivoBuffer(null); setError(null); }}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleImportar} disabled={importando || !mapeo.col_fecha || !mapeo.col_descripcion || (!mapeo.col_monto && !mapeo.col_debito && !mapeo.col_credito)}>
                {importando ? "Importando..." : "Importar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sugerencias de match */}
      {sugerencias.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Sugerencias de match
              <span className="text-sm font-normal text-gray-500">— confirma cada pareja para conciliar</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sugerencias.map((sug, i) => (
              <div
                key={i}
                className={`rounded-lg border p-4 ${sug.confianza === "fuerte" ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={sug.confianza === "fuerte" ? "default" : "secondary"} className="text-xs">
                        {sug.confianza === "fuerte" ? "Match fuerte" : "Match débil"}
                      </Badge>
                      <span className="text-xs text-gray-500">{sug.motivo}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-white rounded p-2 border">
                        <p className="text-xs text-gray-500 mb-1">Extracto banco</p>
                        <p className="font-medium">{fechaCorta(sug.mov_fecha)} · {cop(Math.abs(Number(sug.mov_monto)))}</p>
                        <p className="text-xs text-gray-600 truncate">{sug.mov_descripcion}</p>
                      </div>
                      <div className="bg-white rounded p-2 border">
                        <p className="text-xs text-gray-500 mb-1">Libro contable</p>
                        <p className="font-medium">{fechaCorta(sug.linea_fecha)} · {sug.asiento_numero}</p>
                        <p className="text-xs text-gray-600 truncate">{sug.linea_descripcion}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={() => confirmarMatch(sug)}>
                      <CheckCircle className="w-4 h-4 mr-1" /> Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSugerencias((p) => p.filter((_, j) => j !== i))}>
                      <X className="w-4 h-4 mr-1" /> Ignorar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabla de movimientos */}
      {loading ? (
        <p className="text-gray-500">Cargando movimientos...</p>
      ) : movimientos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Sin movimientos. Importa un extracto bancario para empezar.</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              Movimientos del extracto
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({conciliados.length} conciliados · {pendientes.length} pendientes)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600">Fecha</th>
                    <th className="text-left px-4 py-3 text-gray-600">Descripción</th>
                    <th className="text-right px-4 py-3 text-gray-600">Monto</th>
                    <th className="text-center px-4 py-3 text-gray-600">Estado</th>
                    {isAdmin && !cerrada && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movimientos.map((m) => (
                    <tr key={m.id} className={m.estado === "conciliado" ? "bg-green-50/50" : ""}>
                      <td className="px-4 py-3 text-gray-600">{fechaCorta(m.fecha)}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="block truncate">{m.descripcion}</span>
                        {m.referencia && <span className="text-xs text-gray-400">{m.referencia}</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${Number(m.monto) < 0 ? "text-red-600" : "text-green-700"}`}>
                        {Number(m.monto) < 0 ? "-" : "+"}{cop(Math.abs(Number(m.monto)))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.estado === "conciliado"
                          ? <CheckCircle className="w-4 h-4 text-green-500 inline" />
                          : <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Pendiente</span>}
                      </td>
                      {isAdmin && !cerrada && (
                        <td className="px-4 py-3 text-right">
                          {m.estado === "conciliado" ? (
                            <button
                              onClick={() => deshacerMatch(m.id)}
                              className="text-xs text-gray-400 hover:text-amber-600"
                              title="Deshacer match"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => eliminarMovimiento(m.id)}
                              className="text-xs text-gray-400 hover:text-red-600"
                              title="Eliminar movimiento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal movimiento manual */}
      {modalMovManual && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Agregar movimiento manual</h2>
            <form onSubmit={handleAgregarMovManual} className="space-y-4">
              <div>
                <Label>Fecha *</Label>
                <Input type="date" value={formMov.fecha} onChange={(e) => setFormMov({ ...formMov, fecha: e.target.value })} required />
              </div>
              <div>
                <Label>Descripción *</Label>
                <Input placeholder="Ej. Comisión bancaria, GMF..." value={formMov.descripcion} onChange={(e) => setFormMov({ ...formMov, descripcion: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1">
                    Tipo
                    <HelpTooltip text="Ingreso = entra plata al banco (ej. consignación). Salida = sale plata (ej. comisión, GMF)." />
                  </Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={formMov.tipo} onChange={(e) => setFormMov({ ...formMov, tipo: e.target.value })}>
                    <option value="ingreso">Ingreso (+ al banco)</option>
                    <option value="salida">Salida (- del banco)</option>
                  </select>
                </div>
                <div>
                  <Label>Monto *</Label>
                  <Input type="number" step="0.01" min="0.01" placeholder="0" value={formMov.monto} onChange={(e) => setFormMov({ ...formMov, monto: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>Referencia (opcional)</Label>
                <Input placeholder="No. cheque, REF..." value={formMov.referencia} onChange={(e) => setFormMov({ ...formMov, referencia: e.target.value })} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setModalMovManual(false); setError(null); }}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={guardandoMov}>
                  {guardandoMov ? "Guardando..." : "Agregar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
