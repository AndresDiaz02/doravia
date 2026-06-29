import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  text: string;
  side?: "top" | "bottom" | "left" | "right";
}

export function HelpTooltip({ text, side = "top" }: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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
          className={`pointer-events-none absolute z-50 w-56 rounded-lg border border-gray-200 bg-gray-900 px-3 py-2 text-xs text-white shadow-lg ${posClasses[side]}`}
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
