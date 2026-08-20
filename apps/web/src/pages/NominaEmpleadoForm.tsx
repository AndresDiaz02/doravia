import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Save, UserMinus } from "lucide-react";
import { apiFetch, cop, fecha } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { HelpTooltip } from "../components/HelpTooltip";
import { NominaBanner } from "../components/NominaBanner";

interface EmpleadoDetalle {
  id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  fecha_ingreso: string;
  salario_base: string;
  tipo_contrato: string;
  estado: "activo" | "inactivo" | "retirado";
  fecha_retiro: string | null;
  municipio_dian_id: number | null;
  direccion: string | null;
  tipo_trabajador_plemsi_id: number | null;
  subtipo_trabajador_plemsi_id: number | null;
  tipo_contrato_plemsi_id: number | null;
  salario_integral: boolean;
  pension_alto_riesgo: boolean;
  datos_bancarios: { banco?: string; cuenta?: string } | null;
}

interface Contrato {
  id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  tipo: string;
  salario: string;
  observaciones: string | null;
}

const TIPOS_CONTRATO = [
  { value: "indefinido", label: "Indefinido" },
  { value: "termino_fijo", label: "Término fijo" },
  { value: "obra_labor", label: "Obra o labor" },
  { value: "prestacion_servicios", label: "Prestación de servicios" },
];

const emptyForm = {
  cedula: "", nombres: "", apellidos: "", cargo: "", fecha_ingreso: "",
  salario_base: "", tipo_contrato: "indefinido", banco: "", cuenta: "",
  municipio_dian_id: "", direccion: "", tipo_trabajador_plemsi_id: "", subtipo_trabajador_plemsi_id: "", tipo_contrato_plemsi_id: "", salario_integral: false, pension_alto_riesgo: false,
};

export default function NominaEmpleadoForm() {
  const { id } = useParams();
  const esNuevo = !id;
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [estado, setEstado] = useState<string>("activo");
  const [loading, setLoading] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (esNuevo) return;
    (async () => {
      try {
        const [emp, hist] = await Promise.all([
          apiFetch<EmpleadoDetalle>(`/api/nomina/empleados/${id}`),
          apiFetch<Contrato[]>(`/api/nomina/empleados/${id}/contratos`),
        ]);
        setForm({
          cedula: emp.cedula, nombres: emp.nombres, apellidos: emp.apellidos,
          cargo: emp.cargo ?? "", fecha_ingreso: emp.fecha_ingreso,
          salario_base: emp.salario_base, tipo_contrato: emp.tipo_contrato,
          banco: emp.datos_bancarios?.banco ?? "", cuenta: emp.datos_bancarios?.cuenta ?? "",
          municipio_dian_id: String(emp.municipio_dian_id ?? ""), direccion: emp.direccion ?? "",
          tipo_trabajador_plemsi_id: String(emp.tipo_trabajador_plemsi_id ?? ""), subtipo_trabajador_plemsi_id: String(emp.subtipo_trabajador_plemsi_id ?? ""),
          tipo_contrato_plemsi_id: String(emp.tipo_contrato_plemsi_id ?? ""), salario_integral: emp.salario_integral, pension_alto_riesgo: emp.pension_alto_riesgo,
        });
        setEstado(emp.estado);
        setContratos(hist);
      } catch {
        setError("No se pudo cargar el empleado.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, esNuevo]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const datos_bancarios = form.banco || form.cuenta ? { banco: form.banco, cuenta: form.cuenta } : undefined;
      if (esNuevo) {
        const nuevo = await apiFetch<{ id: string }>("/api/nomina/empleados", {
          method: "POST",
          body: JSON.stringify({
            cedula: form.cedula, nombres: form.nombres, apellidos: form.apellidos,
            cargo: form.cargo || undefined, fecha_ingreso: form.fecha_ingreso,
            salario_base: Number(form.salario_base), tipo_contrato: form.tipo_contrato,
            datos_bancarios,
            municipio_dian_id: form.municipio_dian_id ? Number(form.municipio_dian_id) : undefined, direccion: form.direccion || undefined,
            tipo_trabajador_plemsi_id: form.tipo_trabajador_plemsi_id ? Number(form.tipo_trabajador_plemsi_id) : undefined,
            subtipo_trabajador_plemsi_id: form.subtipo_trabajador_plemsi_id ? Number(form.subtipo_trabajador_plemsi_id) : undefined,
            tipo_contrato_plemsi_id: form.tipo_contrato_plemsi_id ? Number(form.tipo_contrato_plemsi_id) : undefined,
            salario_integral: form.salario_integral, pension_alto_riesgo: form.pension_alto_riesgo,
          }),
        });
        navigate(`/nomina/empleados/${nuevo.id}`);
      } else {
        await apiFetch(`/api/nomina/empleados/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombres: form.nombres, apellidos: form.apellidos, cargo: form.cargo || null, datos_bancarios,
            municipio_dian_id: form.municipio_dian_id ? Number(form.municipio_dian_id) : null, direccion: form.direccion || null,
            tipo_trabajador_plemsi_id: form.tipo_trabajador_plemsi_id ? Number(form.tipo_trabajador_plemsi_id) : null,
            subtipo_trabajador_plemsi_id: form.subtipo_trabajador_plemsi_id ? Number(form.subtipo_trabajador_plemsi_id) : null,
            tipo_contrato_plemsi_id: form.tipo_contrato_plemsi_id ? Number(form.tipo_contrato_plemsi_id) : null,
            salario_integral: form.salario_integral, pension_alto_riesgo: form.pension_alto_riesgo }),
        });
        navigate("/nomina/empleados");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function retirar() {
    if (!id) return;
    if (!confirm("¿Marcar este empleado como retirado? No podrás calcular nómina futura para él.")) return;
    setRetirando(true);
    try {
      await apiFetch(`/api/nomina/empleados/${id}/retirar`, {
        method: "PATCH",
        body: JSON.stringify({ fecha_retiro: new Date().toISOString().slice(0, 10) }),
      });
      navigate("/nomina/empleados");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al retirar el empleado.");
    } finally {
      setRetirando(false);
    }
  }

  if (loading) return <p className="p-8 text-gray-500">Cargando…</p>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <NominaBanner />
      <Link to="/nomina/empleados" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver a empleados
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        {esNuevo ? "Nuevo empleado" : `${form.nombres} ${form.apellidos}`}
      </h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <form onSubmit={(e) => void guardar(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cedula">Cédula *</Label>
                <Input id="cedula" value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} disabled={!esNuevo} required />
              </div>
              <div>
                <Label htmlFor="cargo">Cargo</Label>
                <Input id="cargo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ej: Vendedor" />
              </div>
              <div>
                <Label htmlFor="nombres">Nombres *</Label>
                <Input id="nombres" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="apellidos">Apellidos *</Label>
                <Input id="apellidos" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="fecha_ingreso">Fecha de ingreso *</Label>
                <Input id="fecha_ingreso" type="date" value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} disabled={!esNuevo} required />
              </div>
              <div>
                <Label htmlFor="tipo_contrato" className="flex items-center gap-1">
                  Tipo de contrato *
                </Label>
                <select
                  id="tipo_contrato"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-action focus:outline-none focus:ring-1 focus:ring-action disabled:bg-gray-50"
                  value={form.tipo_contrato}
                  onChange={(e) => setForm({ ...form, tipo_contrato: e.target.value })}
                  disabled={!esNuevo}
                >
                  {TIPOS_CONTRATO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {!esNuevo && <p className="text-xs text-gray-400 mt-1">Para cambiar el contrato o el salario, registra un nuevo contrato abajo.</p>}
              </div>
              <div className="col-span-2">
                <Label htmlFor="salario_base" className="flex items-center gap-1">
                  Salario base *
                  <HelpTooltip text="Salario mensual antes de deducciones. Si el empleado gana hasta 2 salarios mínimos, recibirá auxilio de transporte automáticamente al calcular su nómina." side="right" />
                </Label>
                <Input id="salario_base" type="number" value={form.salario_base} onChange={(e) => setForm({ ...form, salario_base: e.target.value })} disabled={!esNuevo} required />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Datos para nómina electrónica</p>
                <p className="text-xs text-gray-500">Se solicitan al emitir ante Plemsi; completa los IDs según sus catálogos oficiales.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="direccion">Dirección</Label><Input id="direccion" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
                <div><Label htmlFor="municipio">ID municipio DIAN</Label><Input id="municipio" type="number" value={form.municipio_dian_id} onChange={(e) => setForm({ ...form, municipio_dian_id: e.target.value })} /></div>
                <div><Label htmlFor="tipo-trabajador">ID tipo trabajador</Label><Input id="tipo-trabajador" type="number" value={form.tipo_trabajador_plemsi_id} onChange={(e) => setForm({ ...form, tipo_trabajador_plemsi_id: e.target.value })} /></div>
                <div><Label htmlFor="subtipo-trabajador">ID subtipo trabajador</Label><Input id="subtipo-trabajador" type="number" value={form.subtipo_trabajador_plemsi_id} onChange={(e) => setForm({ ...form, subtipo_trabajador_plemsi_id: e.target.value })} /></div>
                <div><Label htmlFor="tipo-contrato-plemsi">ID contrato Plemsi</Label><Input id="tipo-contrato-plemsi" type="number" value={form.tipo_contrato_plemsi_id} onChange={(e) => setForm({ ...form, tipo_contrato_plemsi_id: e.target.value })} /></div>
              </div>
              <div className="flex gap-5 text-sm text-gray-700">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.salario_integral} onChange={(e) => setForm({ ...form, salario_integral: e.target.checked })} /> Salario integral</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.pension_alto_riesgo} onChange={(e) => setForm({ ...form, pension_alto_riesgo: e.target.checked })} /> Pensión alto riesgo</label>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                Datos bancarios
                <HelpTooltip text="Se guardan cifrados. Solo el administrador puede verlos." side="right" />
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="banco">Banco</Label>
                  <Input id="banco" value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} placeholder="Ej: Bancolombia" />
                </div>
                <div>
                  <Label htmlFor="cuenta">Número de cuenta</Label>
                  <Input id="cuenta" value={form.cuenta} onChange={(e) => setForm({ ...form, cuenta: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" disabled={guardando}>
                <Save className="w-4 h-4 mr-1" /> {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!esNuevo && (
        <>
          <Card className="mt-4">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-700 mb-3">Historial de contratos</p>
              <div className="space-y-2">
                {contratos.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2">
                    <span className="text-gray-600">
                      {fecha(c.fecha_inicio)} — {c.fecha_fin ? fecha(c.fecha_fin) : "vigente"}
                    </span>
                    <span className="text-gray-900 font-medium">{cop(c.salario)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {estado === "activo" && (
            <div className="mt-4 flex justify-end">
              <Button variant="danger" onClick={() => void retirar()} disabled={retirando}>
                <UserMinus className="w-4 h-4 mr-1" /> {retirando ? "Procesando…" : "Marcar como retirado"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
