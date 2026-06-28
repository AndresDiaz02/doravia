import { useEffect, useRef, useState, type FormEvent } from "react";
import { Upload, X, Download, ToggleLeft, ToggleRight } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

interface PosConfig { cartera_visible?: boolean; citas_visible?: boolean; }

interface EmpresaConfig {
  id: string;
  nombre: string;
  nit: string;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  correo: string | null;
  sitio_web: string | null;
  regimen: string | null;
  representante_legal: string | null;
  actividad_economica: string | null;
  logo_base64: string | null;
  pie_factura: string | null;
}

export default function ConfiguracionEmpresa() {
  const [config, setConfig] = useState<EmpresaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [posConfig, setPosConfig] = useState<PosConfig>({});
  const [guardandoPos, setGuardandoPos] = useState(false);

  useEffect(() => {
    void apiFetch<EmpresaConfig>("/api/empresa")
      .then(setConfig)
      .finally(() => setLoading(false));
    void apiFetch<{ pos_config: PosConfig }>("/api/empresa/pos-config-get")
      .then((r) => setPosConfig(r.pos_config ?? {}))
      .catch(() => null);
  }, []);

  async function togglePosModulo(key: keyof PosConfig, valor: boolean) {
    setGuardandoPos(true);
    try {
      const r = await apiFetch<{ pos_config: PosConfig }>("/api/empresa/pos-config", {
        method: "PATCH",
        body: JSON.stringify({ [key]: valor }),
      });
      setPosConfig(r.pos_config ?? {});
    } finally { setGuardandoPos(false); }
  }

  async function handleGuardar(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setGuardando(true);
    setError(null);
    setOk(false);
    try {
      const actualizado = await apiFetch<EmpresaConfig>("/api/empresa", {
        method: "PATCH",
        body: JSON.stringify({
          nombre: config.nombre,
          direccion: config.direccion,
          ciudad: config.ciudad,
          telefono: config.telefono,
          correo: config.correo,
          sitio_web: config.sitio_web,
          regimen: config.regimen,
          representante_legal: config.representante_legal,
          actividad_economica: config.actividad_economica,
          pie_factura: config.pie_factura,
        }),
      });
      setConfig(actualizado);
      setOk(true);
      setTimeout(() => setOk(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleSubirLogo(file: File) {
    setSubiendoLogo(true);
    setError(null);
    try {
      const token = localStorage.getItem("access_token");
      const fd = new FormData();
      fd.append("logo", file);
      const resp = await fetch("/api/empresa/logo", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const j = await resp.json() as { error: string };
        throw new Error(j.error);
      }
      const { logo_base64 } = await resp.json() as { logo_base64: string };
      setConfig((prev) => prev ? { ...prev, logo_base64 } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir logo.");
    } finally {
      setSubiendoLogo(false);
    }
  }

  async function handleEliminarLogo() {
    await apiFetch("/api/empresa/logo", { method: "DELETE" });
    setConfig((prev) => prev ? { ...prev, logo_base64: null } : prev);
  }

  function campo(
    id: keyof EmpresaConfig,
    label: string,
    placeholder?: string,
    tipo: string = "text",
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type={tipo}
          placeholder={placeholder}
          value={(config?.[id] as string | null) ?? ""}
          onChange={(e) =>
            setConfig((prev) => prev ? { ...prev, [id]: e.target.value || null } : prev)
          }
        />
      </div>
    );
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-gray-400">Cargando...</div>;
  if (!config) return null;

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Configuración de empresa</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Esta información aparece en tus facturas y cotizaciones en PDF.
        </p>
      </div>

      <form onSubmit={(e) => void handleGuardar(e)} className="space-y-6">
        {/* Logo */}
        <Card>
          <CardHeader><CardTitle>Logo de la empresa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {config.logo_base64 ? (
              <div className="flex items-start gap-4">
                <img
                  src={config.logo_base64}
                  alt="Logo empresa"
                  className="h-20 w-auto rounded-md border border-gray-200 object-contain bg-white p-2"
                />
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Logo actual. Se mostrará en el encabezado de tus PDFs.</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={subiendoLogo}>
                      <Upload className="h-4 w-4" />
                      Cambiar logo
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void handleEliminarLogo()}>
                      <X className="h-4 w-4" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-10 cursor-pointer hover:border-green-400 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">Haz clic para subir tu logo</p>
                <p className="text-xs text-gray-400">PNG, JPG o SVG — máx. 2 MB</p>
                {subiendoLogo && <p className="text-xs text-green-600">Subiendo...</p>}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleSubirLogo(f);
                e.target.value = "";
              }}
            />
          </CardContent>
        </Card>

        {/* Datos fiscales */}
        <Card>
          <CardHeader><CardTitle>Datos fiscales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campo("nombre", "Razón social *", "Nombre de la empresa")}
            <div className="space-y-1.5">
              <Label htmlFor="nit">NIT</Label>
              <Input id="nit" value={config.nit} disabled className="bg-gray-50 text-gray-500" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regimen">Régimen tributario</Label>
              <select
                id="regimen"
                value={config.regimen ?? "comun"}
                onChange={(e) => setConfig((prev) => prev ? { ...prev, regimen: e.target.value } : prev)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="comun">Régimen Común (responsable de IVA)</option>
                <option value="simplificado">Régimen Simplificado</option>
                <option value="gran_contribuyente">Gran Contribuyente</option>
              </select>
            </div>
            {campo("representante_legal", "Representante legal", "Nombre completo")}
            {campo("actividad_economica", "Actividad económica (CIIU)", "Ej: 4711")}
          </CardContent>
        </Card>

        {/* Contacto */}
        <Card>
          <CardHeader><CardTitle>Información de contacto</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campo("direccion", "Dirección", "Calle 123 # 45-67")}
            {campo("ciudad", "Ciudad / Municipio", "Bogotá D.C.")}
            {campo("telefono", "Teléfono", "+57 300 123 4567")}
            {campo("correo", "Correo electrónico", "info@miempresa.com", "email")}
            {campo("sitio_web", "Sitio web", "www.miempresa.com")}
          </CardContent>
        </Card>

        {/* Pie de página */}
        <Card>
          <CardHeader><CardTitle>Pie de página en PDFs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="pie_factura">Texto personalizado (opcional)</Label>
              <Input
                id="pie_factura"
                placeholder="Ej: Gracias por su compra · Pagos a: Bancolombia 123-456789-00"
                value={config.pie_factura ?? ""}
                onChange={(e) => setConfig((prev) => prev ? { ...prev, pie_factura: e.target.value || null } : prev)}
              />
              <p className="text-xs text-gray-400">Si lo dejas vacío se muestra "Documento generado electrónicamente por Doravia".</p>
            </div>
          </CardContent>
        </Card>

        {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {ok && <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">Configuración guardada correctamente.</p>}

        {/* ── Módulos POS ── */}
        <Card>
          <CardHeader>
            <CardTitle>Módulos del Punto de Venta (POS)</CardTitle>
            <p className="text-sm text-gray-500">Los módulos desactivados no se muestran en el POS. Los cambios aplican de inmediato al recargar el POS.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                key: "cartera_visible" as keyof PosConfig,
                label: "Cartera",
                desc: "Ventas sin cobro inmediato. El inventario se descuenta pero el pago queda pendiente para cobrar después.",
                default: true,
              },
              {
                key: "citas_visible" as keyof PosConfig,
                label: "Agenda / Citas",
                desc: "Gestión de citas y servicios con hora y profesional asignado (ideal para estéticas, veterinarias, consultorios).",
                default: false,
              },
            ].map(({ key, label, desc, default: def }) => {
              const activo = posConfig[key] !== undefined ? posConfig[key]! : def;
              return (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={guardandoPos}
                    onClick={() => void togglePosModulo(key, !activo)}
                    className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {activo
                      ? <><ToggleRight className="h-6 w-6 text-emerald-500" /><span className="text-emerald-600">Activo</span></>
                      : <><ToggleLeft className="h-6 w-6 text-gray-400" /><span className="text-gray-400">Inactivo</span></>
                    }
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => { window.location.href = "/api/exportar/datos-empresa"; }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar datos (Ley 1581)
          </button>
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
