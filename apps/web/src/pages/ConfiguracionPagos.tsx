import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Settings, CheckCircle2, AlertCircle } from "lucide-react";

interface ConfigPago {
  configurado: boolean;
  proveedor: string | null;
  habilitado: boolean;
  cred_preview: string | null;
  actualizado_en: string | null;
}

type Proveedor = "bold" | "stub";

export default function ConfiguracionPagos() {
  const [config, setConfig] = useState<ConfigPago | null>(null);
  const [proveedor, setProveedor] = useState<Proveedor>("bold");
  const [boldApiKey, setBoldApiKey] = useState("");
  const [boldSecretKey, setBoldSecretKey] = useState("");
  const [boldEventSecret, setBoldEventSecret] = useState("");
  const [stubToken, setStubToken] = useState("stub-test-token");
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function cargar() {
    try {
      const c = await apiFetch<ConfigPago>("/api/pagos/cotizaciones/configuracion");
      setConfig(c);
      if (c.proveedor) setProveedor(c.proveedor as Proveedor);
    } catch {
      setError("No se pudo cargar la configuración.");
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setExito(null);
    try {
      const credenciales: Record<string, string> =
        proveedor === "bold"
          ? { api_key: boldApiKey, secret_key: boldSecretKey, ...(boldEventSecret ? { event_secret: boldEventSecret } : {}) }
          : { token: stubToken };

      await apiFetch("/api/pagos/cotizaciones/configuracion", {
        method: "PUT",
        body: JSON.stringify({ proveedor, credenciales }),
      });
      setExito("Configuración guardada correctamente.");
      setBoldApiKey(""); setBoldSecretKey(""); setBoldEventSecret("");
      void cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function probarConexion() {
    setProbando(true);
    setError(null);
    setExito(null);
    try {
      const res = await apiFetch<{ ok: boolean; proveedor?: string; error?: string }>(
        "/api/pagos/cotizaciones/configuracion/probar",
        { method: "POST" },
      );
      if (res.ok) setExito(`Conexión con ${res.proveedor} verificada correctamente.`);
      else setError(res.error ?? "Fallo al probar la conexión.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al probar conexión.");
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Configuración de pagos en línea</h1>
          <p className="text-sm text-gray-500">Conecta tu proveedor de pago para aceptar pagos en cotizaciones</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button className="ml-auto underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}
      {exito && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {exito}
        </div>
      )}

      {/* Estado actual */}
      {config && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Estado actual</p>
            {config.configurado ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <Badge variant="green">Configurado</Badge>
                <span>Proveedor: <strong>{config.proveedor}</strong></span>
                {config.cred_preview && <span>Clave: <code className="bg-gray-100 px-1 rounded">{config.cred_preview}</code></span>}
                {config.actualizado_en && <span className="text-gray-400 text-xs">Actualizado el {new Date(config.actualizado_en).toLocaleDateString("es-CO")}</span>}
                <Button variant="secondary" onClick={() => void probarConexion()} disabled={probando}>
                  {probando ? "Verificando…" : "Probar conexión"}
                </Button>
              </div>
            ) : (
              <Badge variant="yellow">Sin configurar</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Formulario */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <h2 className="font-medium text-gray-900">
            {config?.configurado ? "Actualizar credenciales" : "Configurar proveedor de pago"}
          </h2>

          <div>
            <Label>Proveedor</Label>
            <select
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value as Proveedor)}
              className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
            >
              <option value="bold">Bold (Colombia)</option>
              <option value="stub">Stub — solo para pruebas</option>
            </select>
          </div>

          {proveedor === "bold" && (
            <>
              <div>
                <Label htmlFor="boldApiKey">API Key de Bold *</Label>
                <Input
                  id="boldApiKey"
                  type="password"
                  value={boldApiKey}
                  onChange={(e) => setBoldApiKey(e.target.value)}
                  placeholder={config?.configurado ? "(sin cambios — deja vacío)" : "pk_live_..."}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="boldSecretKey">Secret Key de Bold *</Label>
                <Input
                  id="boldSecretKey"
                  type="password"
                  value={boldSecretKey}
                  onChange={(e) => setBoldSecretKey(e.target.value)}
                  placeholder={config?.configurado ? "(sin cambios — deja vacío)" : "sk_live_..."}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="boldEventSecret">Event Secret (webhook) — opcional</Label>
                <Input
                  id="boldEventSecret"
                  type="password"
                  value={boldEventSecret}
                  onChange={(e) => setBoldEventSecret(e.target.value)}
                  placeholder="ws_..."
                  autoComplete="off"
                />
                <p className="text-xs text-gray-400 mt-1">
                  URL de webhook para configurar en el panel de Bold:
                  <br />
                  <code className="bg-gray-100 px-1 rounded text-gray-600">{window.location.origin}/api/pagos/cotizaciones/bold/webhook</code>
                </p>
              </div>
            </>
          )}

          {proveedor === "stub" && (
            <div>
              <Label htmlFor="stubToken">Token de prueba</Label>
              <Input
                id="stubToken"
                value={stubToken}
                onChange={(e) => setStubToken(e.target.value)}
                placeholder="stub-test-token"
              />
              <p className="text-xs text-gray-400 mt-1">
                El proveedor stub no hace llamadas reales. Úsalo solo en entornos de desarrollo.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => void guardar()}
              disabled={guardando || (proveedor === "bold" && !config?.configurado && (!boldApiKey || !boldSecretKey))}
            >
              {guardando ? "Guardando…" : "Guardar configuración"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
        <strong>Importante:</strong> Las credenciales se almacenan cifradas con AES-256 en la base de datos.
        Doravia nunca ve ni maneja el dinero de tus clientes — el pago va directamente entre tu cliente y tu cuenta en {proveedor === "bold" ? "Bold" : "el proveedor"}.
      </div>
    </div>
  );
}
