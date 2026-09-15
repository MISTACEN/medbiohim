"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Three selectable themes (as requested). */
export type AppThemeId = "classic-light" | "classic-dark" | "midnight";

export type AppThemeMeta = {
  id: AppThemeId;
  label: string;
  description: string;
  /** true = dark surface */
  dark: boolean;
  family: "classic" | "midnight";
};

export const THEMES: AppThemeMeta[] = [
  {
    id: "classic-light",
    label: "Classic · Светлая",
    description: "Синий медицинский стиль как на макетах, светлый фон",
    dark: false,
    family: "classic",
  },
  {
    id: "classic-dark",
    label: "Classic · Тёмная",
    description: "Тот же Classic, тёмные поверхности",
    dark: true,
    family: "classic",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Только тёмная: индиго / фиолет, премиум",
    dark: true,
    family: "midnight",
  },
];

type ThemeCtx = {
  theme: AppThemeId;
  meta: AppThemeMeta;
  setTheme: (id: AppThemeId) => void;
  /** Quick toggle only within Classic light ↔ dark */
  toggleClassicMode: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "mb_app_theme";

function applyDom(id: AppThemeId) {
  if (typeof document === "undefined") return;
  const meta = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.setAttribute("data-theme", id);
  document.documentElement.classList.toggle("dark", meta.dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>("classic-light");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as AppThemeId | null;
    const legacy = localStorage.getItem("mb_theme");
    let initial: AppThemeId = "classic-light";
    if (saved && THEMES.some((t) => t.id === saved)) {
      initial = saved;
    } else if (legacy === "dark") {
      initial = "classic-dark";
    }
    setThemeState(initial);
    applyDom(initial);
  }, []);

  const setTheme = useCallback((id: AppThemeId) => {
    setThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
    applyDom(id);
  }, []);

  const toggleClassicMode = useCallback(() => {
    setThemeState((prev) => {
      const next: AppThemeId =
        prev === "classic-dark"
          ? "classic-light"
          : prev === "classic-light"
            ? "classic-dark"
            : "classic-light";
      localStorage.setItem(STORAGE_KEY, next);
      applyDom(next);
      return next;
    });
  }, []);

  const meta = THEMES.find((t) => t.id === theme) || THEMES[0];

  const value = useMemo(
    () => ({ theme, meta, setTheme, toggleClassicMode }),
    [theme, meta, setTheme, toggleClassicMode]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
