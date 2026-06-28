import { useState } from "react";
import { CheckCircle2, Building2, FileText, Package, Rocket } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

type Paso = 1 | 2 | 3 | 4;

interface EmpresaForm {
  direccion: string;
  ciudad: string;
  telefono: string;
  correo: string;
}

interface DianForm {
  numero_resolucion: string;
  fecha_resolucion: string;
  prefijo: string;
  consecutivo_desde: string;
  consecutivo_hasta: string;
  fecha_desde: string;
  fecha_hasta: string;
}

interface ProductoForm {
  nombre: string;
  codigo: string;
  tipo: "producto" | "servicio";
  precio_base: string;
  iva_pct: string;
}

const PASOS = [
  { num: 1, label: "Empresa",   icon: Building2 },
  { num: 2, label: "DIAN",      icon: FileText   },
  { num: 3, label: "Producto",  icon: Package    },
  { num: 4, label: "¡Listo!",   icon: Rocket     },
];

export default function Onboarding() {
  const { tenant } = useAuth();

  const [paso, setPaso] = useState<Paso>(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState<EmpresaForm>({ direccion: "", ciudad: "", telefono: "", correo: "" });
  const [dian, setDian] = useState<DianForm>({
    numero_resolucion: "", fecha_resolucion: "", prefijo: "",
    consecutivo_desde: "1", consecutivo_hasta: "1000",
    fecha_desde: "", fecha_hasta: "",
  });
  const [producto, setProducto] = useState<ProductoForm>({ nombre: "", codigo: "", tipo: "producto", precio_base: "", iva_pct: "19" });

  const [dianGuardado, setDianGuardado] = useState(false);
  const [productoGuardado, setProductoGuardado] = useState(false);

  function avanzar() {
    setError(null);
    setPaso((p) => (p < 4 ? (p + 1) as Paso : p));
  }

  async function guardarEmpresa() {
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/api/empresa", {
        method: "PATCH",
        body: JSON.stringify({
          direccion: empresa.direccion || null,
          ciudad: empresa.ciudad || null,
          telefono: empresa.telefono || null,
          correo: empresa.correo || null,
        }),
      });
      avanzar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarDian() {
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/api/resoluciones-dian", {
        method: "POST",
        body: JSON.stringify({
          numero_resolucion: dian.numero_resolucion,
          fecha_resolucion: dian.fecha_resolucion,
          prefijo: dian.prefijo,
          consecutivo_desde: Number(dian.consecutivo_desde),
          consecutivo_hasta: Number(dian.consecutivo_hasta),
          fecha_desde: dian.fecha_desde,
          fecha_hasta: dian.fecha_hasta,
        }),
      });
      setDianGuardado(true);
      avanzar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar la resolución.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarProducto() {
    if (!producto.nombre || !producto.codigo || !producto.precio_base) {
      setError("Nombre, código y precio son requeridos.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await apiFetch("/api/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre: producto.nombre,
          codigo: producto.codigo,
          tipo: producto.tipo,
          precio_base: Number(producto.precio_base),
          iva_pct: Number(producto.iva_pct),
        }),
      });
      setProductoGuardado(true);
      avanzar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el producto.");
    } finally {
      setGuardando(false);
    }
  }

  async function completar() {
    setGuardando(true);
    try {
      await apiFetch("/api/empresa/onboarding", { method: "PATCH" });
      // Reload completo para que AuthProvider re-fetch /me con onboarding_completado=true
      window.location.replace("/dashboard");
    } finally {
      setGuardando(false);
    }
  }

  const progreso = ((paso - 1) / 3) * 100;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Cabecera */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-cold text-white">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold text-gray-900">Doravia</span>
        </div>
        <p className="text-sm text-gray-400">Configuración inicial · Paso {paso} de 4</p>
      </div>

      {/* Tarjeta */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Barra de progreso */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-green-500 transition-all duration-500"
            style={{ width: `${progreso}%` }}
          />
        </div>

        {/* Pasos indicadores */}
        <div className="flex border-b border-gray-100">
          {PASOS.map(({ num, label, icon: Icon }) => (
            <div
              key={num}
              className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors ${
                paso === num
                  ? "text-green-600 border-b-2 border-green-500"
                  : paso > num
                  ? "text-green-400"
                  : "text-gray-300"
              }`}
            >
              {paso > num ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="hidden sm:block">{label}</span>
            </div>
          ))}
        </div>

        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── PASO 1: EMPRESA ── */}
          {paso === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Configura tu empresa</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Estos datos aparecerán en tus facturas electrónicas.
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-500">Empresa</span>
                <span className="font-semibold text-gray-800">{tenant?.nombre}</span>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-500">NIT</span>
                <span className="font-semibold text-gray-800">{tenant?.nit}</span>
              </div>

              <Field label="Dirección física">
                <input
                  className={inputCls}
                  placeholder="Calle 45 # 32-10, Bogotá"
                  value={empresa.direccion}
                  onChange={(e) => setEmpresa((f) => ({ ...f, direccion: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ciudad">
                  <input
                    className={inputCls}
                    placeholder="Bogotá"
                    value={empresa.ciudad}
                    onChange={(e) => setEmpresa((f) => ({ ...f, ciudad: e.target.value }))}
                  />
                </Field>
                <Field label="Teléfono">
                  <input
                    className={inputCls}
                    placeholder="601 234 5678"
                    value={empresa.telefono}
                    onChange={(e) => setEmpresa((f) => ({ ...f, telefono: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Correo de contacto">
                <input
                  className={inputCls}
                  type="email"
                  placeholder="contacto@miempresa.com"
                  value={empresa.correo}
                  onChange={(e) => setEmpresa((f) => ({ ...f, correo: e.target.value }))}
                />
              </Field>

              <div className="flex gap-3 pt-2">
                <button onClick={avanzar} className={btnSecondary}>
                  Completar después
                </button>
                <button onClick={() => void guardarEmpresa()} disabled={guardando} className={btnPrimary}>
                  {guardando ? "Guardando..." : "Guardar y continuar →"}
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 2: DIAN ── */}
          {paso === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Resolución DIAN</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Necesitas una resolución para emitir facturas electrónicas. Si aún no la tienes, puedes configurarla después.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="N° resolución *">
                  <input
                    className={inputCls}
                    placeholder="18764056789456"
                    value={dian.numero_resolucion}
                    onChange={(e) => setDian((f) => ({ ...f, numero_resolucion: e.target.value }))}
                  />
                </Field>
                <Field label="Fecha resolución *">
                  <input
                    className={inputCls}
                    type="date"
                    value={dian.fecha_resolucion}
                    onChange={(e) => setDian((f) => ({ ...f, fecha_resolucion: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Prefijo">
                  <input
                    className={inputCls}
                    placeholder="FE"
                    value={dian.prefijo}
                    onChange={(e) => setDian((f) => ({ ...f, prefijo: e.target.value }))}
                  />
                </Field>
                <Field label="Desde *">
                  <input
                    className={inputCls}
                    type="number"
                    min="1"
                    value={dian.consecutivo_desde}
                    onChange={(e) => setDian((f) => ({ ...f, consecutivo_desde: e.target.value }))}
                  />
                </Field>
                <Field label="Hasta *">
                  <input
                    className={inputCls}
                    type="number"
                    min="1"
                    value={dian.consecutivo_hasta}
                    onChange={(e) => setDian((f) => ({ ...f, consecutivo_hasta: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Vigencia desde *">
                  <input
                    className={inputCls}
                    type="date"
                    value={dian.fecha_desde}
                    onChange={(e) => setDian((f) => ({ ...f, fecha_desde: e.target.value }))}
                  />
                </Field>
                <Field label="Vigencia hasta *">
                  <input
                    className={inputCls}
                    type="date"
                    value={dian.fecha_hasta}
                    onChange={(e) => setDian((f) => ({ ...f, fecha_hasta: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={avanzar} className={btnSecondary}>
                  Configurar después
                </button>
                <button
                  onClick={() => void guardarDian()}
                  disabled={guardando || !dian.numero_resolucion || !dian.fecha_resolucion || !dian.fecha_desde || !dian.fecha_hasta}
                  className={btnPrimary}
                >
                  {guardando ? "Guardando..." : "Guardar y continuar →"}
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 3: PRODUCTO ── */}
          {paso === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Agrega tu primer producto</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Puedes agregar más productos, servicios e importar catálogos desde el módulo de Productos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre *">
                  <input
                    className={inputCls}
                    placeholder="Ej: Camiseta básica"
                    value={producto.nombre}
                    onChange={(e) => setProducto((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </Field>
                <Field label="Código / SKU *">
                  <input
                    className={inputCls}
                    placeholder="CAMP001"
                    value={producto.codigo}
                    onChange={(e) => setProducto((f) => ({ ...f, codigo: e.target.value }))}
                  />
                </Field>
              </div>

              <Field label="Tipo">
                <div className="flex gap-2">
                  {(["producto", "servicio"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProducto((f) => ({ ...f, tipo: t }))}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                        producto.tipo === t
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio base (sin IVA) *">
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    placeholder="50000"
                    value={producto.precio_base}
                    onChange={(e) => setProducto((f) => ({ ...f, precio_base: e.target.value }))}
                  />
                </Field>
                <Field label="IVA">
                  <select
                    className={inputCls}
                    value={producto.iva_pct}
                    onChange={(e) => setProducto((f) => ({ ...f, iva_pct: e.target.value }))}
                  >
                    <option value="19">19% (general)</option>
                    <option value="5">5% (reducido)</option>
                    <option value="0">0% (excluido)</option>
                  </select>
                </Field>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={avanzar} className={btnSecondary}>
                  Agregar después
                </button>
                <button onClick={() => void guardarProducto()} disabled={guardando} className={btnPrimary}>
                  {guardando ? "Guardando..." : "Crear y continuar →"}
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 4: LISTO ── */}
          {paso === 4 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-gray-900">¡Todo listo!</h2>
                <p className="text-sm text-gray-400 mt-2">
                  Tu cuenta está configurada. Empecemos a facturar.
                </p>
              </div>

              <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 text-left">
                <CheckItem label="Empresa registrada" ok />
                <CheckItem label="Datos de contacto" ok={!!(empresa.direccion || empresa.ciudad)} sublabel={empresa.ciudad || "Pendiente"} />
                <CheckItem label="Resolución DIAN" ok={dianGuardado} sublabel={dianGuardado ? "Configurada" : "Pendiente — puedes hacerlo en Configuración"} />
                <CheckItem label="Primer producto" ok={productoGuardado} sublabel={productoGuardado ? producto.nombre : "Pendiente — puedes agregarlo en Productos"} />
              </div>

              <button
                onClick={() => void completar()}
                disabled={guardando}
                className="w-full rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-50 transition-colors"
              >
                {guardando ? "Cargando..." : "Ir al dashboard →"}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Puedes cambiar cualquier dato después en <strong>Configuración</strong>.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function CheckItem({ label, ok, sublabel }: { label: string; ok: boolean; sublabel?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${ok ? "bg-green-50" : "bg-gray-100"}`}>
        <CheckCircle2 className={`h-4 w-4 ${ok ? "text-green-500" : "text-gray-300"}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${ok ? "text-gray-900" : "text-gray-400"}`}>{label}</p>
        {sublabel && <p className="text-xs text-gray-400 truncate">{sublabel}</p>}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent";
const btnPrimary =
  "flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-action-hover disabled:opacity-50 transition-colors";
const btnSecondary =
  "flex-shrink-0 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors";
