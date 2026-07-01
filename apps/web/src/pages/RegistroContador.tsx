import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function RegistroContador() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // Modo confirmación
  if (token) return <ConfirmarCuenta token={token} />;

  return <FormularioRegistro />;
}

function FormularioRegistro() {
  const [form, setForm] = useState({ nombre: "", email: "", password: "", celular: "", firma_contable: "" });
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/contadores/registro", { method: "POST", body: JSON.stringify(form) });
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  if (ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">¡Revisa tu correo!</h2>
          <p className="text-sm text-gray-500">
            Te enviamos un enlace de confirmación a <strong>{form.email}</strong>.
            Haz clic en él para activar tu cuenta de contador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Doravia</h1>
          <p className="mt-1 text-sm text-gray-500">Registro para contadores</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-gray-600 mb-6">
            Regístrate una sola vez. Las empresas que asesoras te invitarán por correo y podrás gestionarlas desde un solo lugar.
          </p>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input id="nombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="celular">Celular</Label>
              <Input id="celular" value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} placeholder="Ej. 3001234567" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="firma">Firma contable (opcional)</Label>
              <Input id="firma" value={form.firma_contable} onChange={(e) => setForm({ ...form, firma_contable: e.target.value })} placeholder="Nombre de tu firma" />
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear cuenta"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta? <Link to="/login" className="text-green-600 hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}

function ConfirmarCuenta({ token }: { token: string }) {
  const { login } = useAuth();
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [error, setError] = useState("");

  useState(() => {
    apiFetch<{ accessToken: string; refreshToken: string; nombre: string }>(`/api/contadores/confirmar?token=${encodeURIComponent(token)}`)
      .then(async (data) => {
        await login(data.accessToken, data.refreshToken);
        setEstado("ok");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error al confirmar.");
        setEstado("error");
      });
  });

  if (estado === "cargando") return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  );

  if (estado === "error") return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <p className="text-red-600 font-medium mb-4">{error}</p>
        <Link to="/registro-contador" className="text-sm text-green-600 hover:underline">Volver al registro</Link>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">¡Cuenta activada!</h2>
        <p className="text-sm text-gray-500 mb-6">Ya puedes acceder a tu panel de contador.</p>
        <Link to="/contador">
          <Button>Ir a mi panel →</Button>
        </Link>
      </div>
    </div>
  );
}
