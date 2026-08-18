import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, ApiError, cop, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Lock, FileDown } from "lucide-react";

type Tab = "diario" | "mayor" | "balance" | "resultados" | "ajustes" | "control" | "cierre";

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
  nivel?: number;
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

interface CierreMensualResp {
  periodo: { desde: string; hasta: string };
  resumen: { cuentas_por_pagar: number; gastos_sin_asiento: number; facturas_sin_asiento: number; ventas_pos_sin_asiento: number; periodos_abiertos: number };
  pendientes_pago: { id: string; descripcion: string; total: string; fecha_vencimiento: string | null }[];
  gastos_sin_asiento: { id: string; descripcion: string; fecha: string }[];
  facturas_sin_asiento: { id: string; numero: string; fecha_emision: string }[];
  ventas_pos_sin_asiento: { id: string; numero: string; created_at: string }[];
  periodos_abiertos: { id: string; nombre: string; fecha_inicio: string; fecha_fin: string }[];
}

type LineaAjuste = { cuenta_id: string; descripcion: string; debito: string; credito: string };

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

  // Cierre anual
  const [anoCierre, setAnoCierre] = useState(String(hoy.getFullYear() - 1));
  const [cierreMensaje, setCierreMensaje] = useState<string | null>(null);
  const [cierreError, setCierreError] = useState<string | null>(null);
  const [ejecutandoCierre, setEjecutandoCierre] = useState(false);

  const [lineasAjuste, setLineasAjuste] = useState<LineaAjuste[]>([
    { cuenta_id: "", descripcion: "", debito: "", credito: "" },
    { cuenta_id: "", descripcion: "", debito: "", credito: "" },
  ]);
  const [fechaAjuste, setFechaAjuste] = useState(hoyStr);
  const [descripcionAjuste, setDescripcionAjuste] = useState("");
  const [ajusteMensaje, setAjusteMensaje] = useState<string | null>(null);
  const [ajusteError, setAjusteError] = useState<string | null>(null);
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [controlCierre, setControlCierre] = useState<CierreMensualResp | null>(null);
  const [loadingControl, setLoadingControl] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

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

  async function ejecutarCierreAnual() {
    if (!confirm(`¿Confirmas el cierre contable del año ${anoCierre}? Esta acción no se puede deshacer.`)) return;
    setEjecutandoCierre(true);
    setCierreMensaje(null);
    setCierreError(null);
    try {
      const resp = await apiFetch<{ mensaje: string }>("/api/contabilidad/cierre-anual", {
        method: "POST",
        body: JSON.stringify({ ano: Number(anoCierre) }),
      });
      setCierreMensaje(resp.mensaje);
    } catch (err) {
      setCierreError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEjecutandoCierre(false);
    }
  }

  async function guardarAjuste() {
    setAjusteMensaje(null);
    setAjusteError(null);
    setGuardandoAjuste(true);
    try {
      const resp = await apiFetch<{ mensaje: string }>("/api/contabilidad/asientos", {
        method: "POST",
        body: JSON.stringify({
          fecha: fechaAjuste,
          descripcion: descripcionAjuste,
          lineas: lineasAjuste.map((l) => ({ ...l, debito: Number(l.debito || 0), credito: Number(l.credito || 0) })),
        }),
      });
      setAjusteMensaje(resp.mensaje);
      setDescripcionAjuste("");
      setLineasAjuste([{ cuenta_id: "", descripcion: "", debito: "", credito: "" }, { cuenta_id: "", descripcion: "", debito: "", credito: "" }]);
    } catch (err) {
      setAjusteError(err instanceof ApiError ? err.message : "No fue posible guardar el ajuste.");
    } finally {
      setGuardandoAjuste(false);
    }
  }

  function cargarControlCierre() {
    setLoadingControl(true);
    void apiFetch<CierreMensualResp>(`/api/contabilidad/cierre-mensual?desde=${desde}&hasta=${hasta}`)
      .then(setControlCierre)
      .catch(() => setControlCierre(null))
      .finally(() => setLoadingControl(false));
  }

  async function sincronizarAsientos() {
    setSincronizando(true);
    try {
      await apiFetch("/api/contabilidad/sincronizar-asientos", { method: "POST", body: JSON.stringify({ desde, hasta }) });
      cargarControlCierre();
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => {
    if (tab === "diario") cargarDiario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 dark:[&_.bg-white]:bg-slate-900 dark:[&_.bg-gray-50]:bg-slate-800/70 dark:[&_.border-gray-50]:border-slate-800 dark:[&_.border-gray-100]:border-slate-800 dark:[&_.border-gray-200]:border-slate-700 dark:[&_.border-gray-300]:border-slate-600 dark:[&_.text-gray-900]:text-white dark:[&_.text-gray-800]:text-slate-100 dark:[&_.text-gray-700]:text-slate-200 dark:[&_.text-gray-600]:text-slate-300 dark:[&_.text-gray-500]:text-slate-400 dark:[&_.text-gray-400]:text-slate-500 dark:[&_.hover\:bg-gray-50:hover]:bg-slate-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-action">Finanzas y cumplimiento</p>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Contabilidad</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Libros, estados financieros, ajustes y cierre en un mismo flujo.</p>
        </div>
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
      <div className="flex w-full gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
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
        <TabBtn active={tab === "ajustes"} onClick={() => setTab("ajustes")}>
          Ajuste manual
        </TabBtn>
        <TabBtn active={tab === "control"} onClick={() => setTab("control")}>
          Control de cierre
        </TabBtn>
        <TabBtn
          active={tab === "cierre"}
          onClick={() => hasLevel2 && setTab("cierre")}
          locked={!hasLevel2}
        >
          Cierre anual
        </TabBtn>
      </div>

      {/* Filtros de fecha comunes */}
      <div className="flex items-end gap-3 flex-wrap">
        {tab === "ajustes" ? null : tab === "balance" ? (
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
                    className="dv-input block w-64 px-3 py-2 text-sm"
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
            {tab === "control" && (
              <Button variant="secondary" onClick={cargarControlCierre} disabled={loadingControl}>
                {loadingControl ? "Revisando…" : "Revisar pendientes"}
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

      {/* Ajustes manuales */}
      {tab === "ajustes" && (
        <Card>
          <CardHeader><CardTitle>Nuevo ajuste contable</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">Registra únicamente ajustes con soporte. Doravia valida la partida doble y bloquea periodos cerrados.</p>
            <div className="grid gap-3 md:grid-cols-[180px_1fr]">
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={fechaAjuste} onChange={(e) => setFechaAjuste(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Descripción</Label><Input value={descripcionAjuste} onChange={(e) => setDescripcionAjuste(e.target.value)} placeholder="Ej. Ajuste de depreciación con soporte" maxLength={250} /></div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-gray-50 text-gray-500"><tr><th className="p-2 text-left">Cuenta</th><th className="p-2 text-left">Detalle</th><th className="p-2 text-right">Débito</th><th className="p-2 text-right">Crédito</th><th /></tr></thead>
                <tbody>
                  {lineasAjuste.map((linea, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2"><select value={linea.cuenta_id} onChange={(e) => setLineasAjuste((prev) => prev.map((l, i) => i === index ? { ...l, cuenta_id: e.target.value } : l))} className="w-full rounded border px-2 py-1.5"><option value="">Seleccionar</option>{cuentas.filter((c) => Number((c as Cuenta & { nivel?: number }).nivel ?? 3) >= 3).map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}</select></td>
                      <td className="p-2"><Input value={linea.descripcion} onChange={(e) => setLineasAjuste((prev) => prev.map((l, i) => i === index ? { ...l, descripcion: e.target.value } : l))} /></td>
                      <td className="p-2"><Input inputMode="decimal" value={linea.debito} onChange={(e) => setLineasAjuste((prev) => prev.map((l, i) => i === index ? { ...l, debito: e.target.value, credito: e.target.value ? "" : l.credito } : l))} /></td>
                      <td className="p-2"><Input inputMode="decimal" value={linea.credito} onChange={(e) => setLineasAjuste((prev) => prev.map((l, i) => i === index ? { ...l, credito: e.target.value, debito: e.target.value ? "" : l.debito } : l))} /></td>
                      <td className="p-2">{lineasAjuste.length > 2 && <button className="text-red-600" onClick={() => setLineasAjuste((prev) => prev.filter((_, i) => i !== index))}>Quitar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3"><Button variant="secondary" onClick={() => setLineasAjuste((prev) => [...prev, { cuenta_id: "", descripcion: "", debito: "", credito: "" }])}>Agregar línea</Button><Button onClick={() => void guardarAjuste()} disabled={guardandoAjuste}>{guardandoAjuste ? "Guardando…" : "Registrar ajuste"}</Button></div>
            {ajusteMensaje && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{ajusteMensaje}</p>}
            {ajusteError && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{ajusteError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Lista de control mensual */}
      {tab === "control" && (
        <div className="space-y-4">
          {!controlCierre && !loadingControl && <p className="text-sm text-gray-500">Selecciona el periodo y presiona «Revisar pendientes».</p>}
          {controlCierre && <>
            <div className="grid gap-3 md:grid-cols-5">
              <ControlCard label="Cuentas por pagar" value={controlCierre.resumen.cuentas_por_pagar} />
              <ControlCard label="Gastos sin asiento" value={controlCierre.resumen.gastos_sin_asiento} />
              <ControlCard label="Facturas sin asiento" value={controlCierre.resumen.facturas_sin_asiento} />
              <ControlCard label="Ventas POS sin asiento" value={controlCierre.resumen.ventas_pos_sin_asiento} />
              <ControlCard label="Periodos abiertos" value={controlCierre.resumen.periodos_abiertos} />
            </div>
            <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Pendientes para el cierre</CardTitle><Button variant="secondary" onClick={() => void sincronizarAsientos()} disabled={sincronizando}>{sincronizando ? "Sincronizando…" : "Reparar asientos automáticos"}</Button></div></CardHeader><CardContent className="space-y-4 text-sm">
              <ControlList title="Cuentas por pagar" items={controlCierre.pendientes_pago.map((p) => `${p.descripcion} — ${cop(p.total)}${p.fecha_vencimiento ? ` · vence ${p.fecha_vencimiento}` : ""}`)} />
              <ControlList title="Gastos aprobados sin asiento" items={controlCierre.gastos_sin_asiento.map((g) => `${g.fecha} — ${g.descripcion}`)} />
              <ControlList title="Facturas aceptadas sin asiento" items={controlCierre.facturas_sin_asiento.map((f) => `${f.fecha_emision.slice(0, 10)} — ${f.numero}`)} />
              <ControlList title="Ventas POS sin asiento" items={controlCierre.ventas_pos_sin_asiento.map((v) => `${v.created_at.slice(0, 10)} — ${v.numero}`)} />
              <ControlList title="Periodos abiertos" items={controlCierre.periodos_abiertos.map((p) => `${p.nombre}: ${p.fecha_inicio} a ${p.fecha_fin}`)} />
            </CardContent></Card>
          </>}
        </div>
      )}

      {/* Cierre Anual */}
      {tab === "cierre" && !hasLevel2 && <PlanUpgradeNotice feature="Cierre de ejercicio anual" />}
      {tab === "cierre" && hasLevel2 && (
        <Card>
          <CardHeader>
            <CardTitle>Cierre de ejercicio anual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Antes de ejecutar el cierre:</p>
              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                <li>Todos los períodos mensuales del año deben estar cerrados.</li>
                <li>Se creará un asiento contable de cierre que traslada la utilidad o pérdida a patrimonio.</li>
                <li>Esta acción solo puede ejecutarse una vez por año.</li>
              </ul>
            </div>

            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label>Año a cerrar</Label>
                <Input
                  type="number"
                  min="2020"
                  max={hoy.getFullYear()}
                  value={anoCierre}
                  onChange={(e) => setAnoCierre(e.target.value)}
                  className="w-28"
                />
              </div>
              <Button onClick={() => void ejecutarCierreAnual()} disabled={ejecutandoCierre}>
                {ejecutandoCierre ? "Ejecutando..." : `Ejecutar cierre ${anoCierre}`}
              </Button>
            </div>

            {cierreMensaje && (
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
                {cierreMensaje}
              </div>
            )}
            {cierreError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {cierreError}
              </div>
            )}
          </CardContent>
        </Card>
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

function ControlCard({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><p className="text-sm text-gray-500">{label}</p><p className={"mt-1 text-2xl font-semibold " + (value ? "text-amber-700" : "text-green-700")}>{value}</p></CardContent></Card>;
}

function ControlList({ title, items }: { title: string; items: string[] }) {
  return <div><p className="font-medium text-gray-800">{title}</p>{items.length ? <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="mt-1 text-green-700">Sin pendientes.</p>}</div>;
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
      className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-all flex items-center gap-1.5 ${
        locked
          ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
          : active
          ? "bg-gradient-cold text-white"
          : "text-gray-500 hover:bg-action/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
      }`}
      title={locked ? "Requiere plan Raíz o superior" : undefined}
    >
      {locked && <Lock className="w-3 h-3" />}
      {children}
    </button>
  );
}
