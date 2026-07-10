import { useEffect, useRef, useState, type FormEvent } from "react";
import { Upload, X, Download, ToggleLeft, ToggleRight, Lock } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
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
  facturacion_electronica: boolean;
}

export default function ConfiguracionEmpresa() {
  const { plan } = useAuth();
  const tieneAgendaServicios = plan?.features?.agenda_servicios === true;
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [config, setConfig] = useState<EmpresaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [posConfig, setPosConfig] = useState<PosConfig>({});
  const [guardandoPos, setGuardandoPos] = useState(false);
  // Estado de facturación electrónica
  const [guardandoFe, setGuardandoFe] = useState(false);
  const [feError, setFeError] = useState<string | null>(null);
  const [aceptaResponsabilidad, setAceptaResponsabilidad] = useState(false);
  // Plemsi config
  const [plemsiKey, setPlemsiKey] = useState("");
  const [plemsiEmpresaId, setPlemsiEmpresaId] = useState("");
  const [plemsiAmbiente, setPlemsiAmbiente] = useState<"pruebas" | "produccion">("pruebas");
  const [plemsiProveedorAnterior, setPlemsiProveedorAnterior] = useState("");
  const [plemsiKeyConfigurada, setPlemsiKeyConfigurada] = useState(false);
  const [plemsiKeyUltimos4, setPlemsiKeyUltimos4] = useState<string | null>(null);
  const [guardandoPlemsi, setGuardandoPlemsi] = useState(false);
  const [probandoPlemsi, setProbandoPlemsi] = useState(false);
  const [plemsiTestResult, setPlemsiTestResult] = useState<{ ok: boolean; folios_restantes?: number | null; error?: string } | null>(null);

  useEffect(() => {
    void apiFetch<EmpresaConfig>("/api/empresa")
      .then(setConfig)
      .finally(() => setLoading(false));
    void apiFetch<{ pos_config: PosConfig }>("/api/empresa/pos-config-get")
      .then((r) => { setPosConfig(r.pos_config ?? {}); })
      .catch(() => null);
    void apiFetch<{
      empresa_id: string | null;
      ambiente: string;
      habilitado: boolean;
      api_key_configurada: boolean;
      api_key_ultimos_4: string | null;
      proveedor_anterior: string | null;
    }>("/api/empresa/plemsi-config")
      .then((r) => {
        setPlemsiEmpresaId(r.empresa_id ?? "");
        setPlemsiAmbiente((r.ambiente ?? "pruebas") as "pruebas" | "produccion");
        setPlemsiProveedorAnterior(r.proveedor_anterior ?? "");
        setPlemsiKeyConfigurada(r.api_key_configurada);
        setPlemsiKeyUltimos4(r.api_key_ultimos_4);
      })
      .catch(() => null);
  }, []);

  async function handleGuardarPlemsi() {
    if (!plemsiKey.trim() && !plemsiEmpresaId && !plemsiAmbiente && !plemsiProveedorAnterior) return;
    setGuardandoPlemsi(true);
    setPlemsiTestResult(null);
    try {
      const body: Record<string, string> = {
        ambiente: plemsiAmbiente,
      };
      if (plemsiKey.trim()) body.api_key = plemsiKey.trim();
      if (plemsiEmpresaId) body.empresa_id = plemsiEmpresaId;
      if (plemsiProveedorAnterior) body.proveedor_anterior = plemsiProveedorAnterior;
      const r = await apiFetch<{ api_key_ultimos_4: string | null; api_key_configurada: boolean }>("/api/empresa/plemsi", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setPlemsiKeyConfigurada(r.api_key_configurada);
      setPlemsiKeyUltimos4(r.api_key_ultimos_4);
      setPlemsiKey("");
      setPlemsiTestResult({ ok: true });
    } catch (err) {
      setPlemsiTestResult({ ok: false, error: err instanceof ApiError ? err.message : "Error al guardar." });
    } finally {
      setGuardandoPlemsi(false);
    }
  }

  async function handleProbarPlemsi() {
    setProbandoPlemsi(true);
    setPlemsiTestResult(null);
    try {
      const r = await apiFetch<{ ok: boolean; folios_restantes: number | null }>("/api/empresa/plemsi-test", { method: "POST" });
      setPlemsiTestResult(r);
    } catch (err) {
      setPlemsiTestResult({ ok: false, error: err instanceof ApiError ? err.message : "Error de conexión." });
    } finally {
      setProbandoPlemsi(false);
    }
  }

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

  async function toggleFacturacionElectronica(habilitado: boolean) {
    setGuardandoFe(true);
    setFeError(null);
    try {
      await apiFetch("/api/empresa/facturacion-electronica", {
        method: "PATCH",
        body: JSON.stringify({ habilitado, acepta_responsabilidad: !habilitado ? aceptaResponsabilidad : undefined }),
      });
      setConfig((prev) => prev ? { ...prev, facturacion_electronica: habilitado } : prev);
      setAceptaResponsabilidad(false);
    } catch (err) {
      setFeError(err instanceof ApiError ? err.message : "Error al actualizar.");
    } finally {
      setGuardandoFe(false);
    }
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
                requiresPuntoPlus: true,
              },
            ].map(({ key, label, desc, default: def, requiresPuntoPlus }) => {
              const activo = posConfig[key] !== undefined ? posConfig[key]! : def;
              const bloqueado = requiresPuntoPlus && !tieneAgendaServicios;
              return (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      {bloqueado && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <Lock className="h-3 w-3" /> Punto Plus
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={guardandoPos}
                    onClick={() => bloqueado ? setShowUpgradeModal(true) : void togglePosModulo(key, !activo)}
                    className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {bloqueado
                      ? <><ToggleLeft className="h-6 w-6 text-gray-300" /><span className="text-gray-300">Inactivo</span></>
                      : activo
                        ? <><ToggleRight className="h-6 w-6 text-emerald-500" /><span className="text-emerald-600">Activo</span></>
                        : <><ToggleLeft className="h-6 w-6 text-gray-400" /><span className="text-gray-400">Inactivo</span></>
                    }
                  </button>
                </div>
              );
            })}

            {/* Modal upgrade Punto Plus */}
            {showUpgradeModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mx-auto mb-4">
                    <Lock className="h-6 w-6 text-amber-600" />
                  </div>
                  <h3 className="text-center text-lg font-bold text-gray-900 mb-2">Módulo exclusivo de Punto Plus</h3>
                  <p className="text-center text-sm text-gray-500 mb-6">
                    La agenda de citas con profesionales y horarios está disponible únicamente en el plan <strong>Punto Plus</strong>. Contáctanos para actualizar tu plan.
                  </p>
                  <div className="flex flex-col gap-2">
                    <a
                      href="https://wa.me/573125587055?text=Hola%2C%20quiero%20actualizar%20mi%20plan%20a%20Punto%20Plus%20para%20usar%20la%20agenda%20de%20citas"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                    >
                      Contactar a ventas por WhatsApp
                    </a>
                    <button
                      onClick={() => setShowUpgradeModal(false)}
                      className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Facturación electrónica ── */}
        <Card>
          <CardHeader>
            <CardTitle>Facturación electrónica</CardTitle>
            <p className="text-sm text-gray-500">
              Configura si esta empresa emite facturas electrónicas válidas ante la DIAN.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">{config.facturacion_electronica ? "🟢" : "⚪"}</span>
              <span className="text-sm font-medium text-gray-900">
                Estado actual:{" "}
                <span className={config.facturacion_electronica ? "text-emerald-600" : "text-gray-400"}>
                  {config.facturacion_electronica ? "Habilitada" : "Deshabilitada"}
                </span>
              </span>
            </div>

            {!config.facturacion_electronica ? (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-600">
                  Al habilitar la facturación electrónica, podrás registrar resoluciones DIAN
                  y emitir facturas válidas ante la DIAN desde Doravia.
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceptaResponsabilidad}
                    onChange={(e) => setAceptaResponsabilidad(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-gray-600">
                    Confirmo que esta empresa emitirá facturas electrónicas desde Doravia
                    y me hago responsable del cumplimiento tributario correspondiente.
                  </span>
                </label>
                <Button
                  type="button"
                  disabled={guardandoFe || !aceptaResponsabilidad}
                  onClick={() => void toggleFacturacionElectronica(true)}
                >
                  {guardandoFe ? "Habilitando..." : "Habilitar facturación electrónica"}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm text-amber-800">
                  <strong>Nota:</strong> Desactivar la facturación electrónica impedirá emitir facturas
                  válidas ante la DIAN. Solo hazlo si esta empresa dejará de facturar electrónicamente.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={guardandoFe}
                  onClick={() => {
                    if (window.confirm("¿Estás seguro de que deseas desactivar la facturación electrónica? Esta acción dejará un registro de auditoría.")) {
                      void toggleFacturacionElectronica(false);
                    }
                  }}
                >
                  {guardandoFe ? "Desactivando..." : "Desactivar (no recomendado)"}
                </Button>
              </div>
            )}

            {feError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{feError}</p>
            )}

            {/* ── Configuración Plemsi ── */}
            <div className="border-t border-gray-200 pt-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Configuración Plemsi (proveedor DIAN)</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  La API Key la genera tu instalador de Doravia después de crear tu empresa en Plemsi.
                  Si no tienes esto, contacta a soporte.
                </p>
              </div>

              {/* Estado actual */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  !plemsiKeyConfigurada
                    ? "bg-gray-100 text-gray-700"
                    : plemsiAmbiente === "produccion"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                }`}>
                  {!plemsiKeyConfigurada ? "No configurada" : plemsiAmbiente === "produccion" ? "En producción" : "En pruebas"}
                </span>
                {plemsiKeyConfigurada && plemsiKeyUltimos4 && (
                  <span className="text-xs text-gray-400">API Key: ••••{plemsiKeyUltimos4}</span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plemsi_empresa_id">Empresa ID Plemsi</Label>
                  <Input
                    id="plemsi_empresa_id"
                    type="text"
                    placeholder="ID de empresa en Plemsi"
                    value={plemsiEmpresaId}
                    onChange={(e) => setPlemsiEmpresaId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plemsi_proveedor_anterior">Proveedor anterior</Label>
                  <select
                    id="plemsi_proveedor_anterior"
                    value={plemsiProveedorAnterior}
                    onChange={(e) => setPlemsiProveedorAnterior(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Ninguno (primera vez)</option>
                    <option value="siigo">Siigo</option>
                    <option value="alegra">Alegra</option>
                    <option value="loggro">Loggro</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              {/* Ambiente */}
              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="plemsi_ambiente"
                      value="pruebas"
                      checked={plemsiAmbiente === "pruebas"}
                      onChange={() => setPlemsiAmbiente("pruebas")}
                      className="h-4 w-4 text-amber-600"
                    />
                    <span className="text-sm text-gray-700">Pruebas (habilitación DIAN)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="plemsi_ambiente"
                      value="produccion"
                      checked={plemsiAmbiente === "produccion"}
                      onChange={() => setPlemsiAmbiente("produccion")}
                      className="h-4 w-4 text-emerald-600"
                    />
                    <span className="text-sm text-gray-700">Producción</span>
                  </label>
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <Label htmlFor="plemsi_api_key">API Key Plemsi</Label>
                <Input
                  id="plemsi_api_key"
                  type="password"
                  placeholder={plemsiKeyConfigurada ? "Deja en blanco para no cambiar la key actual" : "Pega aquí tu API Key de Plemsi"}
                  value={plemsiKey}
                  onChange={(e) => { setPlemsiKey(e.target.value); setPlemsiTestResult(null); }}
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleProbarPlemsi()}
                  disabled={probandoPlemsi || !plemsiKeyConfigurada}
                >
                  {probandoPlemsi ? "Probando..." : "Probar conexión"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleGuardarPlemsi()}
                  disabled={guardandoPlemsi}
                >
                  {guardandoPlemsi ? "Guardando..." : "Guardar configuración Plemsi"}
                </Button>
              </div>

              {plemsiTestResult !== null && (
                <p className={`text-sm rounded-md px-3 py-2 ${plemsiTestResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {plemsiTestResult.ok
                    ? plemsiTestResult.folios_restantes != null
                      ? `Configuración guardada. Conexión exitosa — ${plemsiTestResult.folios_restantes} folios disponibles.`
                      : "Configuración guardada correctamente."
                    : `Error: ${plemsiTestResult.error ?? "No se pudo conectar con Plemsi."}`}
                </p>
              )}
            </div>
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
