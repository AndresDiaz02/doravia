import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface Cuenta { id: string; codigo: string; nombre: string; tipo: string; naturaleza: string }
interface Asiento { id: string; numero: string; fecha: string; descripcion: string | null }
interface Linea { id: string; debito: string; credito: string }
interface Movimiento { asiento: Asiento; linea: Linea; saldo: number }
interface MayorResponse { cuenta: Cuenta; movimientos: Movimiento[] }

const cop = (n: string | number) => {
  const num = Number(n);
  return num === 0 ? "—" : `$${num.toLocaleString("es-CO", { minimumFractionDigits: 0 })}`;
};

export default function Auxiliares() {
  const hoy = new Date().toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 7) + "-01";

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);
  const [data, setData] = useState<MayorResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ cuentas: Cuenta[] }>("/api/contabilidad/cuentas")
      .then((r) => setCuentas(r.cuentas ?? []))
      .catch(() => {});
  }, []);

  async function cargar() {
    if (!cuentaId) return;
    setLoading(true);
    setData(null);
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    if (!cuenta) { setLoading(false); return; }
    try {
      const res = await apiFetch<MayorResponse>(
        `/api/contabilidad/mayor/${cuenta.codigo}?desde=${desde}&hasta=${hasta}`,
      );
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const totalDebitos  = data?.movimientos.reduce((s, m) => s + Number(m.linea.debito),  0) ?? 0;
  const totalCreditos = data?.movimientos.reduce((s, m) => s + Number(m.linea.credito), 0) ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Auxiliares contables</h1>
        <p className="text-sm text-gray-500 mt-0.5">Mayor detallado por cuenta — todos los asientos que la afectaron</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48 max-w-xs">
          <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta</label>
          <select
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
          >
            <option value="">Selecciona una cuenta...</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </select>
        </div>
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
          disabled={!cuentaId || loading}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          Consultar
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Cargando movimientos...</p>}

      {data && !loading && (
        <div className="space-y-4">
          {/* Cabecera cuenta */}
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4">
            <div>
              <p className="font-mono text-lg font-bold text-gray-900">{data.cuenta.codigo}</p>
              <p className="text-sm text-gray-600">{data.cuenta.nombre}</p>
            </div>
            <div className="ml-auto flex gap-8 text-center">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Naturaleza</p>
                <p className="font-medium text-gray-800 capitalize">{data.cuenta.naturaleza}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total débitos</p>
                <p className="font-semibold text-gray-900">{cop(totalDebitos)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total créditos</p>
                <p className="font-semibold text-gray-900">{cop(totalCreditos)}</p>
              </div>
              {data.movimientos.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo final</p>
                  <p className={`font-bold text-base ${data.movimientos[data.movimientos.length - 1].saldo >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {cop(Math.abs(data.movimientos[data.movimientos.length - 1].saldo))}
                    {data.movimientos[data.movimientos.length - 1].saldo < 0 && " Cr"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {data.movimientos.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
              <p className="text-gray-500 font-medium">Sin movimientos en el período</p>
              <p className="text-sm text-gray-400 mt-1">Ajusta el rango de fechas o selecciona otra cuenta.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Asiento</th>
                    <th className="px-4 py-3 text-left">Descripción</th>
                    <th className="px-4 py-3 text-right">Débito</th>
                    <th className="px-4 py-3 text-right">Crédito</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.movimientos.map(({ asiento, linea, saldo }) => (
                    <tr key={linea.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {new Date(asiento.fecha + "T00:00:00").toLocaleDateString("es-CO", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{asiento.numero}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">
                        {asiento.descripcion ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-700 font-medium">
                        {Number(linea.debito) > 0 ? cop(linea.debito) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-600 font-medium">
                        {Number(linea.credito) > 0 ? cop(linea.credito) : "—"}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${saldo >= 0 ? "text-gray-900" : "text-red-600"}`}>
                        {cop(Math.abs(saldo))}
                        {saldo < 0 && <span className="text-xs font-normal ml-0.5">Cr</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-right">TOTALES</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-700">{cop(totalDebitos)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">{cop(totalCreditos)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                      {data.movimientos.length > 0 ? cop(Math.abs(data.movimientos[data.movimientos.length - 1].saldo)) : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
