import { useState } from "react";
import { apiFetch, cop } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface Periodo {
  anio: number;
  mes: number;
  iva_generado: number;
  iva_descontable: number;
  saldo: number;
  facturas: number;
  gastos: number;
}

interface IvaResp {
  desde: string;
  hasta: string;
  periodos: Periodo[];
  totales: { iva_generado: number; iva_descontable: number; saldo: number };
}

export default function ReporteIVA() {
  const hoy = new Date();
  const primerDia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const hoyStr = hoy.toISOString().split("T")[0]!;

  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(hoyStr);
  const [data, setData] = useState<IvaResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function consultar() {
    setLoading(true);
    setError(null);
    void apiFetch<IvaResp>(`/api/reportes/iva?desde=${desde}&hasta=${hasta}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al consultar"))
      .finally(() => setLoading(false));
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reporte de IVA</h1>
        <p className="text-sm text-gray-500 mt-0.5">IVA generado (ventas) vs IVA descontable (compras) por período</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-36" />
            </div>
            <Button onClick={consultar} disabled={loading}>
              {loading ? "Consultando..." : "Consultar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {data && (
        <>
          {/* Totales */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-gray-500">IVA generado (ventas)</p>
                <p className="text-xl font-semibold text-gray-900">{cop(data.totales.iva_generado)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-gray-500">IVA descontable (compras)</p>
                <p className="text-xl font-semibold text-gray-900">{cop(data.totales.iva_descontable)}</p>
              </CardContent>
            </Card>
            <Card className={data.totales.saldo >= 0 ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"}>
              <CardContent className="pt-5">
                <p className={`text-xs ${data.totales.saldo >= 0 ? "text-orange-700" : "text-green-700"}`}>
                  {data.totales.saldo >= 0 ? "IVA a pagar DIAN" : "Saldo a favor"}
                </p>
                <p className={`text-xl font-semibold ${data.totales.saldo >= 0 ? "text-orange-800" : "text-green-800"}`}>
                  {cop(Math.abs(data.totales.saldo))}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detalle por mes */}
          {data.periodos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-gray-400">
                Sin movimientos de IVA en el período seleccionado.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalle por período</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-gray-500">Período</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-500">Facturas</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-500">IVA generado</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-500">Gastos con IVA</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-500">IVA descontable</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-500">Saldo IVA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.periodos.map((p) => (
                      <tr key={`${p.anio}-${p.mes}`} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-800">
                          {MESES[p.mes]} {p.anio}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-500">{p.facturas}</td>
                        <td className="px-6 py-3 text-right text-gray-800">{cop(p.iva_generado)}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{p.gastos}</td>
                        <td className="px-6 py-3 text-right text-gray-800">{cop(p.iva_descontable)}</td>
                        <td className={`px-6 py-3 text-right font-semibold ${p.saldo >= 0 ? "text-orange-600" : "text-green-600"}`}>
                          {p.saldo >= 0 ? cop(p.saldo) : `(${cop(Math.abs(p.saldo))})`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td className="px-6 py-3 font-semibold text-gray-800" colSpan={2}>Total</td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900">{cop(data.totales.iva_generado)}</td>
                      <td className="px-6 py-3" />
                      <td className="px-6 py-3 text-right font-semibold text-gray-900">{cop(data.totales.iva_descontable)}</td>
                      <td className={`px-6 py-3 text-right font-bold ${data.totales.saldo >= 0 ? "text-orange-600" : "text-green-600"}`}>
                        {data.totales.saldo >= 0 ? cop(data.totales.saldo) : `(${cop(Math.abs(data.totales.saldo))})`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
