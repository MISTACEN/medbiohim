"use client";

import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";

import type { AppThemeId } from "@/components/theme/ThemeProvider";

export type ThemeOption = {
  id: string;
  label: string;
  description: string;
  preview?: string;
  family?: string;
};

export type ThemesSectionProps = {
  themes: readonly ThemeOption[];
  activeTheme: string;
  onSelect: (id: AppThemeId) => void;
  title: string;
  description?: string;
  hero?: boolean;
};

/** Сетка тем оформления: макеты или классические варианты. */
export function ThemesSection({
  themes,
  activeTheme,
  onSelect,
  title,
  description,
  hero = false,
}: ThemesSectionProps) {
  return (
    <section className={hero ? "card space-y-5 p-5" : "card space-y-4 p-5"}>
      {hero ? (
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}>
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
          </div>
        </div>
      ) : (
        <h2 className="text-lg font-semibold">{title}</h2>
      )}
      <div className={hero ? "grid gap-4 md:grid-cols-3" : "grid gap-3 md:grid-cols-3"}>
        {themes.map((t) => {
          const active = activeTheme === t.id;
          return (
            <button key={t.id} type="button" onClick={() => onSelect(t.id as AppThemeId)}
              className={clsx("group relative overflow-hidden rounded-3xl border p-4 text-left transition", active ? "ring-2 ring-offset-2" : "hover:-translate-y-0.5")}
              style={{ borderColor: active ? "var(--primary)" : "var(--border)", background: "color-mix(in srgb, var(--card) 88%, var(--background))", color: "var(--text)", ["--tw-ring-color" as string]: "var(--primary)" }}>
              {active && (
                <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}>
                  <Check className="h-4 w-4" />
                </span>
              )}
              <div className="relative mb-4 h-28 overflow-hidden rounded-2xl border" style={{ background: t.preview || "linear-gradient(135deg,#2563eb,#60a5fa)", borderColor: "color-mix(in srgb,var(--primary) 16%,transparent)" }} />
              <div className="font-bold">{t.label}</div>
              <div className="mt-1 text-xs leading-5 opacity-70">{t.description}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
