import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { NominaBanner } from "../components/NominaBanner";

const hoy = new Date();

export default function NominaPeriodoNuevo() {
  const navigate = useNavigate();
  const [ano, setAno] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [quincena, setQuincena] = useState<string>("mensual");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const nuevo = await apiFetch<{ id: string }>("/api/nomina/periodos", {
        method: "POST",
        body: JSON.stringify({ ano, mes, quincena: quincena === "mensual" ? null : Number(quincena) }),
      });
      navigate(`/nomina/periodos/${nuevo.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el período.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <NominaBanner />
      <Link to="/nomina/periodos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver a períodos
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nuevo período de nómina</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <CardContent className="p-5">
          <form onSubmit={(e) => void crear(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ano">Año *</Label>
                <Input id="ano" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} required />
              </div>
              <div>
                <Label htmlFor="mes">Mes *</Label>
                <select
                  id="mes"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
                  value={mes}
                  onChange={(e) => setMes(Number(e.target.value))}
                >
                  {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="ciclo">Ciclo *</Label>
              <select
                id="ciclo"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
                value={quincena}
                onChange={(e) => setQuincena(e.target.value)}
              >
                <option value="mensual">Mensual</option>
                <option value="1">Primera quincena</option>
                <option value="2">Segunda quincena</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" disabled={guardando}>{guardando ? "Creando…" : "Crear período"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
