import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Outlet, useLocation, Navigate } from "react-router-dom";
import { BarChart2, Megaphone, Zap, Lock } from "lucide-react";
import { cn } from "../lib/cn";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";

const SESSION_KEY = "fundador_pin_ok";

export default function FundadorLayout() {
  const { isFundador, isLoading } = useAuth();
  const location = useLocation();

  const [estado, setEstado] = useState<"cargando" | "pin" | "ok">("cargando");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [verificando, setVerificando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoading || !isFundador) return;

    // Ya verificado en esta sesión
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setEstado("ok");
      return;
    }

    // Intenta con pin vacío — si FUNDADOR_PIN no está configurado, pasa directo
    apiFetch<{ ok: boolean }>("/api/auth/verify-fundador-pin", {
      method: "POST",
      body: JSON.stringify({ pin: "" }),
    })
      .then(() => {
        sessionStorage.setItem(SESSION_KEY, "1");
        setEstado("ok");
      })
      .catch(() => {
        // PIN requerido → mostrar modal
        setEstado("pin");
        setTimeout(() => inputRef.current?.focus(), 100);
      });
  }, [isLoading, isFundador]);

  async function handlePin(e: FormEvent) {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setVerificando(true);
    setPinError("");
    try {
      await apiFetch("/api/auth/verify-fundador-pin", {
        method: "POST",
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      sessionStorage.setItem(SESSION_KEY, "1");
      setEstado("ok");
    } catch {
      setPinError("PIN incorrecto. Intenta de nuevo.");
      setPinInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setVerificando(false);
    }
  }

  if (isLoading || estado === "cargando") {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isFundador) return <Navigate to="/dashboard" replace />;

  // ── Pantalla de PIN ────────────────────────────────────────────────────────
  if (estado === "pin") {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-sm">
          {/* Icono */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-700 border border-white/10 flex items-center justify-center mb-4">
              <Zap className="h-8 w-8 text-amber-400" />
            </div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1">Doravia</p>
            <h1 className="text-xl font-bold text-white">Panel Fundadores</h1>
            <p className="text-sm text-white/40 mt-1 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Ingresa el PIN de acceso
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={(e) => void handlePin(e)} className="space-y-4">
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(""); }}
              placeholder="• • • • • •"
              maxLength={20}
              autoComplete="off"
              className={cn(
                "w-full bg-slate-900 border rounded-xl px-4 py-4 text-2xl font-bold text-center text-white tracking-[0.5em] placeholder-white/20",
                "focus:outline-none focus:ring-2 transition-all",
                pinError
                  ? "border-red-500/60 focus:ring-red-500/40"
                  : "border-white/10 focus:ring-amber-500/40 focus:border-amber-500/60",
              )}
            />

            {pinError && (
              <p className="text-center text-sm text-red-400">{pinError}</p>
            )}

            <button
              type="submit"
              disabled={verificando || !pinInput.trim()}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 py-3.5 text-base font-bold text-slate-900 transition-colors"
            >
              {verificando ? "Verificando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Panel normal ───────────────────────────────────────────────────────────
  const isAdmin     = location.pathname.startsWith("/fundador/admin");
  const isMarketing = location.pathname.startsWith("/fundador/marketing");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      <header className="bg-gradient-to-r from-slate-900 to-slate-700 text-white px-8 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
            <Zap className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-widest">Doravia</p>
            <p className="text-base font-bold text-white">Panel Fundadores</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
          <Link
            to="/fundador/admin"
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
              isAdmin
                ? "bg-white text-slate-900 shadow"
                : "text-white/70 hover:text-white hover:bg-white/10",
            )}
          >
            <BarChart2 className="h-4 w-4" />
            CEO Admin
          </Link>
          <Link
            to="/fundador/marketing"
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
              isMarketing
                ? "bg-white text-slate-900 shadow"
                : "text-white/70 hover:text-white hover:bg-white/10",
            )}
          >
            <Megaphone className="h-4 w-4" />
            CEO Marketing
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <p className="text-xs text-white/40 hidden lg:block">Acceso restringido — solo fundadores</p>
          <button
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); setEstado("pin"); setPinInput(""); }}
            className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors"
            title="Bloquear panel"
          >
            <Lock className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
