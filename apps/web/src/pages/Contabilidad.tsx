import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, cop, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Lock, FileDown } from "lucide-react";

type Tab = "diario" | "mayor" | "balance" | "resultados";

interface Asiento {
  id: string;
  numero: string;
  fecha: string;
  descripcion: string;
  origen: string;
  lineas: {
    linea: { id: string; debito: string; credito: string; descripcion: string | null };
    cuenta: { codigo: string; nombre: string };
  }[];
}

interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  naturaleza: string;
}

interface Movimiento {
  asiento: { id: string; numero: string; fecha: string; descripcion: string };
  linea: { debito: string; credito: string };
  saldo: number;
}

interface MayorResp {
  cuenta: Cuenta;
  movimientos: Movimiento[];
}

interface CuentaSaldo {
  codigo: string;
  nombre: string;
  tipo: string;
  naturaleza: string;
  total_debito: string;
  total_credito: string;
  saldo: number;
}

interface BalanceResp {
  corte: string;
  activos: CuentaSaldo[];
  pasivos: CuentaSaldo[];
  patrimonio: CuentaSaldo[];
  totales: { activos: number; pasivos: number; patrimonio: number };
}

interface EstadoResultadosResp {
  periodo: { desde: string; hasta: string };
  ingresos: CuentaSaldo[];
  costos: CuentaSaldo[];
  gastos: CuentaSaldo[];
  totales: {
    ingresos: number;
    costos: number;
    gastos: number;
    utilidad_bruta: number;
    utilidad_neta: number;
  };
}

export function Contabilidad() {
  const { plan } = useAuth();
  const hoy = new Date();
  const primerDiaMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  const hoyStr = hoy.toISOString().split("T")[0];

  const hasLevel2 = (plan?.accounting_level ?? 1) >= 2;

  const [tab, setTab] = useState<Tab>("diario");
  const [desde, setDesde] = useState(primerDiaMes);
  const [hasta, setHasta] = useState(hoyStr);
  const [corte, setCorte] = useState(hoyStr);

  // Libro diario
  const [asientos, setAsientos] = useState<Asiento[]>([]);
  const [loadingDiario, setLoadingDiario] = useState(false);

  // Mayor
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [codigoMayor, setCodigoMayor] = useState("");
  const [mayor, setMayor] = useState<MayorResp | null>(null);
  const [loadingMayor, setLoadingMayor] = useState(false);

  // Balance general
  const [balance, setBalance] = useState<BalanceResp | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Estado de resultados
  const [estado, setEstado] = useState<EstadoResultadosResp | null>(null);
  const [loadingEstado, setLoadingEstado] = useState(false);

  useEffect(() => {
    void apiFetch<Cuenta[]>("/api/contabilidad/cuentas").then(setCuentas);
  }, []);

  function cargarDiario() {
    setLoadingDiario(true);
    void apiFetch<Asiento[]>(`/api/contabilidad/diario?desde=${desde}&hasta=${hasta}`)
      .then(setAsientos)
      .finally(() => setLoadingDiario(false));
  }

  function cargarMayor() {
    if (!codigoMayor) return;
    setLoadingMayor(true);
    setMayor(null);
    void apiFetch<MayorResp>(`/api/contabilidad/mayor/${codigoMayor}?desde=${desde}&hasta=${hasta}`)
      .then(setMayor)
      .finally(() => setLoadingMayor(false));
  }

  function cargarBalance() {
    setLoadingBalance(true);
    void apiFetch<BalanceResp>(`/api/contabilidad/balance-general?corte=${corte}`)
      .then(setBalance)
      .finally(() => setLoadingBalance(false));
  }

  function cargarEstadoResultados() {
    setLoadingEstado(true);
    void apiFetch<EstadoResultadosResp>(`/api/contabilidad/estado-resultados?desde=${desde}&hasta=${hasta}`)
      .then(setEstado)
      .finally(() => setLoadingEstado(false));
  }

  useEffect(() => {
    if (tab === "diario") cargarDiario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Contabilidad</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {tab === "diario" && (
            <Button variant="secondary" onClick={() => void descargarExcel(`/api/contabilidad/exportar/diario?desde=${desde}&hasta=${hasta}`, `libro_diario_${desde}_${hasta}.xlsx`)}>
              <FileDown className="h-4 w-4" />Exportar Libro Diario
            </Button>
          )}
          {tab === "balance" && hasLevel2 && (
            <Button variant="secondary" onClick={() => void descargarExcel(`/api/contabilidad/exportar/balance?corte=${corte}`, `balance_general_${corte}.xlsx`)}>
              <FileDown className="h-4 w-4" />Exportar Balance
            </Button>
          )}
          {tab === "resultados" && hasLevel2 && (
            <Button variant="secondary" onClick={() => void descargarExcel(`/api/contabilidad/exportar/estado-resultados?desde=${desde}&hasta=${hasta}`, `estado_resultados_${desde}_${hasta}.xlsx`)}>
              <FileDown className="h-4 w-4" />Exportar Estado de Resultados
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit flex-wrap">
        <TabBtn active={tab === "diario"} onClick={() => setTab("diario")}>
          Libro diario
        </TabBtn>
        <TabBtn active={tab === "mayor"} onClick={() => setTab("mayor")}>
          Mayor de cuenta
        </TabBtn>
        <TabBtn
          active={tab === "balance"}
          onClick={() => hasLevel2 && setTab("balance")}
          locked={!hasLevel2}
        >
          Balance general
        </TabBtn>
        <TabBtn
          active={tab === "resultados"}
          onClick={() => hasLevel2 && setTab("resultados")}
          locked={!hasLevel2}
        >
          Estado de resultados
        </TabBtn>
      </div>

      {/* Filtros de fecha comunes */}
      <div className="flex items-end gap-3 flex-wrap">
        {tab === "balance" ? (
          <>
            <div className="space-y-1.5">
              <Label>Corte</Label>
              <Input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} className="w-40" />
            </div>
            <Button variant="secondary" onClick={cargarBalance} disabled={loadingBalance}>
              {loadingBalance ? "Calculando…" : "Consultar"}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
            </div>

            {tab === "diario" && (
              <Button variant="secondary" onClick={cargarDiario} disabled={loadingDiario}>
                {loadingDiario ? "Cargando…" : "Consultar"}
              </Button>
            )}

            {tab === "mayor" && (
              <>
                <div className="space-y-1.5">
                  <Label>Cuenta PUC</Label>
                  <select
                    value={codigoMayor}
                    onChange={(e) => setCodigoMayor(e.target.value)}
                    className="block w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— Seleccionar cuenta —</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.codigo}>
                        {c.codigo} — {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="secondary" onClick={cargarMayor} disabled={loadingMayor || !codigoMayor}>
                  {loadingMayor ? "Cargando…" : "Consultar"}
                </Button>
              </>
            )}

            {tab === "resultados" && (
              <Button variant="secondary" onClick={cargarEstadoResultados} disabled={loadingEstado}>
                {loadingEstado ? "Calculando…" : "Consultar"}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Libro diario */}
      {tab === "diario" && (
        <div className="space-y-4">
          {asientos.length === 0 && !loadingDiario && (
            <p className="text-sm text-gray-400">Sin asientos en el periodo.</p>
          )}
          {asientos.map((a) => (
            <Card key={a.id}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{a.numero}</span>
                    <span className="ml-3 text-sm text-gray-500">{a.descripcion}</span>
                  </div>
                  <span className="text-sm text-gray-400">{a.fecha}</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-50 bg-gray-50">
                    <tr>
                      <th className="px-6 py-2 text-left font-medium text-gray-400">Cuenta</th>
                      <th className="px-6 py-2 text-left font-medium text-gray-400">Descripción</th>
                      <th className="px-6 py-2 text-right font-medium text-gray-400">Débito</th>
                      <th className="px-6 py-2 text-right font-medium text-gray-400">Crédito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {a.lineas?.map(({ linea, cuenta }) => (
                      <tr key={linea.id}>
                        <td className="px-6 py-2 font-mono text-xs text-gray-600">
                          {cuenta.codigo} <span className="font-sans text-gray-500">{cuenta.nombre}</span>
                        </td>
                        <td className="px-6 py-2 text-gray-500">{linea.descripcion ?? "—"}</td>
                        <td className="px-6 py-2 text-right">
                          {Number(linea.debito) > 0 ? cop(linea.debito) : "—"}
                        </td>
                        <td className="px-6 py-2 text-right">
                          {Number(linea.credito) > 0 ? cop(linea.credito) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Mayor de cuenta */}
      {tab === "mayor" && mayor && (
        <Card>
          <CardHeader>
            <CardTitle>
              {mayor.cuenta.codigo} — {mayor.cuenta.nombre}
              <span className="ml-2 text-sm font-normal text-gray-400">({mayor.cuenta.tipo})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Asiento</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Débito</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Crédito</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mayor.movimientos.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium">{m.asiento.numero}</p>
                      <p className="text-xs text-gray-400">{m.asiento.descripcion}</p>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{m.asiento.fecha}</td>
                    <td className="px-6 py-3 text-right">
                      {Number(m.linea.debito) > 0 ? cop(m.linea.debito) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {Number(m.linea.credito) > 0 ? cop(m.linea.credito) : "—"}
                    </td>
                    <td className={`px-6 py-3 text-right font-medium ${m.saldo >= 0 ? "text-gray-900" : "text-red-600"}`}>
                      {cop(Math.abs(m.saldo))}{m.saldo < 0 ? " CR" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Balance General */}
      {tab === "balance" && !hasLevel2 && <PlanUpgradeNotice feature="Balance general" />}
      {tab === "balance" && hasLevel2 && !balance && (
        <p className="text-sm text-gray-400">Selecciona la fecha de corte y presiona Consultar.</p>
      )}
      {tab === "balance" && balance && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">Fecha de corte: <strong>{balance.corte}</strong></p>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Activos */}
            <Card>
              <CardHeader><CardTitle>Activos</CardTitle></CardHeader>
              <CardContent className="p-0">
                <CuentasSaldoTable filas={balance.activos} total={balance.totales.activos} />
              </CardContent>
            </Card>

            {/* Pasivos + Patrimonio */}
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Pasivos</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <CuentasSaldoTable filas={balance.pasivos} total={balance.totales.pasivos} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Patrimonio</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <CuentasSaldoTable filas={balance.patrimonio} total={balance.totales.patrimonio} />
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 flex items-center justify-between">
            <span className="font-medium text-gray-700">Activos = Pasivos + Patrimonio</span>
            <span className={`font-semibold ${
              Math.abs(balance.totales.activos - balance.totales.pasivos - balance.totales.patrimonio) < 1
                ? "text-green-700"
                : "text-red-600"
            }`}>
              {cop(balance.totales.activos)} = {cop(balance.totales.pasivos + balance.totales.patrimonio)}
            </span>
          </div>
        </div>
      )}

      {/* Estado de Resultados */}
      {tab === "resultados" && !hasLevel2 && <PlanUpgradeNotice feature="Estado de resultados" />}
      {tab === "resultados" && hasLevel2 && !estado && (
        <p className="text-sm text-gray-400">Selecciona el periodo y presiona Consultar.</p>
      )}
      {tab === "resultados" && estado && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            Periodo: <strong>{estado.periodo.desde}</strong> → <strong>{estado.periodo.hasta}</strong>
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-green-700">Ingresos</CardTitle></CardHeader>
              <CardContent className="p-0">
                <CuentasSaldoTable filas={estado.ingresos} total={estado.totales.ingresos} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-amber-700">Costos</CardTitle></CardHeader>
              <CardContent className="p-0">
                <CuentasSaldoTable filas={estado.costos} total={estado.totales.costos} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-red-700">Gastos</CardTitle></CardHeader>
              <CardContent className="p-0">
                <CuentasSaldoTable filas={estado.gastos} total={estado.totales.gastos} />
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex justify-between items-center px-5 py-3 bg-gray-50 border-b">
              <span className="text-sm font-medium text-gray-600">Utilidad bruta</span>
              <span className={`font-semibold ${estado.totales.utilidad_bruta >= 0 ? "text-green-700" : "text-red-600"}`}>
                {cop(estado.totales.utilidad_bruta)}
              </span>
            </div>
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm font-medium text-gray-600">Gastos operacionales</span>
              <span className="font-semibold text-red-600">({cop(estado.totales.gastos)})</span>
            </div>
            <div className="flex justify-between items-center px-5 py-4 bg-gray-50 border-t border-gray-200">
              <span className="font-semibold text-gray-900">Utilidad neta</span>
              <span className={`text-lg font-bold ${estado.totales.utilidad_neta >= 0 ? "text-green-700" : "text-red-600"}`}>
                {cop(estado.totales.utilidad_neta)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CuentasSaldoTable({ filas, total }: { filas: CuentaSaldo[]; total: number }) {
  if (filas.length === 0) return <p className="px-4 py-3 text-sm text-gray-400">Sin movimientos.</p>;
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-gray-50">
        {filas.map((f) => (
          <tr key={f.codigo} className="hover:bg-gray-50">
            <td className="px-4 py-2 font-mono text-xs text-gray-500">{f.codigo}</td>
            <td className="px-4 py-2 text-gray-700">{f.nombre}</td>
            <td className="px-4 py-2 text-right font-medium text-gray-900">{cop(f.saldo)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-gray-200 bg-gray-50">
          <td colSpan={2} className="px-4 py-2 font-medium text-gray-700">Total</td>
          <td className="px-4 py-2 text-right font-semibold text-gray-900">{cop(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function PlanUpgradeNotice({ feature }: { feature: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
      <Lock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium text-amber-800">{feature} requiere plan Raíz o superior</p>
        <p className="text-sm text-amber-700 mt-1">
          Tu plan actual solo incluye contabilidad básica. Actualiza tu plan para acceder a reportes financieros avanzados.
        </p>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  locked = false,
  onClick,
  children,
}: {
  active: boolean;
  locked?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
        locked
          ? "text-gray-300 cursor-not-allowed"
          : active
          ? "bg-gradient-cold text-white"
          : "text-gray-500 hover:text-gray-900"
      }`}
      title={locked ? "Requiere plan Raíz o superior" : undefined}
    >
      {locked && <Lock className="w-3 h-3" />}
      {children}
    </button>
  );
}
