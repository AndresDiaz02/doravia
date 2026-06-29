import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "./api";

const KEY = "doravia_dark";

export function useDarkMode(serverValue?: boolean) {
  const synced = useRef(false);

  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) return stored === "1";
    return false; // modo claro por defecto
  });

  // Cuando el usuario carga del servidor, sincroniza su preferencia (solo una vez)
  useEffect(() => {
    if (serverValue !== undefined && !synced.current) {
      synced.current = true;
      setIsDark(serverValue);
      localStorage.setItem(KEY, serverValue ? "1" : "0");
    }
  }, [serverValue]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem(KEY, isDark ? "1" : "0");
  }, [isDark]);

  const toggleDark = useCallback(() => {
    setIsDark((v) => {
      const next = !v;
      apiFetch("/api/auth/preferencias", {
        method: "PATCH",
        body: JSON.stringify({ dark_mode: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  return { isDark, toggleDark };
}
