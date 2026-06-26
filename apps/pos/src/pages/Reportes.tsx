import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiFetch, cop } from "../lib/api";

interface ReportePOS {
  total: number;
  cantidad: number;
  fecha: string;
  por_metodo: Record<string, { total: number; cantidad: number }>;
  por_cajero: { id: string; nombre: string; total: number; cantidad: number }[];
  por_hora: { hora: number; total: number }[];
}

const METODO_LABELS: Record<string, string> = {
  efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transf.",
  nequi: "Nequi", daviplata: "Daviplata", mixto: "Mixto",
};

const HOY = new Date().toISOString().slice(0, 10);

export default function Reportes() {
  const [fecha, setFecha] = useState(HOY);
  const [data, setData] = useState<ReportePOS | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<ReportePOS>(`/api/pos/reportes?fecha=${fecha}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [fecha]);

  const horasConVentas = data?.por_hora.filter((h) => h.total > 0) ?? [];
  const horasPico = [...(data?.por_hora ?? [])].sort((a, b) => b.total - a.total).slice(0, 3);

  return (
    <div className="flex h-full flex-col bg-gray-50 overflow-y-auto">
      {/* Selector de fecha */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <p className="font-semibold text-gray-900">Reportes del día</p>
        <input
          type="date"
          value={fecha}
          max={HOY}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      ) : !data || data.cantidad === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
          <p className="text-gray-400 text-sm">Sin ventas para este día</p>
          <p className="text-xs text-gray-300">{fecha}</p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 p-4 text-center">
              <p className="text-xs font-medium text-blue-500">Total ventas</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{cop(data.total)}</p>
            </div>
            <div className="rounded-xl bg-gray-100 p-4 text-center">
              <p className="text-xs font-medium text-gray-500">Transacciones</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{data.cantidad}</p>
            </div>
          </div>

          {horasPico.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">Hora pico: </span>
              {horasPico[0].hora}:00 h — {cop(horasPico[0].total)}
            </div>
          )}

          {/* Gráfica por hora */}
          {horasConVentas.length > 0 && (
            <div className="rounded-xl bg-white border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Ventas por hora</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={data.por_hora.filter((h) => h.hora >= 6 && h.hora <= 22)}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="hora"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={(h: number) => `${h}h`}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [cop(v as number), "Ventas"]}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labelFormatter={(h: any) => `${h as number}:00 h`}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Por método de pago */}
          <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
            <p className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">Por método de pago</p>
            <div className="divide-y divide-gray-50">
              {Object.entries(data.por_metodo)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([metodo, stats]) => {
                  const pct = data.total > 0 ? (stats.total / data.total) * 100 : 0;
                  return (
                    <div key={metodo} className="px-4 py-2.5">
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="font-medium text-gray-800">
                          {METODO_LABELS[metodo] ?? metodo}
                        </span>
                        <span className="text-gray-500">{stats.cantidad} · {cop(stats.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full bg-blue-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Por cajero */}
          {data.por_cajero.length > 0 && (
            <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
              <p className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">Por cajero</p>
              <div className="divide-y divide-gray-50">
                {data.por_cajero
                  .sort((a, b) => b.total - a.total)
                  .map((cajero) => (
                    <div key={cajero.id} className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="font-medium text-gray-800">{cajero.nombre}</span>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{cop(cajero.total)}</p>
                        <p className="text-xs text-gray-400">{cajero.cantidad} ventas</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
