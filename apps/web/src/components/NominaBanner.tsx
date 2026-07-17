import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch } from "../lib/api";

interface ConfigGlobal {
  banner_activo: boolean;
  banner_mensaje: string;
}

/**
 * Banner de advertencia visible en toda la sección de Nómina mientras la deuda
 * técnica documentada (docs/NOMINA-DEUDA-TECNICA.md) siga abierta. Solo el
 * fundador puede desactivarlo (Panel Fundador → PATCH /api/fundador/nomina/config-global).
 */
export function NominaBanner() {
  const [config, setConfig] = useState<ConfigGlobal | null>(null);

  useEffect(() => {
    apiFetch<ConfigGlobal>("/api/nomina/config-global").then(setConfig).catch(() => {});
  }, []);

  if (!config?.banner_activo) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
      <p className="text-sm font-semibold text-red-800">{config.banner_mensaje}</p>
    </div>
  );
}
