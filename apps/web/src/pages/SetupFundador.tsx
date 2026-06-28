import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";

export default function SetupFundador() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ pin: "", nombre: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/register-fundador", {
        method: "POST",
        body: JSON.stringify({
          pin: form.pin,
          nombre: form.nombre,
          email: form.email,
          password: form.password,
        }),
      });
      navigate("/login?msg=cuenta-creada");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-700 border border-white/10 flex items-center justify-center mb-4">
            <Zap className="h-8 w-8 text-amber-400" />
          </div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1">Doravia</p>
          <h1 className="text-xl font-bold text-white">Crear cuenta fundador</h1>
          <p className="text-sm text-white/40 mt-1">Solo para acceso interno</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1">PIN de fundadores</label>
            <input
              type="password"
              value={form.pin}
              onChange={(e) => set("pin", e.target.value)}
              placeholder="PIN configurado en Railway"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1">Tu nombre</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Ej: Andrés Fundador"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="andres@doravia.com"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1">Contraseña</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => set("confirm", e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/60"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 py-3.5 text-base font-bold text-slate-900 transition-colors mt-2"
          >
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>

        <p className="text-center text-xs text-white/20 mt-6">
          Esta página solo es accesible para el equipo fundador de Doravia.
        </p>
      </div>
    </div>
  );
}
