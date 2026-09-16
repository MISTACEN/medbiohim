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

/**
 * Six selectable themes: the original three plus three new reference themes
 * based on the supplied MedBioHim mockups.
 */
export type AppThemeId =
  | "classic-light"
  | "classic-dark"
  | "midnight"
  | "aurora-glass"
  | "medical-glass"
  | "crystal-glass";

export type AppThemeMeta = {
  id: AppThemeId;
  label: string;
  description: string;
  dark: boolean;
  family: "classic" | "midnight" | "reference";
  preview: string;
};

export const THEMES: AppThemeMeta[] = [
  {
    id: "aurora-glass",
    label: "Aurora Glass",
    description: "Стеклянный интерфейс с водой, мятой и мягким голубым свечением",
    dark: false,
    family: "reference",
    preview: "linear-gradient(135deg,#d9f8ff 0%,#ffffff 48%,#dbfff2 100%)",
  },
  {
    id: "medical-glass",
    label: "Medical Glass",
    description: "Белое медицинское стекло, индиго и голубые акценты из новых макетов",
    dark: false,
    family: "reference",
    preview: "linear-gradient(135deg,#dceeff 0%,#ffffff 52%,#e8e4ff 100%)",
  },
  {
    id: "crystal-glass",
    label: "Crystal Glass",
    description: "Чистая кристальная версия: больше воздуха, света и прозрачных панелей",
    dark: false,
    family: "reference",
    preview: "linear-gradient(135deg,#e9fbff 0%,#ffffff 50%,#edf2ff 100%)",
  },
  {
    id: "classic-light",
    label: "Classic · Светлая",
    description: "Классический синий медицинский стиль",
    dark: false,
    family: "classic",
    preview: "linear-gradient(135deg,#2563eb,#60a5fa)",
  },
  {
    id: "classic-dark",
    label: "Classic · Тёмная",
    description: "Классический стиль с тёмными поверхностями",
    dark: true,
    family: "classic",
    preview: "linear-gradient(135deg,#1e3a5f,#2563eb)",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Индиго / фиолетовый премиальный тёмный режим",
    dark: true,
    family: "midnight",
    preview: "linear-gradient(135deg,#6366f1,#8b5cf6)",
  },
];

type ThemeCtx = {
  theme: AppThemeId;
  meta: AppThemeMeta;
  setTheme: (id: AppThemeId) => void;
  /** Quick toggle only within Classic light ↔ dark. */
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
  const [theme, setThemeState] = useState<AppThemeId>("aurora-glass");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as AppThemeId | null;
    const legacy = localStorage.getItem("mb_theme");
    let initial: AppThemeId = "aurora-glass";
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
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
