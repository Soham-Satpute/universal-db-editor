import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "udbe-theme";

/**
 * Reads the persisted theme choice. Falls back to "dark" — the app's
 * default identity — rather than the OS preference, since this is a
 * developer tool people tend to want dark regardless of system setting.
 * The actual class is already applied pre-paint by the inline script in
 * index.html (avoids a flash of the wrong theme on load); this hook just
 * syncs React state with that and exposes a toggle.
 */
function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
