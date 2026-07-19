// FILE: src/lib/theme.tsx
// Three modes: "light" (the default white/cream look), "dark", and "pink" —
// a bonus fourth-ish option alongside the standard two, applied the same
// way (a class on <html>) so it gets every existing --color-* token for
// free just by defining .pink in styles.css.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "pink";

const STORAGE_KEY = "matu-theme";
const THEMES: Theme[] = ["light", "dark", "pink"];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "pink");
  if (theme !== "light") root.classList.add(theme);
}

// Inlined into the document <head> (see __root.tsx) so the right class is
// set before first paint / before React hydrates — otherwise a saved
// dark/pink preference would flash the light theme for a moment on every
// load.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('${STORAGE_KEY}');
    if (t === 'dark' || t === 'pink') document.documentElement.classList.add(t);
  } catch (e) {}
})();
`;

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Read the persisted preference once on mount (client-only — matches
  // what THEME_INIT_SCRIPT already applied to the DOM, just brings React's
  // state in sync with it).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "pink" || stored === "light") {
      setThemeState(stored);
    }
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore — private browsing / storage disabled
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export { THEMES };
