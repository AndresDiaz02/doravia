import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, ArrowLeft, Percent } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { DictadoIA, type CamposFacturaIA } from "../components/DictadoIA";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

interface Cliente {
  id: string;
  nombre: string;
  numero_documento: string;
  tipo_documento: string;
}

interface Producto {
  id: string;
  nombre: string;
  codigo: string;
  precio_base: string;
  iva_pct: string;
  impoconsumo_pct: string;
}

interface RetencionConfig {
  id: string;
  nombre: string;
  tipo: string;
  porcentaje: string;
  activo?: boolean;
}

interface RetencionAplicada {
  key: number;
  config_id: string;
  nombre: string;
  tipo: string;
  porcentaje: string;
  base: string;
}

let nextRetKey = 0;

const UNIDADES = [
  { value: "UN", label: "UN — Unidad" },
  { value: "KG", label: "KG — Kilogramo" },
  { value: "GR", label: "GR — Gramo" },
  { value: "LT", label: "LT — Litro" },
  { value: "ML", label: "ML — Mililitro" },
  { value: "MT", label: "MT — Metro" },
  { value: "M2", label: "M2 — Metro²" },
  { value: "M3", label: "M3 — Metro³" },
  { value: "HOR", label: "HOR — Hora" },
  { value: "DIA", label: "DIA — Día" },
  { value: "MES", label: "MES — Mes" },
  { value: "BOL", label: "BOL — Bolsa" },
  { value: "CJA", label: "CJA — Caja" },
  { value: "PAR", label: "PAR — Par" },
  { value: "DOZ", label: "DOZ — Docena" },
] as const;

interface Linea {
  key: number;
  producto_id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  descuento_pct: string;
  iva_pct: string;
  impoconsumo_pct: string;
  unidad_medida: string;
}

function calcLinea(l: Linea) {
  const cant = Number(l.cantidad) || 0;
  const precio = Number(l.precio_unitario) || 0;
  const desc = Number(l.descuento_pct) || 0;
  const iva = Number(l.iva_pct) || 0;
  const impo = Number(l.impoconsumo_pct) || 0;
  const precioConDesc = precio * (1 - desc / 100);
  const subtotal = cant * precioConDesc;
  const ivaValor = subtotal * (iva / 100);
  const impoValor = subtotal * (impo / 100);
  return { subtotal, ivaValor, impoValor, total: subtotal + ivaValor + impoValor };
}

let nextKey = 0;
function newLinea(): Linea {
  return {
    key: nextKey++,
    producto_id: "",
    descripcion: "",
    cantidad: "1",
    precio_unitario: "",
    descuento_pct: "0",
    iva_pct: "19",
    impoconsumo_pct: "0",
    unidad_medida: "UN",
  };
}

export function FacturaNueva() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clienteId, setClienteId] = useState(params.get("cliente_id") ?? "");
  const [condicionPago, setCondicionPago] = useState<"contado" | "credito">("contado");
  const [formaPago, setFormaPago] = useState("efectivo");
  const [fechaVenc, setFechaVenc] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([newLinea()]);
  const [retencionesConfig, setRetencionesConfig] = useState<RetencionConfig[]>([]);
  const [retencionesAplicadas, setRetencionesAplicadas] = useState<RetencionAplicada[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      apiFetch<{ data: Cliente[] }>("/api/clientes?limit=200"),
      apiFetch<{ data: Producto[] }>("/api/productos?limit=200"),
      apiFetch<RetencionConfig[]>("/api/retenciones"),
    ]).then(([c, p, r]) => {
      setClientes(c.data);
      setProductos(p.data);
      setRetencionesConfig(r.filter((x) => x.activo !== false));
    });
  }, []);

  function setLinea(key: number, field: keyof Linea, value: string) {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, [field]: value };
        // Si se selecciona un producto, rellenar descripción y precio
        if (field === "producto_id" && value) {
          const p = productos.find((p) => p.id === value);
          if (p) {
            updated.descripcion = p.nombre;
            updated.precio_unitario = p.precio_base;
            updated.iva_pct = p.iva_pct;
            updated.impoconsumo_pct = p.impoconsumo_pct ?? "0";
          }
        }
        return updated;
      }),
    );
  }

  function addLinea() {
    setLineas((prev) => [...prev, newLinea()]);
  }

  function agregarLineaDesdeIA(campos: CamposFacturaIA) {
    const linea: Linea = {
      key: nextKey++,
      producto_id: "",
      descripcion: campos.descripcion,
      cantidad: String(campos.cantidad),
      precio_unitario: String(campos.precio_unitario),
      descuento_pct: "0",
      iva_pct: String(campos.iva_porcentaje),
      impoconsumo_pct: "0",
      unidad_medida: "UN",
    };
    setLineas((prev) => [...prev, linea]);
  }

  function removeLinea(key: number) {
    setLineas((prev) => prev.filter((l) => l.key !== key));
  }

  const totales = lineas.reduce(
    (acc, l) => {
      const c = calcLinea(l);
      return { subtotal: acc.subtotal + c.subtotal, iva: acc.iva + c.ivaValor, impo: acc.impo + c.impoValor, total: acc.total + c.total };
    },
    { subtotal: 0, iva: 0, impo: 0, total: 0 },
  );

  const totalRetenciones = retencionesAplicadas.reduce((s, r) => {
    return s + (Number(r.base) || totales.total) * (Number(r.porcentaje) / 100);
  }, 0);
  const netoAPagar = totales.total - totalRetenciones;

  function addRetencion(configId: string) {
    const cfg = retencionesConfig.find((r) => r.id === configId);
    if (!cfg) return;
    if (retencionesAplicadas.some((r) => r.config_id === configId)) return;
    setRetencionesAplicadas((prev) => [...prev, {
      key: nextRetKey++,
      config_id: cfg.id,
      nombre: cfg.nombre,
      tipo: cfg.tipo,
      porcentaje: cfg.porcentaje,
      base: String(totales.total),
    }]);
  }

  function removeRetencion(key: number) {
    setRetencionesAplicadas((prev) => prev.filter((r) => r.key !== key));
  }

  function setRetencionBase(key: number, base: string) {
    setRetencionesAplicadas((prev) => prev.map((r) => r.key === key ? { ...r, base } : r));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clienteId) {
      setError("Selecciona un cliente.");
      return;
    }
    if (lineas.some((l) => !l.descripcion || !l.cantidad || !l.precio_unitario)) {
      setError("Completa todos los campos de cada línea (descripción, cantidad, precio).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        cliente_id: clienteId,
        condicion_pago: condicionPago,
        forma_pago: formaPago,
        fecha_vencimiento: fechaVenc || undefined,
        observaciones: observaciones || undefined,
        items: lineas.map((l) => ({
          producto_id: l.producto_id || undefined,
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precio_unitario: Number(l.precio_unitario),
          descuento_pct: Number(l.descuento_pct),
          iva_pct: Number(l.iva_pct),
          impoconsumo_pct: Number(l.impoconsumo_pct) || 0,
          unidad_medida: l.unidad_medida,
        })),
        retenciones: retencionesAplicadas.map((r) => ({
          config_id: r.config_id,
          nombre: r.nombre,
          tipo: r.tipo,
          porcentaje: Number(r.porcentaje),
          base: Number(r.base) || totales.total,
        })),
      };
      interface FacturaResp { id: string }
      const factura = await apiFetch<FacturaResp>("/api/facturas", {
        method: "POST",
        body: JSON.stringify(body),
      });
      navigate(`/facturas/${factura.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Nueva factura</h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        {/* Encabezado */}
        <Card>
          <CardHeader>
            <CardTitle>Encabezado</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cliente">Cliente *</Label>
              <select
                id="cliente"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">— Seleccionar cliente —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.tipo_documento} {c.numero_documento})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="condicion_pago">Condición de pago *</Label>
              <select
                id="condicion_pago"
                value={condicionPago}
                onChange={(e) => {
                  const v = e.target.value as "contado" | "credito";
                  setCondicionPago(v);
                  if (v === "contado") setFechaVenc("");
                }}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="forma_pago">Forma de pago *</Label>
              <select
                id="forma_pago"
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta_credito">Tarjeta crédito</option>
                <option value="tarjeta_debito">Tarjeta débito</option>
                <option value="transferencia">Transferencia bancaria</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fecha_venc">
                Fecha de vencimiento{condicionPago === "credito" ? " *" : ""}
              </Label>
              <Input
                id="fecha_venc"
                type="date"
                value={fechaVenc}
                required={condicionPago === "credito"}
                onChange={(e) => setFechaVenc(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs">Observaciones</Label>
              <Input
                id="obs"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Líneas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ítems</CardTitle>
            <div className="flex items-center gap-2">
              <DictadoIA onAplicar={agregarLineaDesdeIA} />
              <Button type="button" variant="secondary" size="sm" onClick={addLinea}>
                <Plus className="h-3 w-3" />
                Agregar ítem
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 min-w-[200px]">Descripción</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 w-24">Unidad</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 w-20">Cant.</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 w-32">Precio unit.</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 w-20">Desc. %</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 w-20">IVA %</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 w-32">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineas.map((l) => {
                    const c = calcLinea(l);
                    return (
                      <tr key={l.key}>
                        <td className="px-4 py-2">
                          {productos.length > 0 && (
                            <select
                              value={l.producto_id}
                              onChange={(e) => setLinea(l.key, "producto_id", e.target.value)}
                              className="mb-1 block w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500"
                            >
                              <option value="">Texto libre</option>
                              {productos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.codigo} — {p.nombre}
                                </option>
                              ))}
                            </select>
                          )}
                          <Input
                            value={l.descripcion}
                            onChange={(e) => setLinea(l.key, "descripcion", e.target.value)}
                            placeholder="Descripción del ítem"
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={l.unidad_medida}
                            onChange={(e) => setLinea(l.key, "unidad_medida", e.target.value)}
                            className="block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-xs"
                          >
                            {UNIDADES.map((u) => (
                              <option key={u.value} value={u.value}>{u.value}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={l.cantidad}
                            onChange={(e) => setLinea(l.key, "cantidad", e.target.value)}
                            className="text-right"
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={l.precio_unitario}
                            onChange={(e) => setLinea(l.key, "precio_unitario", e.target.value)}
                            className="text-right"
                            required
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={l.descuento_pct}
                            onChange={(e) => setLinea(l.key, "descuento_pct", e.target.value)}
                            className="text-right"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={l.iva_pct}
                            onChange={(e) => setLinea(l.key, "iva_pct", e.target.value)}
                            className="block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="19">19%</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {cop(c.total)}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => removeLinea(l.key)}
                            disabled={lineas.length === 1}
                            className="rounded p-1 text-gray-300 hover:text-red-500 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div className="flex justify-end border-t border-gray-100 px-6 py-4">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>{cop(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>IVA</span><span>{cop(totales.iva)}</span>
                </div>
                {totales.impo > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Impoconsumo</span><span>{cop(totales.impo)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold text-gray-900">
                  <span>Total bruto</span><span>{cop(totales.total)}</span>
                </div>
                {retencionesAplicadas.map((r) => (
                  <div key={r.key} className="flex justify-between text-red-600">
                    <span>- {r.nombre} ({r.porcentaje}%)</span>
                    <span>- {cop((Number(r.base) || totales.total) * Number(r.porcentaje) / 100)}</span>
                  </div>
                ))}
                {retencionesAplicadas.length > 0 && (
                  <div className="flex justify-between border-t border-green-200 pt-1.5 font-bold text-green-700 text-base">
                    <span>Neto a pagar</span><span>{cop(netoAPagar)}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Retenciones */}
        {retencionesConfig.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Retenciones</CardTitle>
              <select
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
                value=""
                onChange={(e) => { if (e.target.value) addRetencion(e.target.value); }}
              >
                <option value="">+ Agregar retención</option>
                {retencionesConfig
                  .filter((r) => !retencionesAplicadas.some((a) => a.config_id === r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre} ({r.porcentaje}%)</option>
                  ))}
              </select>
            </CardHeader>
            {retencionesAplicadas.length > 0 ? (
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Retención</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 w-24">%</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 w-36">Base</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 w-36">Valor</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {retencionesAplicadas.map((r) => {
                      const base = Number(r.base) || totales.total;
                      const valor = base * Number(r.porcentaje) / 100;
                      return (
                        <tr key={r.key}>
                          <td className="px-4 py-2 font-medium text-gray-800">{r.nombre}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{r.porcentaje}%</td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={r.base}
                              onChange={(e) => setRetencionBase(r.key, e.target.value)}
                              className="text-right"
                              placeholder="Base (vacío = total)"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-red-600">{cop(valor)}</td>
                          <td className="px-4 py-2">
                            <button type="button" onClick={() => removeRetencion(r.key)} className="rounded p-1 text-gray-300 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-sm text-gray-400 flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Selecciona una retención del desplegable para aplicarla a esta factura.
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            {error.includes("resolución DIAN") && (
              <a href="/configuracion/dian" className="ml-2 underline font-medium">
                Ir a Configuración DIAN →
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Enviando a DIAN..." : "Emitir factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
