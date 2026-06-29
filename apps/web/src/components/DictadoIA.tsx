import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Sparkles, X, AlertCircle, Upload, FileImage, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { Button } from "./ui/button";

export interface CamposFacturaIA {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_porcentaje: 0 | 5 | 19;
  confianza: "alta" | "media" | "baja";
  campos_ambiguos: string[];
}

interface Props {
  onAplicar: (campos: CamposFacturaIA) => void;
  disabled?: boolean;
}

type Estado = "idle" | "escuchando" | "procesando" | "resultado" | "error";
type Tab = "texto" | "imagen";

const CONFIANZA_COLOR: Record<string, string> = {
  alta:  "bg-green-50 border-green-200 text-green-800",
  media: "bg-yellow-50 border-yellow-200 text-yellow-800",
  baja:  "bg-red-50 border-red-200 text-red-800",
};

const CONFIANZA_LABEL: Record<string, string> = {
  alta:  "Confianza alta",
  media: "Confianza media — revisa los campos resaltados",
  baja:  "Confianza baja — verifica todos los campos antes de continuar",
};

const CAMPO_LABEL: Record<string, string> = {
  descripcion:     "Descripción",
  cantidad:        "Cantidad",
  precio_unitario: "Precio unitario",
  iva_porcentaje:  "IVA",
};

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/**
 * Botón + modal que escucha/acepta texto libre o analiza una imagen/PDF
 * y pre-llena los campos de una línea de factura. NUNCA crea la factura
 * directamente — siempre devuelve los campos para que el usuario los revise.
 */
export function DictadoIA({ onAplicar, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("texto");

  // ── Tab texto ──────────────────────────────────────────────────────────────
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");
  const [resultado, setResultado] = useState<CamposFacturaIA | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tab imagen ─────────────────────────────────────────────────────────────
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [estadoImg, setEstadoImg] = useState<"idle" | "procesando" | "resultado" | "error">("idle");
  const [resultadoItems, setResultadoItems] = useState<CamposFacturaIA[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [errorImg, setErrorImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const iniciarMic = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError("Tu navegador no soporta dictado por voz. Escribe el texto manualmente.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SpeechRecognitionAPI();
    rec.lang = "es-CO";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript as string)
        .join(" ");
      setTexto((prev) => (prev ? `${prev} ${transcript}` : transcript).trim());
    };

    rec.onerror = () => { setEstado("idle"); };
    rec.onend   = () => { setEstado("idle"); };

    recognitionRef.current = rec;
    rec.start();
    setEstado("escuchando");

    timeoutRef.current = setTimeout(() => { rec.stop(); }, 10_000);
  }, []);

  const detenerMic = useCallback(() => {
    recognitionRef.current?.stop();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setEstado("idle");
  }, []);

  async function enviarTexto() {
    if (!texto.trim()) return;
    setEstado("procesando");
    setError(null);
    setResultado(null);

    try {
      const res = await apiFetch<CamposFacturaIA>("/api/ia/parsear-descripcion", {
        method: "POST",
        body: JSON.stringify({ texto }),
      });
      setResultado(res);
      setEstado("resultado");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al procesar. Intenta de nuevo.");
      setEstado("error");
    }
  }

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrorImg(`El archivo no debe superar los ${MAX_MB} MB.`);
      return;
    }

    const TIPOS: Record<string, string> = {
      "image/jpeg":    "image/jpeg",
      "image/png":     "image/png",
      "image/webp":    "image/webp",
      "application/pdf": "application/pdf",
    };

    const mediaType = TIPOS[file.type];
    if (!mediaType) {
      setErrorImg("Formato no soportado. Usa JPG, PNG, WEBP o PDF.");
      return;
    }

    setArchivoNombre(file.name);
    setErrorImg(null);
    setEstadoImg("procesando");
    setResultadoItems([]);
    setSeleccionados(new Set());

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const res = await apiFetch<{ items: CamposFacturaIA[]; confianza_global: string }>(
          "/api/ia/analizar-imagen-factura",
          { method: "POST", body: JSON.stringify({ imagen_base64: base64, media_type: mediaType }) },
        );
        setResultadoItems(res.items ?? []);
        setSeleccionados(new Set(res.items.map((_, i) => i)));
        setEstadoImg("resultado");
      } catch (err) {
        setErrorImg(err instanceof ApiError ? err.message : "Error al analizar el archivo.");
        setEstadoImg("error");
      }
    };
    reader.readAsDataURL(file);
    // reset file input so same file can be re-selected
    e.target.value = "";
  }

  function toggleItem(idx: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function aplicarTexto() {
    if (!resultado) return;
    onAplicar(resultado);
    cerrar();
  }

  function aplicarImagenes() {
    resultadoItems.forEach((item, i) => {
      if (seleccionados.has(i)) onAplicar(item);
    });
    cerrar();
  }

  function cerrar() {
    detenerMic();
    setOpen(false);
    setTexto("");
    setEstado("idle");
    setResultado(null);
    setError(null);
    setArchivoNombre(null);
    setEstadoImg("idle");
    setResultadoItems([]);
    setSeleccionados(new Set());
    setErrorImg(null);
  }

  const esCampoAmbiguo = (campo: string) => resultado?.campos_ambiguos?.includes(campo);
  const labelAmbiguo   = (campo: string) => esCampoAmbiguo(campo) ? "ring-2 ring-yellow-300 bg-yellow-50" : "";

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Describir ítem con IA"
      >
        <Sparkles className="h-4 w-4" />
        IA
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" />
                <span className="font-semibold text-gray-900">Asistente IA — Factura</span>
              </div>
              <button onClick={cerrar} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b bg-gray-50">
              <button
                onClick={() => setTab("texto")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === "texto" ? "border-b-2 border-violet-600 text-violet-700 bg-white" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Mic className="inline h-3.5 w-3.5 mr-1.5" />
                Voz / Texto
              </button>
              <button
                onClick={() => setTab("imagen")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === "imagen" ? "border-b-2 border-violet-600 text-violet-700 bg-white" : "text-gray-500 hover:text-gray-700"}`}
              >
                <FileImage className="inline h-3.5 w-3.5 mr-1.5" />
                Imagen / PDF
              </button>
            </div>

            <div className="space-y-4 p-5">

              {/* ── Tab: texto / dictado ─────────────────────────── */}
              {tab === "texto" && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Describe el ítem que quieres facturar
                    </label>
                    <div className="flex gap-2">
                      <textarea
                        rows={3}
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder='Ej: "3 viajes de arena de 5 toneladas a 90 mil el viaje, sin IVA"'
                        className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        disabled={estado === "procesando"}
                      />
                      <button
                        type="button"
                        onClick={estado === "escuchando" ? detenerMic : iniciarMic}
                        disabled={estado === "procesando"}
                        className={`flex h-full items-center justify-center rounded-lg px-3 transition-colors ${
                          estado === "escuchando"
                            ? "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title={estado === "escuchando" ? "Detener dictado" : "Iniciar dictado por voz"}
                      >
                        {estado === "escuchando" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                      </button>
                    </div>
                    {estado === "escuchando" && (
                      <p className="mt-1 text-xs text-red-500 animate-pulse">Escuchando… habla ahora (máx. 10 s)</p>
                    )}
                  </div>

                  {estado === "error" && error && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {estado === "resultado" && resultado && (
                    <div className={`rounded-xl border p-4 space-y-3 ${CONFIANZA_COLOR[resultado.confianza]}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide">
                        {CONFIANZA_LABEL[resultado.confianza]}
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className={`rounded-md bg-white/70 px-3 py-2 ${labelAmbiguo("descripcion")}`}>
                          <span className="text-xs text-gray-500">{CAMPO_LABEL.descripcion}</span>
                          <p className="font-medium text-gray-900">{resultado.descripcion}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className={`rounded-md bg-white/70 px-3 py-2 ${labelAmbiguo("cantidad")}`}>
                            <span className="text-xs text-gray-500">{CAMPO_LABEL.cantidad}</span>
                            <p className="font-medium text-gray-900">{resultado.cantidad}</p>
                          </div>
                          <div className={`rounded-md bg-white/70 px-3 py-2 ${labelAmbiguo("precio_unitario")}`}>
                            <span className="text-xs text-gray-500">{CAMPO_LABEL.precio_unitario}</span>
                            <p className="font-medium text-gray-900">{cop(resultado.precio_unitario)}</p>
                          </div>
                          <div className={`rounded-md bg-white/70 px-3 py-2 ${labelAmbiguo("iva_porcentaje")}`}>
                            <span className="text-xs text-gray-500">{CAMPO_LABEL.iva_porcentaje}</span>
                            <p className="font-medium text-gray-900">{resultado.iva_porcentaje}%</p>
                          </div>
                        </div>
                      </div>
                      {resultado.campos_ambiguos?.length > 0 && (
                        <p className="text-xs">
                          Campos a revisar:{" "}
                          <strong>{resultado.campos_ambiguos.map((c) => CAMPO_LABEL[c] ?? c).join(", ")}</strong>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-1">
                    <Button type="button" variant="secondary" onClick={cerrar}>Cancelar</Button>
                    {estado === "resultado" ? (
                      <Button type="button" onClick={aplicarTexto}>Aplicar al formulario</Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => void enviarTexto()}
                        disabled={!texto.trim() || estado === "procesando" || estado === "escuchando"}
                      >
                        {estado === "procesando" ? (
                          <span className="flex items-center gap-1.5">
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Analizando…
                          </span>
                        ) : (
                          <><Sparkles className="h-4 w-4" />Analizar</>
                        )}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {/* ── Tab: imagen / PDF ────────────────────────────── */}
              {tab === "imagen" && (
                <>
                  {estadoImg === "idle" || estadoImg === "error" ? (
                    <div>
                      <p className="text-sm text-gray-600 mb-3">
                        Sube una foto, imagen o PDF con la lista de productos o el pedido del cliente.
                        La IA extrae los ítems automáticamente.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full rounded-xl border-2 border-dashed border-gray-200 p-6 text-center hover:border-violet-400 hover:bg-violet-50 transition-colors group"
                      >
                        <Upload className="h-8 w-8 text-gray-300 group-hover:text-violet-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-gray-600 group-hover:text-violet-700">
                          Haz clic para seleccionar archivo
                        </p>
                        <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP o PDF — máx. 10 MB</p>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={handleArchivo}
                      />
                      {errorImg && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{errorImg}</span>
                        </div>
                      )}
                    </div>
                  ) : estadoImg === "procesando" ? (
                    <div className="py-8 text-center">
                      <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent mb-3" />
                      <p className="text-sm text-gray-600">Analizando <strong>{archivoNombre}</strong>…</p>
                      <p className="text-xs text-gray-400 mt-1">Esto puede tomar unos segundos</p>
                    </div>
                  ) : (
                    /* Resultado imagen */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700">
                          {resultadoItems.length} ítem{resultadoItems.length !== 1 ? "s" : ""} encontrado{resultadoItems.length !== 1 ? "s" : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => { setEstadoImg("idle"); setArchivoNombre(null); }}
                          className="text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                          Subir otro archivo
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {resultadoItems.map((item, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleItem(i)}
                            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                              seleccionados.has(i)
                                ? "border-violet-400 bg-violet-50"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <CheckCircle2
                                className={`h-4 w-4 mt-0.5 flex-shrink-0 ${seleccionados.has(i) ? "text-violet-600" : "text-gray-200"}`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{item.descripcion}</p>
                                <p className="text-xs text-gray-500">
                                  {item.cantidad} × {cop(item.precio_unitario)} · IVA {item.iva_porcentaje}%
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400">
                        {seleccionados.size} de {resultadoItems.length} seleccionado{seleccionados.size !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}

                  {estadoImg === "resultado" && (
                    <div className="flex justify-end gap-3 pt-1">
                      <Button type="button" variant="secondary" onClick={cerrar}>Cancelar</Button>
                      <Button
                        type="button"
                        onClick={aplicarImagenes}
                        disabled={seleccionados.size === 0}
                      >
                        <Sparkles className="h-4 w-4" />
                        Agregar {seleccionados.size} ítem{seleccionados.size !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  )}

                  {(estadoImg === "idle" || estadoImg === "error") && (
                    <div className="flex justify-end pt-1">
                      <Button type="button" variant="secondary" onClick={cerrar}>Cancelar</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
