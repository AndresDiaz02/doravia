import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users, UserX } from "lucide-react";
import { apiFetch, ApiError, cop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { HelpTooltip } from "../components/HelpTooltip";
import { NominaBanner } from "../components/NominaBanner";

interface Empleado {
  id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  salario_base: string;
  tipo_contrato: string;
  estado: "activo" | "inactivo" | "retirado";
}

const TIPO_CONTRATO_LABEL: Record<string, string> = {
  indefinido: "Indefinido",
  termino_fijo: "Término fijo",
  obra_labor: "Obra o labor",
  prestacion_servicios: "Prestación de servicios",
};

export default function NominaEmpleados() {
  const { isContador } = useAuth();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nominaActiva, setNominaActiva] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>("activo");

  async function cargar() {
    try {
      const rows = await apiFetch<Empleado[]>(`/api/nomina/empleados?estado=${filtroEstado}`);
      setEmpleados(rows);
      setNominaActiva(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setNominaActiva(false);
      } else {
        setError("No se pudo cargar la lista de empleados.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setLoading(true); cargar(); }, [filtroEstado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="p-8 text-gray-500">Cargando empleados…</p>;

  if (!nominaActiva) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <NominaBanner />
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Users className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">Tu empresa no tiene nómina electrónica activa.</p>
            <p className="text-sm text-gray-400">Contacta a soporte para contratar un plan de nómina.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <NominaBanner />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-action">Nomina electronica</p>
          <h1 className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Empleados
            <HelpTooltip text="Aquí gestionas la información de cada empleado: salario, tipo de contrato y datos bancarios. Cada empleado activo consume 1 documento del pool de nómina cuando se le emite una nómina." side="right" />
          </h1>
          <p className="text-sm text-gray-500 mt-1">Empleados de tu empresa para efectos de nómina electrónica</p>
        </div>
        {!isContador && (
          <Link to="/nomina/empleados/nuevo">
            <Button><Plus className="w-4 h-4 mr-1" /> Nuevo empleado</Button>
          </Link>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(["activo", "retirado", "inactivo"] as const).map((estado) => (
          <button
            key={estado}
            onClick={() => setFiltroEstado(estado)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filtroEstado === estado ? "bg-action text-white shadow-sm shadow-action/20" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {estado === "activo" ? "Activos" : estado === "retirado" ? "Retirados" : "Inactivos"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {empleados.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <UserX className="w-12 h-12 text-gray-300" />
            <p className="text-gray-500">No hay empleados {filtroEstado === "activo" ? "activos" : filtroEstado + "s"}.</p>
            {!isContador && filtroEstado === "activo" && (
              <Link to="/nomina/empleados/nuevo">
                <Button><Plus className="w-4 h-4 mr-1" /> Registrar empleado</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-[0.12em] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Cédula</th>
                  <th className="px-4 py-3">Cargo</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3 text-right">Salario base</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-slate-800/70">
                    <td className="px-4 py-3">
                      <Link to={`/nomina/empleados/${e.id}`} className="font-medium text-gray-900 hover:text-action hover:underline dark:text-gray-100">
                        {e.nombres} {e.apellidos}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.cedula}</td>
                    <td className="px-4 py-3 text-gray-600">{e.cargo ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{TIPO_CONTRATO_LABEL[e.tipo_contrato] ?? e.tipo_contrato}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{cop(e.salario_base)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={e.estado === "activo" ? "green" : e.estado === "retirado" ? "gray" : "yellow"}>
                        {e.estado === "activo" ? "Activo" : e.estado === "retirado" ? "Retirado" : "Inactivo"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
