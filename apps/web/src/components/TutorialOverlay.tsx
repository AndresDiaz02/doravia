import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, CheckCircle } from "lucide-react";
import { apiFetch } from "../lib/api";
import { Button } from "./ui/button";

export interface TutorialStep {
  titulo: string;
  descripcion: string;
  /** CSS selector del elemento a resaltar (opcional) */
  selector?: string;
}

interface Props {
  slug: "facturas" | "inventario" | "pos";
  pasos: TutorialStep[];
  /** Título del módulo, ej: "Crea tu primera factura" */
  titulo: string;
  onFin: () => void;
}

export function TutorialOverlay({ slug, pasos, titulo, onFin }: Props) {
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);

  // Resalta el elemento del paso actual
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
    setGuardando(true);
    try {
      await apiFetch(`/api/tutoriales/${slug}/saltar`, { method: "POST" });
    } finally {
      setGuardando(false);
      onFin();
    }
  }, [slug, onFin]);

  const completar = useCallback(async () => {
    setGuardando(true);
    try {
      await apiFetch(`/api/tutoriales/${slug}/completar`, { method: "POST" });
    } finally {
      setGuardando(false);
      onFin();
    }
  }, [slug, onFin]);

  const esFinal = paso === pasos.length - 1;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Overlay oscuro */}
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={() => void saltar()} />

      {/* Card flotante */}
      <div className="pointer-events-auto absolute bottom-8 right-8 w-80 rounded-2xl bg-white shadow-2xl border border-gray-100">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Tutorial</p>
            <p className="font-semibold text-gray-900 mt-0.5">{titulo}</p>
          </div>
          <button
            onClick={() => void saltar()}
            disabled={guardando}
            className="text-gray-400 hover:text-gray-600 mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Paso actual */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800">{pasos[paso].titulo}</p>
          <p className="text-sm text-gray-600 leading-relaxed">{pasos[paso].descripcion}</p>
        </div>

        {/* Progreso */}
        <div className="px-5 pb-2">
          <div className="flex gap-1">
            {pasos.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= paso ? "bg-indigo-500" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-right text-xs text-gray-400">
            {paso + 1} / {pasos.length}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between px-5 py-4 border-t">
          <button
            onClick={() => void saltar()}
            disabled={guardando}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Saltar tutorial
          </button>
          <div className="flex gap-2">
            {paso > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPaso((p) => p - 1)}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
            )}
            {esFinal ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void completar()}
                disabled={guardando}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Listo
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setPaso((p) => p + 1)}
              >
                Siguiente
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
