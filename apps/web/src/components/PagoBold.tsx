import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { CreditCard, Building2, Smartphone, Circle } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface BancoPSE {
  financial_institution_code: string;
  financial_institution_name: string;
}

interface IntentResponse {
  reference_id: string;
}

interface PayResponse {
  requires_action?: boolean;
  redirect_url?: string;
  status?: string;
  error?: string;
}

interface PagoBoldProps {
  planSlug: string;
  monto: number;
  descripcion: string;
  onCancelar?: () => void;
}

const METODOS = [
  { id: "CREDIT_CARD",       label: "Tarjeta de crédito / débito", icon: CreditCard },
  { id: "PSE",               label: "PSE — Débito bancario",        icon: Building2  },
  { id: "NEQUI",             label: "Nequi",                        icon: Smartphone },
  { id: "BOTON_BANCOLOMBIA", label: "Botón Bancolombia",            icon: Circle     },
] as const;

type MetodoId = (typeof METODOS)[number]["id"];

const TIPOS_DOC = [
  { value: "CEDULA",          label: "Cédula de ciudadanía" },
  { value: "CEDULA_EXTRANJERIA", label: "Cédula de extranjería" },
  { value: "PASAPORTE",       label: "Pasaporte" },
  { value: "NIT",             label: "NIT" },
];

const CUOTAS_OPCIONES = [1, 3, 6, 12, 24];

function formatearTarjeta(valor: string): string {
  const soloDigitos = valor.replace(/\D/g, "").slice(0, 16);
  return soloDigitos.replace(/(.{4})/g, "$1 ").trim();
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function PagoBold({ planSlug, monto, descripcion, onCancelar }: PagoBoldProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [metodo, setMetodo] = useState<MetodoId>("CREDIT_CARD");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bancosPSE, setBancosPSE] = useState<BancoPSE[]>([]);

  // ── Campos comunes ──────────────────────────────────────────────────────────
  const [nombre, setNombre] = useState(user?.nombre ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [telefono, setTelefono] = useState("");
  const [tipoDoc, setTipoDoc] = useState("CEDULA");
  const [numDoc, setNumDoc] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("Bogotá");

  // ── Campos tarjeta ──────────────────────────────────────────────────────────
  const [numTarjeta, setNumTarjeta] = useState("");
  const [nombreTarjeta, setNombreTarjeta] = useState("");
  const [mesVenc, setMesVenc] = useState("");
  const [anioVenc, setAnioVenc] = useState("");
  const [cvv, setCvv] = useState("");
  const [cuotas, setCuotas] = useState(1);
  const [esDebito, setEsDebito] = useState(false);

  // ── PSE ─────────────────────────────────────────────────────────────────────
  const [bancoPSE, setBancoPSE] = useState("");

  useEffect(() => {
    if (metodo === "PSE" && bancosPSE.length === 0) {
      apiFetch<{ financial_institutions?: BancoPSE[] }>("/api/pagos/bold/bancos-pse")
        .then((data) => setBancosPSE(data.financial_institutions ?? []))
        .catch(() => {});
    }
  }, [metodo, bancosPSE.length]);

  function obtenerFingerprint(): Record<string, unknown> {
    return {
      device_type: window.innerWidth < 768 ? "MOBILE" : "DESKTOP",
      os: navigator.platform,
      browser: navigator.userAgent.slice(0, 150),
      java_enabled: false,
      language: navigator.language,
      color_depth: screen.colorDepth,
      screen_height: screen.height,
      screen_width: screen.width,
      time_zone_offset: new Date().getTimezoneOffset(),
    };
  }

  function construirMetodoPago(): Record<string, unknown> {
    if (metodo === "CREDIT_CARD") {
      const numLimpio = numTarjeta.replace(/\s/g, "");
      return {
        name: esDebito ? "DEBIT_CARD" : "CREDIT_CARD",
        card_number: numLimpio,
        cardholder_name: nombreTarjeta,
        expiration_month: mesVenc.padStart(2, "0"),
        expiration_year: anioVenc.length === 2 ? `20${anioVenc}` : anioVenc,
        installments: esDebito ? 1 : cuotas,
        cvc: cvv,
      };
    }
    if (metodo === "PSE") {
      return { name: "PSE", bank_code: bancoPSE, user_type: "0" };
    }
    if (metodo === "NEQUI") {
      return { name: "NEQUI", phone_number: telefono };
    }
    if (metodo === "BOTON_BANCOLOMBIA") {
      return { name: "BOTON_BANCOLOMBIA" };
    }
    return {};
  }

  function construirPagador() {
    return {
      person_type: "NATURAL_PERSON",
      name: nombre,
      email,
      phone: telefono,
      document_type: tipoDoc,
      document_number: numDoc,
      billing_address: {
        street1: direccion || "Calle 1 # 1-1",
        city: ciudad || "Bogotá",
        zip_code: "110111",
        province: "Cundinamarca",
        country: "CO",
        phone: telefono,
      },
    };
  }

  function validar(): string | null {
    if (!nombre.trim()) return "Ingresa tu nombre completo.";
    if (!email.trim()) return "Ingresa tu correo electrónico.";
    if (!numDoc.trim()) return "Ingresa tu número de documento.";
    if (!telefono.trim()) return "Ingresa tu teléfono.";

    if (metodo === "CREDIT_CARD") {
      const numLimpio = numTarjeta.replace(/\s/g, "");
      if (numLimpio.length < 13) return "Número de tarjeta inválido.";
      if (!nombreTarjeta.trim()) return "Ingresa el nombre del titular.";
      if (!mesVenc || !anioVenc) return "Ingresa la fecha de vencimiento.";
      if (!cvv || cvv.length < 3) return "Ingresa el CVV.";
    }
    if (metodo === "PSE" && !bancoPSE) return "Selecciona tu banco.";

    return null;
  }

  async function pagar() {
    const validacionError = validar();
    if (validacionError) { setError(validacionError); return; }

    setProcesando(true);
    setError(null);

    try {
      // 1. Crear intención de pago
      const intent = await apiFetch<IntentResponse>("/api/pagos/bold/intent", {
        method: "POST",
        body: JSON.stringify({ plan_id: planSlug, monto, descripcion }),
      });

      // 2. Ejecutar pago
      const resultado = await apiFetch<PayResponse>("/api/pagos/bold/pay", {
        method: "POST",
        body: JSON.stringify({
          reference_id: intent.reference_id,
          payment_method: construirMetodoPago(),
          payer: construirPagador(),
          device_fingerprint: obtenerFingerprint(),
        }),
      });

      // 3. Manejar resultado
      if (resultado.requires_action && resultado.redirect_url) {
        // 3DS o redirect (PSE, Nequi, Bancolombia)
        window.location.href = resultado.redirect_url;
        return;
      }

      if (resultado.status === "APPROVED") {
        navigate(`/resultado-pago?ref=${intent.reference_id}&status=approved`);
        return;
      }

      // Estado desconocido o RUNNING
      navigate(`/resultado-pago?ref=${intent.reference_id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Ocurrió un error al procesar el pago. Intenta de nuevo.");
      }
    } finally {
      setProcesando(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Selector de método de pago */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">Método de pago</p>
        <div className="grid grid-cols-2 gap-2">
          {METODOS.map((m) => {
            const Icon = m.icon;
            const seleccionado = metodo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMetodo(m.id); setError(null); }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  seleccionado
                    ? "border-action bg-action/5 text-action"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="text-left leading-tight">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Datos del pagador (comunes) */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Datos del pagador</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre completo</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juan Pérez"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@empresa.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo de documento</label>
            <select
              value={tipoDoc}
              onChange={(e) => setTipoDoc(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30 bg-white"
            >
              {TIPOS_DOC.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Número de documento</label>
            <input
              type="text"
              value={numDoc}
              onChange={(e) => setNumDoc(e.target.value.replace(/\D/g, ""))}
              placeholder="1234567890"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Teléfono</label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="3001234567"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ciudad</label>
            <input
              type="text"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              placeholder="Bogotá"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Dirección</label>
          <input
            type="text"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Calle 123 # 45-67"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30"
          />
        </div>
      </div>

      {/* Formulario específico por método */}
      {(metodo === "CREDIT_CARD") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Datos de la tarjeta</p>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={esDebito}
                onChange={(e) => { setEsDebito(e.target.checked); setCuotas(1); }}
                className="rounded"
              />
              Es débito
            </label>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Número de tarjeta</label>
            <input
              type="text"
              inputMode="numeric"
              value={numTarjeta}
              onChange={(e) => setNumTarjeta(formatearTarjeta(e.target.value))}
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-action/30"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre en la tarjeta</label>
            <input
              type="text"
              value={nombreTarjeta}
              onChange={(e) => setNombreTarjeta(e.target.value.toUpperCase())}
              placeholder="JUAN PEREZ"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-action/30"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mes (MM)</label>
              <input
                type="text"
                inputMode="numeric"
                value={mesVenc}
                onChange={(e) => setMesVenc(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="12"
                maxLength={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-action/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Año (AA)</label>
              <input
                type="text"
                inputMode="numeric"
                value={anioVenc}
                onChange={(e) => setAnioVenc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="35"
                maxLength={4}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-action/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">CVV</label>
              <input
                type="password"
                inputMode="numeric"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="***"
                maxLength={4}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-action/30"
              />
            </div>
          </div>

          {!esDebito && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cuotas</label>
              <select
                value={cuotas}
                onChange={(e) => setCuotas(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30 bg-white"
              >
                {CUOTAS_OPCIONES.map((c) => (
                  <option key={c} value={c}>{c === 1 ? "1 cuota (sin intereses)" : `${c} cuotas`}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {metodo === "PSE" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Banco PSE</p>
          {bancosPSE.length === 0 ? (
            <p className="text-sm text-gray-400">Cargando bancos...</p>
          ) : (
            <select
              value={bancoPSE}
              onChange={(e) => setBancoPSE(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action/30 bg-white"
            >
              <option value="">Selecciona tu banco</option>
              {bancosPSE.map((b) => (
                <option key={b.financial_institution_code} value={b.financial_institution_code}>
                  {b.financial_institution_name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {(metodo === "NEQUI" || metodo === "BOTON_BANCOLOMBIA") && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
          Serás redirigido a {metodo === "NEQUI" ? "Nequi" : "Bancolombia"} para completar el pago de forma segura.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Botones */}
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => void pagar()}
          disabled={procesando}
          variant="primary"
          className="w-full"
        >
          {procesando ? "Procesando pago..." : `Pagar ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(monto)}`}
        </Button>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={procesando}
            className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-40"
          >
            Cancelar
          </button>
        )}
      </div>

      <p className="text-center text-xs text-gray-400">
        Pago seguro procesado por{" "}
        <a href="https://bold.co" target="_blank" rel="noopener noreferrer" className="text-action hover:underline">Bold</a>
        . No almacenamos datos de tu tarjeta.
      </p>
    </div>
  );
}
