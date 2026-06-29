import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  text: string;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Ícono "?" que muestra un tooltip al hover (desktop) y al tap (móvil).
 * Uso: <HelpTooltip text="Breve explicación en lenguaje simple." />
 */
export function HelpTooltip({ text, side = "top" }: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Cierra al hacer clic fuera (móvil)
  useEffect(() => {
    if (!visible) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [visible]);

  const posClasses: Record<string, string> = {
    top:    "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left:   "right-full top-1/2 -translate-y-1/2 mr-2",
    right:  "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible((v) => !v)}
      role="button"
      aria-label="Ayuda"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setVisible((v) => !v)}
    >
      <HelpCircle className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 cursor-help shrink-0" />

      {visible && (
        <span
          className={`pointer-events-none absolute z-50 w-64 rounded-lg border border-gray-200 bg-gray-900 px-3 py-2 text-xs text-white shadow-lg ${posClasses[side]}`}
          role="tooltip"
        >
          {text}
          {/* flecha */}
          <span
            className={`absolute ${
              side === "top"
                ? "top-full left-1/2 -translate-x-1/2 border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent"
                : side === "bottom"
                ? "bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 border-l-transparent border-r-transparent border-t-transparent"
                : side === "left"
                ? "left-full top-1/2 -translate-y-1/2 border-l-gray-900 border-t-transparent border-b-transparent border-r-transparent"
                : "right-full top-1/2 -translate-y-1/2 border-r-gray-900 border-t-transparent border-b-transparent border-l-transparent"
            } h-0 w-0 border-4`}
          />
        </span>
      )}
    </span>
  );
}
