import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, CheckCircle } from "lucide-react";
import { apiFetch } from "../lib/api";

export interface TutorialStep {
  titulo: string;
  descripcion: string;
  selector?: string;
}

interface Props {
  slug: string;
  pasos: TutorialStep[];
  titulo: string;
  onFin: () => void;
}

export function TutorialOverlay({ slug, pasos, titulo, onFin }: Props) {
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    const sel = pasos[paso]?.selector;
    if (!sel) return;
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "3px solid #4F46E0";
    el.style.outlineOffset = "3px";
    el.style.borderRadius = "6px";
    return () => {
      el.style.outline = "";
      el.style.outlineOffset = "";
      el.style.borderRadius = "";
    };
  }, [paso, pasos]);

  const saltar = useCallback(async () => {
    try { await apiFetch(`/api/tutoriales/${slug}/saltar`, { method: "POST" }); } catch { /* ok */ }
    onFin();
  }, [slug, onFin]);

  const completar = useCallback(async () => {
    try { await apiFetch(`/api/tutoriales/${slug}/completar`, { method: "POST" }); } catch { /* ok */ }
    onFin();
  }, [slug, onFin]);

  const esFinal = paso === pasos.length - 1;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={() => void saltar()} />
      <div className="pointer-events-auto absolute bottom-4 right-4 w-72 rounded-2xl bg-white shadow-2xl border border-gray-100">
        <div className="flex items-start justify-between px-4 py-3 border-b">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Tutorial</p>
            <p className="font-semibold text-gray-900 text-sm mt-0.5">{titulo}</p>
          </div>
          <button onClick={() => void saltar()} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-sm font-semibold text-gray-800">{pasos[paso].titulo}</p>
          <p className="text-xs text-gray-600 leading-relaxed">{pasos[paso].descripcion}</p>
        </div>
        <div className="px-4 pb-2">
          <div className="flex gap-1">
            {pasos.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= paso ? "bg-indigo-500" : "bg-gray-200"}`} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <button onClick={() => void saltar()} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Saltar
          </button>
          <div className="flex gap-2">
            {paso > 0 && (
              <button onClick={() => setPaso((p) => p - 1)} className="rounded-lg border px-2 py-1">
                <ChevronLeft className="h-3 w-3" />
              </button>
            )}
            {esFinal ? (
              <button
                onClick={() => void completar()}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              >
                <CheckCircle className="h-3 w-3" /> Listo
              </button>
            ) : (
              <button
                onClick={() => setPaso((p) => p + 1)}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Siguiente <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
