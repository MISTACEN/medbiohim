"use client";

import { THEMES, useTheme, type AppThemeId } from "@/components/theme/ThemeProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const referenceThemes = THEMES.filter((t) => t.family === "reference");
  const otherThemes = THEMES.filter((t) => t.family !== "reference");

  const renderTheme = (t: (typeof THEMES)[number]) => {
    const active = theme === t.id;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => setTheme(t.id as AppThemeId)}
        className={clsx(
          "group relative overflow-hidden rounded-3xl border p-4 text-left transition duration-200",
          active ? "ring-2 ring-offset-2" : "hover:-translate-y-0.5 hover:shadow-lg"
        )}
        style={{
          borderColor: active ? "var(--primary)" : "var(--border)",
          background: "color-mix(in srgb, var(--card) 88%, var(--background))",
          color: "var(--text)",
          ["--tw-ring-color" as string]: "var(--primary)",
        }}
      >
        {active && (
          <span
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-md"
            style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}
          >
            <Check className="h-4 w-4" />
          </span>
        )}
        <div
          className="relative mb-4 h-28 overflow-hidden rounded-2xl border"
          style={{
            background: t.preview,
            borderColor: "color-mix(in srgb,var(--primary) 16%,transparent)",
          }}
        >
          <span className="absolute left-3 top-3 h-10 w-24 rounded-xl bg-white/70 shadow-sm backdrop-blur" />
          <span className="absolute bottom-3 left-4 h-8 w-14 rounded-lg bg-white/75 shadow-sm backdrop-blur" />
          <span className="absolute bottom-3 left-20 h-8 w-20 rounded-lg bg-white/60 shadow-sm backdrop-blur" />
          <span
            className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-60 blur-sm"
            style={{ background: "color-mix(in srgb,var(--accent) 58%,white)" }}
          />
        </div>
        <div className="font-bold">{t.label}</div>
        <div className="mt-1 text-xs leading-5 opacity-70">{t.description}</div>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="page-title">Настройки</h1>
        <p className="page-subtitle">Профиль и оформление платформы</p>
      </div>

      <section className="card space-y-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Новые темы из макетов</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Три новые темы повторяют визуальное направление присланных макетов: стекло, мягкие градиенты, медицинский индиго и голубо-мятные акценты.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">{referenceThemes.map(renderTheme)}</div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Классические темы</h2>
        <div className="grid gap-3 md:grid-cols-3">{otherThemes.map(renderTheme)}</div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Профиль</h2>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: "var(--muted)" }}>
            Имя
          </label>
          <input
            type="text"
            defaultValue={user?.name || ""}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--text)" }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: "var(--muted)" }}>
            Email
          </label>
          <input
            type="email"
            defaultValue={user?.email || ""}
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--text)" }}
          />
        </div>
        <button type="button" className="btn-primary">Сохранить</button>
      </section>
    </div>
  );
}
