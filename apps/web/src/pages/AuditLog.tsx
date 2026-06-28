import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

interface AuditEntry {
  id: string;
  accion: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  detalle: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  usuario_nombre: string | null;
  usuario_email: string | null;
}

const ACCION_LABEL: Record<string, string> = {
  "factura.creada":                  "Factura creada",
  "factura.marcada_pagada":          "Factura marcada pagada",
  "nota_credito.creada":             "Nota crédito creada",
  "usuario.creado":                  "Usuario creado",
  "usuario.modificado":              "Usuario modificado",
  "resolucion_dian.registrada":      "Resolución DIAN registrada",
  "acceso_externo.vinculado":        "Acceso externo vinculado",
  "acceso_externo.desvinculado":     "Acceso externo desvinculado",
  "cliente.anonimizado":             "Cliente anonimizado (Ley 1581)",
};

const ACCION_VARIANT: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  "factura.creada":              "green",
  "factura.marcada_pagada":      "green",
  "nota_credito.creada":         "yellow",
  "usuario.creado":              "blue",
  "usuario.modificado":          "yellow",
  "resolucion_dian.registrada":  "blue",
  "acceso_externo.vinculado":    "blue",
  "acceso_externo.desvinculado": "red",
  "cliente.anonimizado":         "red",
};

const hoy = new Date().toISOString().split("T")[0];
const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [desde, setDesde] = useState(hace30);
  const [hasta, setHasta] = useState(hoy);
  const [accionFiltro, setAccionFiltro] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function cargar(p = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "50", desde, hasta });
      if (accionFiltro) params.set("accion", accionFiltro);
      const res = await apiFetch<{ data: AuditEntry[]; page: number; limit: number }>(`/api/audit-log?${params}`);
      setEntries(res.data);
      setHasMore(res.data.length === 50);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void cargar(1); }, []);

  function handleFiltrar(e: FormEvent) {
    e.preventDefault();
    void cargar(1);
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "medium" });
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-gray-400" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Registro de auditoría</h1>
          <p className="text-sm text-gray-500">Trazabilidad de acciones críticas del sistema</p>
        </div>
      </div>

      {/* Filtros */}
      <form onSubmit={handleFiltrar} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-38" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-38" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="accion">Acción</Label>
          <select
            id="accion"
            value={accionFiltro}
            onChange={(e) => setAccionFiltro(e.target.value)}
            className="block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {Object.keys(ACCION_LABEL).map((a) => (
              <option key={a} value={a}>{ACCION_LABEL[a]}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Cargando..." : "Filtrar"}
        </Button>
      </form>

      <Card>
        {loading ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">Cargando registros...</p>
        ) : entries.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">No hay registros en el período seleccionado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Fecha y hora</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Acción</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Usuario</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">IP</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <>
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(e.created_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ACCION_VARIANT[e.accion] ?? "gray"}>
                        {ACCION_LABEL[e.accion] ?? e.accion}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{e.usuario_nombre ?? "—"}</p>
                      <p className="text-xs text-gray-400">{e.usuario_email ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{e.ip ?? "—"}</td>
                    <td className="px-4 py-3">
                      {e.detalle ? (
                        <button
                          onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          className="text-xs text-action hover:underline"
                        >
                          {expanded === e.id ? "Ocultar" : "Ver detalle"}
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                  {expanded === e.id && e.detalle && (
                    <tr key={`${e.id}-detail`} className="bg-gray-50">
                      <td colSpan={5} className="px-4 pb-3">
                        <pre className="rounded bg-gray-100 p-3 text-xs text-gray-700 overflow-x-auto">
                          {JSON.stringify(e.detalle, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Paginación */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => void cargar(page - 1)}>
            ← Anterior
          </Button>
          <span className="text-sm text-gray-500">Página {page}</span>
          <Button variant="secondary" disabled={!hasMore || loading} onClick={() => void cargar(page + 1)}>
            Siguiente →
          </Button>
        </div>
      )}
    </div>
  );
}
