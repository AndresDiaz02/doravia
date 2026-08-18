import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ReceiptText, TrendingUp, WalletCards } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<ReportePOS>(`/api/pos/reportes?fecha=${fecha}`)
      .then(setData)
      .catch(() => setError("No pudimos cargar los reportes. Intenta nuevamente."))
      .finally(() => setLoading(false));
  }, [fecha, retry]);

  const horasConVentas = data?.por_hora.filter((h) => h.total > 0) ?? [];
  const horasPico = [...(data?.por_hora ?? [])].sort((a, b) => b.total - a.total).slice(0, 3);
  const ticketPromedio = data && data.cantidad > 0 ? data.total / data.cantidad : 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-br from-slate-50 via-violet-50/35 to-slate-100 dark:from-[#080b16] dark:via-[#10132a] dark:to-[#080b16]">
      {/* Selector de fecha */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-[#0b1020]/85">
        <p className="font-semibold text-slate-900 dark:text-white">Reportes del día</p>
        <input
          type="date"
          value={fecha}
          max={HOY}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-violet-950"
        />
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">Cargando...</p>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 text-sm font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-300">Reintentar</button>
          </div>
        </div>
      ) : !data || data.cantidad === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
          <p className="text-sm text-slate-400 dark:text-slate-500">Sin ventas para este día</p>
          <p className="text-xs text-slate-300 dark:text-slate-600">{fecha}</p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-600 to-indigo-600 p-4 text-white shadow-lg shadow-violet-500/20 dark:border-violet-700/40">
              <div className="flex items-center justify-between"><p className="text-xs font-medium text-violet-100">Total vendido</p><TrendingUp className="h-4 w-4 text-violet-200" /></div>
              <p className="mt-2 text-2xl font-bold tracking-tight">{cop(data.total)}</p>
            </div>
            <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
              <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Transacciones</p><ReceiptText className="h-4 w-4 text-violet-500" /></div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{data.cantidad}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-white bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 lg:col-span-1">
              <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Ticket promedio</p><WalletCards className="h-4 w-4 text-emerald-500" /></div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{cop(ticketPromedio)}</p>
            </div>
          </div>

          {horasPico.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/35 dark:text-amber-200">
              <span className="font-semibold">Hora pico: </span>
              {horasPico[0].hora}:00 h — {cop(horasPico[0].total)}
            </div>
          )}

          {/* Gráfica por hora */}
          {horasConVentas.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-100">Ventas por hora</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={data.por_hora.filter((h) => h.hora >= 6 && h.hora <= 22)}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.55} />
                  <XAxis
                    dataKey="hora"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={(h: number) => `${h}h`}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [cop(v as number), "Ventas"]}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labelFormatter={(h: any) => `${h as number}:00 h`}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f8fafc" }}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Por método de pago */}
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p className="px-4 pb-2 pt-4 text-sm font-semibold text-slate-700 dark:text-slate-100">Por método de pago</p>
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {Object.entries(data.por_metodo)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([metodo, stats]) => {
                  const pct = data.total > 0 ? (stats.total / data.total) * 100 : 0;
                  return (
                    <div key={metodo} className="px-4 py-2.5">
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {METODO_LABELS[metodo] ?? metodo}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{stats.cantidad} · {cop(stats.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
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
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
              <p className="px-4 pb-2 pt-4 text-sm font-semibold text-slate-700 dark:text-slate-100">Por cajero</p>
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {data.por_cajero
                  .sort((a, b) => b.total - a.total)
                  .map((cajero) => (
                    <div key={cajero.id} className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{cajero.nombre}</span>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900 dark:text-white">{cop(cajero.total)}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{cajero.cantidad} ventas</p>
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
