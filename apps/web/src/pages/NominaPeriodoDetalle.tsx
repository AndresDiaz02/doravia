import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calculator, CheckCircle2, Send, Download, AlertTriangle } from "lucide-react";
import { apiFetch, cop, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { HelpTooltip } from "../components/HelpTooltip";
import { NominaBanner } from "../components/NominaBanner";

interface DetalleEmpleado {
  id: string;
  empleado_id: string;
  nombres: string;
  apellidos: string;
  salario_base: string;
  horas_extras_valor: string;
  recargos_valor: string;
  comisiones_valor: string;
  auxilio_transporte: string;
  deducciones_totales: string;
  aportes_parafiscales: string;
  neto_pagar: string;
  documento_electronico_id: string | null;
  estado_dian: "pendiente" | "emitida" | "error" | null;
  cude: string | null;
  error_dian: string | null;
}

interface PeriodoDetalle {
  id: string;
  ano: number;
  mes: number;
  quincena: number | null;
  estado: "borrador" | "calculada" | "aprobada" | "emitida";
  totales_calculados: {
    total_devengado?: number;
    total_deducciones?: number;
    total_aportes_parafiscales?: number;
    total_neto_pagar?: number;
    total_auxilio_transporte?: number;
  } | null;
  asiento_id: string | null;
  modo_nomina?: "pruebas" | "produccion";
  empleados: DetalleEmpleado[];
}

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const ESTADO_BADGE: Record<string, { variant: "gray" | "yellow" | "blue" | "green"; label: string }> = {
  borrador: { variant: "gray", label: "Borrador" },
  calculada: { variant: "yellow", label: "Calculada" },
  aprobada: { variant: "blue", label: "Aprobada" },
  emitida: { variant: "green", label: "Emitida" },
};

const ESTADO_DIAN_BADGE: Record<NonNullable<DetalleEmpleado["estado_dian"]>, { variant: "yellow" | "green" | "red"; label: string }> = {
  pendiente: { variant: "yellow", label: "Pendiente" },
  emitida: { variant: "green", label: "Emitida" },
  error: { variant: "red", label: "Con error" },
};

export default function NominaPeriodoDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState<PeriodoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertencias, setAdvertencias] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const p = await apiFetch<PeriodoDetalle>(`/api/nomina/periodos/${id}`);
      setPeriodo(p);
    } catch {
      setError("No se pudo cargar el período.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function calcular() {
    if (!id) return;
    setProcesando(true);
    setError(null);
    try {
      await apiFetch(`/api/nomina/periodos/${id}/calcular`, { method: "POST", body: JSON.stringify({}) });
      await cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al calcular la nómina.");
    } finally {
      setProcesando(false);
    }
  }

  async function aprobar() {
    if (!id) return;
    setProcesando(true);
    setError(null);
    try {
      await apiFetch(`/api/nomina/periodos/${id}/aprobar`, { method: "POST" });
      await cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al aprobar el período.");
    } finally {
      setProcesando(false);
    }
  }

  async function emitir() {
    if (!id) return;
    if (!confirm("¿Emitir esta nómina? Esto consume documentos de tu pool de nómina y no se puede deshacer.")) return;
    setProcesando(true);
    setError(null);
    setAdvertencias([]);
    try {
      const res = await apiFetch<{ advertencias: string[] }>(`/api/nomina/periodos/${id}/emitir`, { method: "POST" });
      setAdvertencias(res.advertencias ?? []);
      await cargar();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) setError(err.message);
      else setError(err instanceof Error ? err.message : "Error al emitir la nómina.");
    } finally {
      setProcesando(false);
    }
  }

  async function descargarPdf() {
    if (!id) return;
    const token = localStorage.getItem("access_token");
    const resp = await fetch(`/api/nomina/periodos/${id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!resp.ok) { setError("No se pudo generar el PDF."); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nomina_${periodo?.ano}_${periodo?.mes}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="p-8 text-gray-500">Cargando período…</p>;
  if (!periodo) return <p className="p-8 text-gray-500">Período no encontrado.</p>;

  const esAdmin = user?.role === "admin";
  const puedeEmitir = esAdmin && periodo.modo_nomina === "produccion";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <NominaBanner />
      <Link to="/nomina/periodos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver a períodos
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {MESES[periodo.mes]} {periodo.ano}{periodo.quincena ? ` — Quincena ${periodo.quincena}` : ""}
          </h1>
          <Badge variant={ESTADO_BADGE[periodo.estado].variant} className="mt-1">{ESTADO_BADGE[periodo.estado].label}</Badge>
        </div>

        <div className="flex gap-2">
          {(periodo.estado === "borrador" || periodo.estado === "calculada") && (
            <Button onClick={() => void calcular()} disabled={procesando} variant={periodo.estado === "calculada" ? "secondary" : "primary"}>
              <Calculator className="w-4 h-4 mr-1" /> {procesando ? "Calculando…" : periodo.estado === "calculada" ? "Recalcular" : "Calcular"}
            </Button>
          )}
          {periodo.estado === "calculada" && (
            <Button onClick={() => void aprobar()} disabled={procesando}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> {procesando ? "Aprobando…" : "Aprobar"}
            </Button>
          )}
          {periodo.estado === "aprobada" && puedeEmitir && (
            <Button onClick={() => void emitir()} disabled={procesando}>
              <Send className="w-4 h-4 mr-1" /> {procesando ? "Emitiendo…" : "Emitir"}
            </Button>
          )}
          {periodo.estado === "emitida" && (
            <Button variant="secondary" onClick={() => void descargarPdf()}>
              <Download className="w-4 h-4 mr-1" /> Descargar colilla PDF
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {periodo.estado === "aprobada" && !puedeEmitir && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este período está aprobado para revisión. La emisión electrónica permanece deshabilitada mientras Nómina esté en modo de pruebas.
        </div>
      )}

      {advertencias.length > 0 && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Emitida con advertencias:</p>
          <ul className="list-disc list-inside mt-1">
            {advertencias.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {periodo.totales_calculados && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Devengado</p>
            <p className="text-lg font-semibold text-gray-900">{cop(periodo.totales_calculados.total_devengado)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              Deducciones
              <HelpTooltip text="Salud, pensión y retención en la fuente a cargo del empleado." side="top" />
            </p>
            <p className="text-lg font-semibold text-gray-900">{cop(periodo.totales_calculados.total_deducciones)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              Aportes empleador
              <HelpTooltip text="Salud, pensión, ARL, SENA, ICBF y caja de compensación a cargo de la empresa (no se descuentan al empleado)." side="top" />
            </p>
            <p className="text-lg font-semibold text-gray-900">{cop(periodo.totales_calculados.total_aportes_parafiscales)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Neto a pagar</p>
            <p className="text-lg font-semibold text-green-700">{cop(periodo.totales_calculados.total_neto_pagar)}</p>
          </CardContent></Card>
        </div>
      )}

      {periodo.empleados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Aún no se ha calculado este período. Presiona "Calcular" para incluir a todos los empleados activos.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Empleado</th>
                  <th className="px-4 py-3 text-right">Devengado</th>
                  <th className="px-4 py-3 text-right">Deducciones</th>
                  <th className="px-4 py-3 text-right">Neto</th>
                  {periodo.estado === "emitida" && <th className="px-4 py-3">Documento electrónico</th>}
                </tr>
              </thead>
              <tbody>
                {periodo.empleados.map((e) => {
                  const devengado = Number(e.salario_base) + Number(e.horas_extras_valor) + Number(e.recargos_valor) + Number(e.comisiones_valor) + Number(e.auxilio_transporte);
                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{e.nombres} {e.apellidos}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{cop(devengado)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{cop(e.deducciones_totales)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{cop(e.neto_pagar)}</td>
                      {periodo.estado === "emitida" && (
                        <td className="px-4 py-3">
                          {e.estado_dian ? (
                            <div className="space-y-1">
                              <Badge variant={ESTADO_DIAN_BADGE[e.estado_dian].variant}>{ESTADO_DIAN_BADGE[e.estado_dian].label}</Badge>
                              {e.cude && <p className="max-w-48 truncate text-xs text-gray-500" title={e.cude}>CUDE: {e.cude}</p>}
                              {e.error_dian && <p className="max-w-56 text-xs text-red-700" title={e.error_dian}>{e.error_dian}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">Sin respuesta del proveedor</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
