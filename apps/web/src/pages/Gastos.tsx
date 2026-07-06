import { useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchPaged, cop, fecha, descargarExcel } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Plus, Receipt, AlertCircle, Sparkles, Upload, FileDown } from "lucide-react";

interface Proveedor { id: string; nombre: string; nit: string | null }

interface Gasto {
  id: string;
  categoria: string;
  descripcion: string;
  monto: string;
  iva: string;
  total: string;
  fecha: string;
  fecha_vencimiento: string | null;
  estado: string;
  pagado_at: string | null;
  observaciones: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
}

const CATEGORIAS = [
  "arrendamiento","nomina","servicios_publicos","transporte",
  "publicidad","papeleria","tecnologia","mantenimiento","impuestos",
  "honorarios","compra_mercancia","otros",
] as const;

const CATEGORIA_LABEL: Record<string, string> = {
  arrendamiento: "Arrendamiento",
  nomina: "Nómina",
  servicios_publicos: "Servicios públicos",
  transporte: "Transporte",
  publicidad: "Publicidad",
  papeleria: "Papelería",
  tecnologia: "Tecnología",
  mantenimiento: "Mantenimiento",
  impuestos: "Impuestos",
  honorarios: "Honorarios",
  compra_mercancia: "Compra de mercancía",
  otros: "Otros",
};

const ESTADO_BADGE: Record<string, "yellow" | "green" | "blue"> = {
  borrador: "yellow",
  aprobado: "blue",
  pagado:   "green",
};
const ESTADO_LABEL: Record<string, string> = { borrador: "Borrador", aprobado: "Aprobado", pagado: "Pagado" };

type TabActiva = "gastos" | "cuentas_por_pagar";

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

export default function Gastos() {
  const { plan, isContador } = useAuth();
  const puedeIA = (plan?.features as Record<string, boolean> | undefined)?.ia_asistente === true;

  const [tab, setTab] = useState<TabActiva>("gastos");
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cuentasPorPagar, setCuentasPorPagar] = useState<Gasto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [iaInfo, setIaInfo] = useState<{ usados: number; limite: number | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    proveedor_id: "",
    categoria: "otros" as typeof CATEGORIAS[number],
    descripcion: "",
    monto: "",
    iva: "0",
    fecha: hoy(),
    fecha_vencimiento: "",
    estado: "borrador",
    observaciones: "",
  });

  async function cargar() {
    try {
      const [g, cp, provs] = await Promise.all([
        apiFetchPaged<Gasto>("/api/gastos", 1, 100),
        apiFetch<Gasto[]>("/api/gastos/cuentas-por-pagar"),
        apiFetch<Proveedor[]>("/api/gastos/proveedores"),
      ]);
      setGastos(g.data);
      setCuentasPorPagar(cp);
      setProveedores(provs);
    } catch {
      setError("No se pudieron cargar los gastos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    if (puedeIA) {
      apiFetch<{ usados: number; limite: number | null }>("/api/ia/uso-mes")
        .then(setIaInfo)
        .catch(() => null);
    }
  }, [puedeIA]);

  const totalEstimado = Number(form.monto || 0) + Number(form.iva || 0);

  async function handleArchivoIA(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Solo se aceptan imágenes JPG, PNG o WebP.");
      return;
    }

    setAnalizando(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const resultado = await apiFetch<{
        descripcion: string;
        monto: number;
        iva: number;
        fecha: string | null;
        categoria: string;
        proveedor_nombre: string | null;
        observaciones: string | null;
        confianza: string;
      }>("/api/ia/analizar-documento", {
        method: "POST",
        body: JSON.stringify({ imagen_base64: base64, media_type: mediaType }),
      });

      setForm((prev) => ({
        ...prev,
        descripcion: resultado.descripcion ?? prev.descripcion,
        monto: resultado.monto ? String(resultado.monto) : prev.monto,
        iva: resultado.iva !== undefined ? String(resultado.iva) : prev.iva,
        fecha: resultado.fecha ?? prev.fecha,
        categoria: (resultado.categoria as typeof prev.categoria) ?? prev.categoria,
        observaciones: resultado.observaciones ?? prev.observaciones,
      }));

      if (iaInfo) {
        setIaInfo((prev) => prev ? { ...prev, usados: prev.usados + 1 } : prev);
      }

      if (resultado.confianza === "baja") {
        setError("El documento no estaba muy claro. Revisa los campos extraídos antes de guardar.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo analizar el documento.");
    } finally {
      setAnalizando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function guardar() {
    if (!form.descripcion || !form.monto || !form.fecha) return;
    setGuardando(true);
    try {
      await apiFetch("/api/gastos", {
        method: "POST",
        body: JSON.stringify({
          proveedor_id: form.proveedor_id || null,
          categoria: form.categoria,
          descripcion: form.descripcion,
          monto: Number(form.monto),
          iva: Number(form.iva),
          fecha: form.fecha,
          fecha_vencimiento: form.fecha_vencimiento || null,
          estado: form.estado,
          observaciones: form.observaciones || null,
        }),
      });
      setDialogOpen(false);
      setForm({ proveedor_id: "", categoria: "otros", descripcion: "", monto: "", iva: "0", fecha: hoy(), fecha_vencimiento: "", estado: "borrador", observaciones: "" });
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el gasto.");
    } finally {
      setGuardando(false);
    }
  }

  async function pagar(id: string) {
    try {
      await apiFetch(`/api/gastos/${id}/pagar`, { method: "PATCH" });
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al marcar como pagado.");
    }
  }

  async function aprobar(id: string) {
    try {
      await apiFetch(`/api/gastos/${id}`, { method: "PATCH", body: JSON.stringify({ estado: "aprobado" }) });
      cargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al aprobar el gasto.");
    }
  }

  const totalCuentasPorPagar = cuentasPorPagar.reduce((s, g) => s + Number(g.total), 0);

  if (loading) return <p className="p-8 text-gray-500">Cargando gastos…</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Gastos</h1>
          <p className="text-sm text-gray-500 mt-1">Control de egresos y cuentas por pagar</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void descargarExcel("/api/exportar/gastos", "gastos.xlsx")}>
            <FileDown className="w-4 h-4" /> Excel
          </Button>
          {!isContador && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nuevo gasto
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {cuentasPorPagar.length > 0 && (
        <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Tienes {cuentasPorPagar.length} cuenta{cuentasPorPagar.length > 1 ? "s" : ""} por pagar
            </p>
            <p className="text-sm text-amber-700 mt-0.5">Total pendiente: <strong>{cop(totalCuentasPorPagar)}</strong></p>
          </div>
          <button className="ml-auto text-xs text-amber-700 underline shrink-0" onClick={() => setTab("cuentas_por_pagar")}>Ver cuentas por pagar</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {(["gastos", "cuentas_por_pagar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "gastos" ? "Todos los gastos" : `Cuentas por pagar (${cuentasPorPagar.length})`}
          </button>
        ))}
      </div>

      {tab === "gastos" && (
        <GastosTabla gastos={gastos} onAprobar={aprobar} onPagar={pagar} isContador={isContador} />
      )}

      {tab === "cuentas_por_pagar" && (
        <div>
          {cuentasPorPagar.length === 0 ? (
            <Card><CardContent className="py-16 flex flex-col items-center gap-2 text-gray-500">
              <Receipt className="w-12 h-12 text-gray-300" />
              <p>No hay cuentas por pagar pendientes.</p>
            </CardContent></Card>
          ) : (
            <GastosTabla gastos={cuentasPorPagar} onAprobar={aprobar} onPagar={pagar} destacar />
          )}
        </div>
      )}

      {/* Input oculto para imagen IA */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void handleArchivoIA(e)}
      />

      {/* Dialog nuevo gasto */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Nuevo gasto">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Botón IA */}
          {puedeIA && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-violet-800">Analizar con IA</p>
                <p className="text-xs text-violet-600">
                  Sube una foto del recibo y completaremos el formulario automáticamente.
                  {iaInfo && iaInfo.limite !== null && (
                    <span className="ml-1">({iaInfo.usados}/{iaInfo.limite} usados este mes)</span>
                  )}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={analizando || (iaInfo?.limite !== null && iaInfo !== null && iaInfo.usados >= (iaInfo.limite ?? Infinity))}
              >
                {analizando ? (
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /> Analizando…</span>
                ) : (
                  <span className="flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Subir imagen</span>
                )}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Proveedor</Label>
              <select
                value={form.proveedor_id}
                onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label>Categoría *</Label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as typeof form.categoria })}
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
              >
                {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Descripción *</Label>
            <Input id="desc" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Pago arriendo octubre" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="monto">Monto (COP) *</Label>
              <Input id="monto" type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label htmlFor="iva">IVA (COP)</Label>
              <Input id="iva" type="number" value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Total estimado</Label>
              <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                {cop(totalEstimado)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fechagasto">Fecha *</Label>
              <Input id="fechagasto" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="fechavencgasto">Fecha vencimiento (para C×P)</Label>
              <Input id="fechavencgasto" type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estado</Label>
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="borrador">Borrador</option>
                <option value="aprobado">Aprobado</option>
                <option value="pagado">Pagado</option>
              </select>
            </div>
            <div>
              <Label htmlFor="obsgasto">Observaciones</Label>
              <Input id="obsgasto" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Opcional" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || !form.descripcion || !form.monto}>{guardando ? "Guardando…" : "Guardar gasto"}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function GastosTabla({ gastos, onAprobar, onPagar, destacar, isContador }: {
  gastos: Gasto[];
  onAprobar: (id: string) => void;
  onPagar: (id: string) => void;
  destacar?: boolean;
  isContador?: boolean;
}) {
  const CATEGORIA_LABEL: Record<string, string> = {
    arrendamiento: "Arrendamiento",
    nomina: "Nómina",
    servicios_publicos: "Servicios públicos",
    transporte: "Transporte",
    publicidad: "Publicidad",
    papeleria: "Papelería",
    tecnologia: "Tecnología",
    mantenimiento: "Mantenimiento",
    impuestos: "Impuestos",
    honorarios: "Honorarios",
    compra_mercancia: "Compra mercancía",
    otros: "Otros",
  };

  if (gastos.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-2 text-gray-500">
          <Receipt className="w-12 h-12 text-gray-300" />
          <p>{isContador ? "Aún no hay gastos registrados en el sistema." : "No hay gastos registrados."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Categoría</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Descripción</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Proveedor</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Vence</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {gastos.map((g) => {
            const vencido = g.fecha_vencimiento && g.estado !== "pagado" && new Date(g.fecha_vencimiento) < new Date();
            return (
              <tr key={g.id} className={`hover:bg-gray-50 ${destacar && vencido ? "bg-red-50" : ""}`}>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fecha(g.fecha)}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{CATEGORIA_LABEL[g.categoria] ?? g.categoria}</td>
                <td className="px-4 py-3 text-gray-900 font-medium">{g.descripcion}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{g.proveedor_nombre ?? "—"}</td>
                <td className={`px-4 py-3 text-xs whitespace-nowrap ${vencido ? "text-red-600 font-medium" : "text-gray-500"}`}>
                  {g.fecha_vencimiento ? fecha(g.fecha_vencimiento) : "—"}
                  {vencido && " ⚠"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={ESTADO_BADGE[g.estado] ?? "gray"}>{ESTADO_LABEL[g.estado] ?? g.estado}</Badge>
                </td>
                <td className="px-4 py-3 text-right font-medium">{cop(g.total)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {g.estado === "borrador" && (
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => onAprobar(g.id)}>Aprobar</button>
                    )}
                    {g.estado === "aprobado" && (
                      <button className="text-xs text-green-600 hover:underline font-medium" onClick={() => onPagar(g.id)}>Marcar pagado</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
