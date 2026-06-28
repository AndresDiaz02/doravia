import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Users, TrendingUp, AlertTriangle, MessageSquare, Send,
  PhoneCall, Mail, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MarketingData {
  funnel: {
    total: number; activas: number; onboarding_completo: number;
    con_facturas: number; sin_facturas: number;
  };
  crecimiento: {
    nuevas_esta_semana: number; nuevas_este_mes: number;
    mes_anterior: number; variacion_pct: number | null;
  };
  distribucion_planes: Record<string, number>;
  empresas_para_outreach: {
    id: string; nombre: string; correo: string | null; telefono: string | null;
    dias_sin_login: number | null; riesgo_nivel: string; riesgo_score: number;
    plan_nombre: string; onboarding_completado: boolean;
  }[];
}

interface MsgIA { role: "user" | "assistant"; content: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value} <span className="text-gray-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const PLAN_COLORS = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];

// ── Componente principal ──────────────────────────────────────────────────────

export default function FundadorMarketing() {
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);

  const [mensajes, setMensajes] = useState<MsgIA[]>([
    { role: "assistant", content: "Hola Rose 👋 Soy tu asistente de marketing para Doravia. Puedo ayudarte con estrategias, copy, análisis de clientes, ideas de contenido o lo que necesites. ¿Por dónde empezamos?" },
  ]);
  const [inputIA, setInputIA] = useState("");
  const [enviandoIA, setEnviandoIA] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<MarketingData>("/api/fundador/marketing")
      .then(setData)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensajes]);

  async function handleEnviarIA(e: FormEvent) {
    e.preventDefault();
    const pregunta = inputIA.trim();
    if (!pregunta || enviandoIA) return;

    const nuevos: MsgIA[] = [...mensajes, { role: "user", content: pregunta }];
    setMensajes(nuevos);
    setInputIA("");
    setEnviandoIA(true);

    try {
      const contexto = data
        ? `Datos actuales de Doravia:
- Total empresas: ${data.funnel.total}
- Activas: ${data.funnel.activas}
- Con facturas emitidas: ${data.funnel.con_facturas}
- Nuevas este mes: ${data.crecimiento.nuevas_este_mes}
- Empresas en riesgo de cancelación: ${data.empresas_para_outreach.length}
- Planes: ${JSON.stringify(data.distribucion_planes)}`
        : "";

      const res = await apiFetch<{ respuesta: string }>("/api/fundador/ia", {
        method: "POST",
        body: JSON.stringify({ pregunta, contexto }),
      });
      setMensajes([...nuevos, { role: "assistant", content: res.respuesta }]);
    } catch {
      setMensajes([...nuevos, { role: "assistant", content: "Lo siento, hubo un error al procesar tu pregunta. Intenta de nuevo." }]);
    } finally {
      setEnviandoIA(false);
    }
  }

  if (loading || !data) {
    return <div className="p-8 text-center text-sm text-gray-400">Cargando panel de marketing...</div>;
  }

  const { funnel, crecimiento, distribucion_planes, empresas_para_outreach } = data;
  const totalPlanes = Object.values(distribucion_planes).reduce((s, v) => s + v, 0);

  const variacion = crecimiento.variacion_pct;
  const VariacionIcon = variacion === null ? Minus : variacion > 0 ? ArrowUp : ArrowDown;
  const variacionColor = variacion === null ? "text-gray-400" : variacion > 0 ? "text-emerald-600" : "text-red-600";

  return (
    <div className="p-6 space-y-6">

      {/* ── Top: Funnel + Crecimiento ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Funnel de conversión */}
        <div className="lg:col-span-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Funnel de conversión</h2>
          <Card className="p-5 space-y-4">
            <FunnelBar label="Empresas registradas" value={funnel.total} total={funnel.total} color="bg-blue-400" />
            <FunnelBar label="Activas (plan vigente)" value={funnel.activas} total={funnel.total} color="bg-violet-500" />
            <FunnelBar label="Onboarding completo" value={funnel.onboarding_completo} total={funnel.total} color="bg-emerald-500" />
            <FunnelBar label="Han emitido facturas" value={funnel.con_facturas} total={funnel.total} color="bg-teal-500" />

            <div className="pt-2 border-t border-gray-100 flex gap-4 text-sm">
              <div className="flex-1 bg-red-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-red-600">{funnel.sin_facturas}</p>
                <p className="text-xs text-red-500">Sin facturas aún</p>
              </div>
              <div className="flex-1 bg-amber-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-amber-600">{funnel.total - funnel.onboarding_completo}</p>
                <p className="text-xs text-amber-500">Onboarding pendiente</p>
              </div>
              <div className="flex-1 bg-emerald-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-emerald-600">
                  {funnel.total > 0 ? Math.round((funnel.con_facturas / funnel.total) * 100) : 0}%
                </p>
                <p className="text-xs text-emerald-600">Tasa de activación</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Crecimiento + Distribución planes */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Crecimiento</h2>
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{crecimiento.nuevas_este_mes}</p>
                  <p className="text-xs text-gray-400">Nuevas este mes</p>
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${variacionColor}`}>
                  <VariacionIcon className="h-4 w-4" />
                  {variacion !== null ? `${Math.abs(variacion)}%` : "—"}
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Esta semana: <strong>{crecimiento.nuevas_esta_semana}</strong>
              </div>
              <div className="text-sm text-gray-600">
                Mes anterior: <strong>{crecimiento.mes_anterior}</strong>
              </div>
            </Card>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Distribución de planes</h2>
            <Card className="p-4 space-y-2">
              {Object.entries(distribucion_planes).map(([plan, n], i) => (
                <div key={plan} className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${PLAN_COLORS[i % PLAN_COLORS.length]}`} />
                  <span className="flex-1 text-sm text-gray-700">{plan}</span>
                  <span className="text-sm font-medium text-gray-900">{n}</span>
                  <span className="text-xs text-gray-400">({totalPlanes > 0 ? Math.round((n / totalPlanes) * 100) : 0}%)</span>
                </div>
              ))}
              {Object.keys(distribucion_planes).length === 0 && (
                <p className="text-sm text-gray-400">Sin datos</p>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* ── Bottom: Outreach + IA ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Empresas para contactar */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Empresas para contactar ({empresas_para_outreach.length})
          </h2>
          <Card>
            {empresas_para_outreach.length > 0 ? (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {empresas_para_outreach.map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5">
                      {e.riesgo_nivel === "alto"
                        ? <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        : <TrendingUp className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{e.nombre}</p>
                      <p className="text-xs text-gray-400">
                        {e.plan_nombre} ·{" "}
                        {e.dias_sin_login !== null ? `sin actividad ${e.dias_sin_login}d` : "sin actividad"}
                        {!e.onboarding_completado && " · onboarding pendiente"}
                      </p>
                      <div className="flex gap-3 mt-1">
                        {e.correo && (
                          <a href={`mailto:${e.correo}`} className="flex items-center gap-1 text-xs text-action hover:underline">
                            <Mail className="h-3 w-3" />{e.correo}
                          </a>
                        )}
                        {e.telefono && (
                          <a href={`tel:${e.telefono}`} className="flex items-center gap-1 text-xs text-action hover:underline">
                            <PhoneCall className="h-3 w-3" />{e.telefono}
                          </a>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${
                      e.riesgo_nivel === "alto"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {e.riesgo_score}pts
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center">
                <Users className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">¡Todas las empresas están activas y saludables!</p>
              </div>
            )}
          </Card>
        </div>

        {/* Asistente IA de marketing */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Asistente IA — Marketing Doravia
          </h2>
          <Card className="flex flex-col" style={{ height: "384px" }}>
            {/* Chat */}
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {mensajes.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-slate-800 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {enviandoIA && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-400 animate-pulse">
                    Pensando...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={(e) => void handleEnviarIA(e)} className="border-t border-gray-100 p-3 flex gap-2">
              <Input
                value={inputIA}
                onChange={(e) => setInputIA(e.target.value)}
                placeholder="Ej: Dame 3 ideas de posts para empresas pyme..."
                disabled={enviandoIA}
                className="flex-1"
              />
              <Button type="submit" disabled={enviandoIA || !inputIA.trim()} size="sm">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
