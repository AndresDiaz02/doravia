import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

/**
 * Evita que un error de una pantalla secundaria convierta el POS completo en
 * una página en blanco. El detalle técnico queda en consola para soporte y al
 * cajero se le ofrece una recuperación segura y comprensible.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[POS UI] Error no controlado", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-violet-50 to-slate-100 p-5 dark:from-[#080b16] dark:via-[#0d1024] dark:to-[#080b16]">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-[#11172a]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">No pudimos abrir esta pantalla</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Tus ventas confirmadas no se pierden. Actualiza el POS para continuar trabajando.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-indigo-500"
          >
            <RefreshCw className="h-4 w-4" /> Actualizar POS
          </button>
        </section>
      </main>
    );
  }
}
