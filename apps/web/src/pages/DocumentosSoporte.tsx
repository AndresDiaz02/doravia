import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch, ApiError, cop, fecha } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog } from "../components/ui/dialog";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface ItemDS {
  key: number;
  descripcion: string;
  cantidad: string;
  valor_unitario: string;
}

interface DocumentoSoporte {
  id: string;
  numero: string;
  consecutivo: number;
  nombre_vendedor: string;
  nit_vendedor: string;
  tipo_documento_vendedor: string;
  descripcion: string;
  subtotal: string;
  iva_asumido: string;
  retencion_fuente: string;
  total: string;
  fecha: string;
  anulado: boolean;
}

interface DocumentoDetalle extends DocumentoSoporte {
  items: Array<{ id: string; descripcion: string; cantidad: string; valor_unitario: string; total: string }>;
}

let nextKey = 0;
function newItem(): ItemDS {
  return { key: nextKey++, descripcion: "", cantidad: "1", valor_unitario: "" };
}

const emptyForm = {
  nombre_vendedor: "",
  nit_vendedor: "",
  tipo_documento_vendedor: "CC",
  descripcion: "",
  iva_asumido: "0",
  retencion_fuente: "0",
  fecha: new Date().toISOString().slice(0, 10),
};

export default function DocumentosSoporte() {
  const { isContador } = useAuth();
  const [documentos, setDocumentos] = useState<DocumentoSoporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNuevo, setOpenNuevo] = useState(false);
  const [openDetalle, setOpenDetalle] = useState(false);
  const [detalle, setDetalle] = useState<DocumentoDetalle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemDS[]>([newItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setItem(key: number, field: keyof ItemDS, value: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    try {
      const rows = await apiFetch<DocumentoSoporte[]>("/api/documentos-soporte");
      setDocumentos(rows);
    } finally {
      setLoading(false);
    }
  }

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/documentos-soporte", {
        method: "POST",
        body: JSON.stringify({
          nombre_vendedor: form.nombre_vendedor,
          nit_vendedor: form.nit_vendedor,
          tipo_documento_vendedor: form.tipo_documento_vendedor,
          descripcion: form.descripcion,
          iva_asumido: Number(form.iva_asumido),
          retencion_fuente: Number(form.retencion_fuente),
          fecha: form.fecha,
          items: items.map((i) => ({
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad),
            valor_unitario: Number(i.valor_unitario),
          })),
        }),
      });
      setOpenNuevo(false);
      setForm(emptyForm);
      setItems([newItem()]);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function verDetalle(doc: DocumentoSoporte) {
    const d = await apiFetch<DocumentoDetalle>(`/api/documentos-soporte/${doc.id}`);
    setDetalle(d);
    setOpenDetalle(true);
  }

  async function anular(id: string) {
    if (!confirm("¿Confirmas que deseas anular este documento soporte?")) return;
    try {
      await apiFetch(`/api/documentos-soporte/${id}`, { method: "DELETE" });
      await cargar();
      setOpenDetalle(false);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Error al anular.");
    }
  }

  const subtotalItems = items.reduce((s, i) => {
    const cant = Number(i.cantidad) || 0;
    const val = Number(i.valor_unitario) || 0;
    return s + cant * val;
  }, 0);
  const totalForm = subtotalItems + Number(form.iva_asumido || 0) - Number(form.retencion_fuente || 0);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Documentos soporte</h1>
          <p className="text-sm text-gray-500 mt-0.5">Adquisiciones a vendedores no obligados a facturar (Art. 771-5 E.T.)</p>
        </div>
        {!isContador && (
          <Button onClick={() => { setForm(emptyForm); setItems([newItem()]); setError(null); setOpenNuevo(true); }}>
            <Plus className="h-4 w-4" />
            Nuevo documento
          </Button>
        )}
      </div>

      <Card>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</p>
        ) : documentos.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">No hay documentos soporte registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Número</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Vendedor</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Descripción</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Fecha</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500">Total</th>
                <th className="px-6 py-3 text-center font-medium text-gray-500">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documentos.map((d) => (
                <tr key={d.id} className={`hover:bg-gray-50 ${d.anulado ? "opacity-50" : ""}`}>
                  <td className="px-6 py-3 font-mono text-xs text-gray-600">{d.numero}</td>
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{d.nombre_vendedor}</p>
                    <p className="text-xs text-gray-400">{d.tipo_documento_vendedor}: {d.nit_vendedor}</p>
                  </td>
                  <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{d.descripcion}</td>
                  <td className="px-6 py-3 text-gray-600">{fecha(d.fecha)}</td>
                  <td className="px-6 py-3 text-right font-medium">{cop(d.total)}</td>
                  <td className="px-6 py-3 text-center">
                    <Badge variant={d.anulado ? "red" : "green"}>
                      {d.anulado ? "Anulado" : "Vigente"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => void verDetalle(d)} className="text-xs text-green-600 hover:underline">
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Dialog: Nuevo documento soporte */}
      <Dialog open={openNuevo} onClose={() => setOpenNuevo(false)} title="Nuevo documento soporte">
        <form onSubmit={(e) => void handleCrear(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre del vendedor *</Label>
              <Input required value={form.nombre_vendedor} onChange={(e) => set("nombre_vendedor", e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="space-y-1.5">
              <Label>NIT / Cédula *</Label>
              <Input required value={form.nit_vendedor} onChange={(e) => set("nit_vendedor", e.target.value)} placeholder="123456789" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo documento</Label>
              <select value={form.tipo_documento_vendedor} onChange={(e) => set("tipo_documento_vendedor", e.target.value)} className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                <option value="CC">Cédula de ciudadanía</option>
                <option value="NIT">NIT</option>
                <option value="CE">Cédula extranjería</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <Input required type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción del gasto *</Label>
            <Input required value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Ej. Arriendo local comercial enero 2025" />
          </div>

          {/* Ítems */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Ítems *</Label>
              <button type="button" onClick={() => setItems((p) => [...p, newItem()])} className="text-xs text-green-600 hover:underline">+ Agregar ítem</button>
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.key} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <Input placeholder="Descripción" value={it.descripcion} onChange={(e) => setItem(it.key, "descripcion", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min="0.01" step="any" placeholder="Cant." value={it.cantidad} onChange={(e) => setItem(it.key, "cantidad", e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    <Input type="number" min="0" step="any" placeholder="Valor unit." value={it.valor_unitario} onChange={(e) => setItem(it.key, "valor_unitario", e.target.value)} />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems((p) => p.filter((i) => i.key !== it.key))}>
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>IVA asumido ($)</Label>
              <Input type="number" min="0" step="any" value={form.iva_asumido} onChange={(e) => set("iva_asumido", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Retención en fuente ($)</Label>
              <Input type="number" min="0" step="any" value={form.retencion_fuente} onChange={(e) => set("retencion_fuente", e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{cop(subtotalItems)}</span></div>
            {Number(form.iva_asumido) > 0 && <div className="flex justify-between text-gray-600"><span>+ IVA asumido</span><span>{cop(form.iva_asumido)}</span></div>}
            {Number(form.retencion_fuente) > 0 && <div className="flex justify-between text-gray-600"><span>- Retención fuente</span><span>{cop(form.retencion_fuente)}</span></div>}
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1"><span>Total</span><span>{cop(totalForm)}</span></div>
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpenNuevo(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </Dialog>

      {/* Dialog: Detalle */}
      <Dialog open={openDetalle} onClose={() => setOpenDetalle(false)} title={`Documento ${detalle?.numero ?? ""}`}>
        {detalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Vendedor:</span> <span className="font-medium">{detalle.nombre_vendedor}</span></div>
              <div><span className="text-gray-500">{detalle.tipo_documento_vendedor}:</span> <span className="font-medium">{detalle.nit_vendedor}</span></div>
              <div><span className="text-gray-500">Fecha:</span> <span className="font-medium">{fecha(detalle.fecha)}</span></div>
              <div><span className="text-gray-500">Estado:</span> <Badge variant={detalle.anulado ? "red" : "green"}>{detalle.anulado ? "Anulado" : "Vigente"}</Badge></div>
            </div>
            <p className="text-sm text-gray-700">{detalle.descripcion}</p>

            {detalle.items.length > 0 && (
              <table className="w-full text-xs border-t border-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500">Descripción</th>
                    <th className="px-3 py-2 text-right text-gray-500">Cant.</th>
                    <th className="px-3 py-2 text-right text-gray-500">Valor unit.</th>
                    <th className="px-3 py-2 text-right text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detalle.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2">{i.descripcion}</td>
                      <td className="px-3 py-2 text-right">{i.cantidad}</td>
                      <td className="px-3 py-2 text-right">{cop(i.valor_unitario)}</td>
                      <td className="px-3 py-2 text-right font-medium">{cop(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{cop(detalle.subtotal)}</span></div>
              {Number(detalle.iva_asumido) > 0 && <div className="flex justify-between text-gray-600"><span>+ IVA asumido</span><span>{cop(detalle.iva_asumido)}</span></div>}
              {Number(detalle.retencion_fuente) > 0 && <div className="flex justify-between text-gray-600"><span>- Retención fuente</span><span>{cop(detalle.retencion_fuente)}</span></div>}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1"><span>Total</span><span>{cop(detalle.total)}</span></div>
            </div>

            <div className="flex justify-between items-center pt-2">
              {!detalle.anulado && (
                <Button variant="secondary" onClick={() => void anular(detalle.id)} className="text-red-600 border-red-200 hover:bg-red-50">
                  Anular documento
                </Button>
              )}
              <Button variant="secondary" onClick={() => setOpenDetalle(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
