import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cop } from "../lib/api";

interface VentaTendencia {
  periodo: string;
  total: number;
}

export default function VentasTrendChart({ data }: { data: VentaTendencia[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="periodo"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickFormatter={(value: string) => {
            const [year, month] = value.split("-");
            return `${["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][Number(month)]} ${year?.slice(2)}`;
          }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickFormatter={(value: number) => value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          formatter={(value: number) => [cop(value), "Ventas"]}
          labelFormatter={(label: string) => {
            const [year, month] = label.split("-");
            return `${["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][Number(month)]} ${year}`;
          }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Area type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} fill="url(#gradVentas)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
