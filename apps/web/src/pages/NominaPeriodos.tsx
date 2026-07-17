import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Calendar } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { HelpTooltip } from "../components/HelpTooltip";
import { NominaBanner } from "../components/NominaBanner";

interface Periodo {
  id: string;
  ano: number;
  mes: number;
  quincena: number | null;
  estado: "borrador" | "calculada" | "aprobada" | "emitida";
  totales_calculados: { total_neto_pagar?: number } | null;
}

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const ESTADO_BADGE: Record<string, { variant: "gray" | "yellow" | "blue" | "green"; label: string }> = {
  borrador: { variant: "gray", label: "Borrador" },
  calculada: { variant: "yellow", label: "Calculada" },
  aprobada: { variant: "blue", label: "Aprobada" },
  emitida: { variant: "green", label: "Emitida" },
};

export default function NominaPeriodos() {
  const { isContador } = useAuth();
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nominaActiva, setNominaActiva] = useState(true);

  useEffect(() => {
    apiFetch<Periodo[]>("/api/nomina/periodos")
      .then((rows) => { setPeriodos(rows); setNominaActiva(true); })
      .catch((err) => { if (err instanceof ApiError && err.status === 403) setNominaActiva(false); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-8 text-gray-500">Cargando períodos…</p>;

  if (!nominaActiva) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <NominaBanner />
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Calendar className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">Tu empresa no tiene nómina electrónica activa.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <NominaBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="flex items-center gap-1.5 text-2xl font-semibold text-gray-900">
            Períodos de nómina
            <HelpTooltip text="Cada período pasa por 4 estados: Borrador → Calculada → Aprobada → Emitida. Solo se puede emitir si hay documentos suficientes en tu pool de nómina." side="right" />
          </h1>
          <p className="text-sm text-gray-500 mt-1">Ciclos de nómina mensuales o quincenales</p>
        </div>
        {!isContador && (
          <Link to="/nomina/periodos/nuevo">
            <Button><Plus className="w-4 h-4 mr-1" /> Nuevo período</Button>
          </Link>
        )}
      </div>

      {periodos.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <Calendar className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">No hay períodos de nómina todavía.</p>
            {!isContador && (
              <Link to="/nomina/periodos/nuevo">
                <Button><Plus className="w-4 h-4 mr-1" /> Crear período</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Total neto</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/nomina/periodos/${p.id}`} className="font-medium text-gray-900 hover:text-action hover:underline">
                        {MESES[p.mes]} {p.ano}{p.quincena ? ` — Quincena ${p.quincena}` : ""}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ESTADO_BADGE[p.estado].variant}>{ESTADO_BADGE[p.estado].label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {p.totales_calculados?.total_neto_pagar != null ? cop(p.totales_calculados.total_neto_pagar) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
