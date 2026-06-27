import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Download } from "lucide-react";

interface Cuenta {
  codigo: string;
  nombre: string;
  tipo: string;
  naturaleza: string;
  debitos: number;
  creditos: number;
  saldo_debito: number;
  saldo_credito: number;
}

interface BPResponse {
  desde: string;
  hasta: string;
  cuentas: Cuenta[];
  totales: { debitos: number; creditos: number; saldo_debito: number; saldo_credito: number };
}

const TIPO_LABEL: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  patrimonio: "Patrimonio",
  ingreso: "Ingreso",
  egreso: "Gasto",
};

const cop = (n: number) =>
  n === 0 ? "—" : `$${Math.abs(n).toLocaleString("es-CO", { minimumFractionDigits: 0 })}`;

export default function BalancePrueba() {
  const hoy = new Date().toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 7) + "-01";

  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);
  const [data, setData] = useState<BPResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const res = await apiFetch<BPResponse>(`/api/contabilidad/balance-prueba?desde=${desde}&hasta=${hasta}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void cargar(); }, []);

  // Agrupar por tipo
  const grupos = data
    ? (["activo", "pasivo", "patrimonio", "ingreso", "egreso"] as const).map((tipo) => ({
        tipo,
        cuentas: data.cuentas.filter((c) => c.tipo === tipo),
      })).filter((g) => g.cuentas.length > 0)
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Balance de Prueba</h1>
          <p className="text-sm text-gray-500 mt-0.5">Saldos de movimiento por período — verificación de cuadratura contable</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <button
          onClick={() => void cargar()}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          Generar
        </button>
        {data && (
          <a
            href={`/api/contabilidad/exportar/balance-prueba?desde=${desde}&hasta=${hasta}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Excel
          </a>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400">Generando balance...</p>}

      {data && !loading && (
        <>
          {/* Cuadratura */}
          <div className={`rounded-xl px-5 py-3 flex items-center gap-3 text-sm font-medium ${
            Math.abs(data.totales.debitos - data.totales.creditos) < 0.01
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {Math.abs(data.totales.debitos - data.totales.creditos) < 0.01
              ? "✓ Contabilidad cuadrada — débitos = créditos"
              : `⚠ Descuadre: diferencia de $${Math.abs(data.totales.debitos - data.totales.creditos).toLocaleString("es-CO")}`}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-20">Código</th>
                  <th className="px-4 py-3 text-left">Cuenta</th>
                  <th className="px-4 py-3 text-right">Débitos</th>
                  <th className="px-4 py-3 text-right">Créditos</th>
                  <th className="px-4 py-3 text-right">Saldo Débito</th>
                  <th className="px-4 py-3 text-right">Saldo Crédito</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((grupo) => (
                  <>
                    <tr key={`hdr-${grupo.tipo}`} className="bg-gray-100">
                      <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {TIPO_LABEL[grupo.tipo]}
                      </td>
                    </tr>
                    {grupo.cuentas.map((c) => (
                      <tr key={c.codigo} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.codigo}</td>
                        <td className="px-4 py-2 text-gray-800">{c.nombre}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{cop(c.debitos)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{cop(c.creditos)}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{cop(c.saldo_debito)}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{cop(c.saldo_credito)}</td>
                      </tr>
                    ))}
                    <tr key={`sub-${grupo.tipo}`} className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-gray-600 text-right">
                        Subtotal {TIPO_LABEL[grupo.tipo]}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700">
                        {cop(grupo.cuentas.reduce((s, c) => s + c.debitos, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700">
                        {cop(grupo.cuentas.reduce((s, c) => s + c.creditos, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700">
                        {cop(grupo.cuentas.reduce((s, c) => s + c.saldo_debito, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700">
                        {cop(grupo.cuentas.reduce((s, c) => s + c.saldo_credito, 0))}
                      </td>
                    </tr>
                  </>
                ))}

                {/* Totales */}
                <tr className="border-t-2 border-gray-300 bg-gray-100">
                  <td colSpan={2} className="px-4 py-3 text-sm font-bold text-gray-800">TOTAL</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{cop(data.totales.debitos)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{cop(data.totales.creditos)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{cop(data.totales.saldo_debito)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{cop(data.totales.saldo_credito)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {data.cuentas.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No hay movimientos contables en el período seleccionado.
            </p>
          )}
        </>
      )}
    </div>
  );
}
