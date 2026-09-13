import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setThemeFromProfile: (preferred: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = "stocksist-theme";
const LEGACY_THEME_STORAGE_KEY = "hedgefun-theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored) return stored as Theme;
  const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacy) {
    localStorage.setItem(THEME_STORAGE_KEY, legacy);
    return legacy as Theme;
  }
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const profileLoaded = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setThemeFromProfile = (preferred: string | null) => {
    if (!profileLoaded.current && preferred && (preferred === "light" || preferred === "dark")) {
      setTheme(preferred);
      profileLoaded.current = true;
    }
  };

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      // Fire-and-forget sync to database
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase.from("profiles").update({ preferred_theme: next }).eq("id", user.id).then(() => {});
        }
      });
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeFromProfile }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
