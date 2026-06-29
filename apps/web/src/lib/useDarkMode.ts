import { useEffect, useState } from "react";

const KEY = "doravia_dark";

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) return stored === "1";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem(KEY, isDark ? "1" : "0");
  }, [isDark]);

  return { isDark, toggleDark: () => setIsDark((v) => !v) };
}
