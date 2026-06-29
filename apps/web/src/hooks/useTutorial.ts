import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api";

type Slug = "facturas" | "inventario" | "pos";

interface EstadoTutorial {
  completado: boolean;
  saltado: boolean;
}

/**
 * Muestra el tutorial automáticamente la primera vez que el usuario abre
 * una página (ni completado ni saltado anteriormente).
 */
export function useTutorial(slug: Slug) {
  const [mostrar, setMostrar] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    apiFetch<Record<Slug, EstadoTutorial>>("/api/tutoriales/estado")
      .then((estado) => {
        const t = estado[slug];
        if (!t.completado && !t.saltado) setMostrar(true);
      })
      .catch(() => {/* si falla la API, no mostramos */})
      .finally(() => setCargando(false));
  }, [slug]);

  const cerrar = useCallback(() => setMostrar(false), []);

  const relanzar = useCallback(() => {
    // Borra el progreso y vuelve a mostrar (para el botón "Ver tutorial")
    apiFetch(`/api/tutoriales/${slug}/reset`, { method: "DELETE" })
      .then(() => setMostrar(true))
      .catch(() => setMostrar(true));
  }, [slug]);

  return { mostrar, cargando, cerrar, relanzar };
}
