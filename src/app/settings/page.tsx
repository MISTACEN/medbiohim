"use client";

import { THEMES, useTheme, type AppThemeId } from "@/components/theme/ThemeProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import clsx from "clsx";
import { Check } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="page-title">Настройки</h1>
        <p className="page-subtitle">Профиль и оформление платформы</p>
      </div>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Тема оформления</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Три варианта: Classic светлая, Classic тёмная и Midnight (только тёмная).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id as AppThemeId)}
                className={clsx(
                  "relative rounded-2xl border p-4 text-left transition",
                  active ? "ring-2 ring-offset-2" : "hover:opacity-90"
                )}
                style={{
                  borderColor: active ? "var(--primary)" : "var(--border)",
                  background: t.dark ? "#0f172a" : "#f8fafc",
                  color: t.dark ? "#e2e8f0" : "#0f172a",
                  ["--tw-ring-color" as string]: "var(--primary)",
                }}
              >
                {active && (
                  <span
                    className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white"
                    style={{ background: "var(--primary)" }}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
                <div
                  className="mb-3 h-10 rounded-lg"
                  style={{
                    background:
                      t.id === "midnight"
                        ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                        : t.id === "classic-dark"
                          ? "linear-gradient(135deg,#1e3a5f,#2563eb)"
                          : "linear-gradient(135deg,#2563eb,#60a5fa)",
                  }}
                />
                <div className="font-semibold">{t.label}</div>
                <div className="mt-1 text-xs opacity-70">{t.description}</div>
              </button>
            );
          })}
        </div>
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
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--text)",
            }}
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
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--text)",
            }}
          />
        </div>
        <button type="button" className="btn-primary">
          Сохранить
        </button>
      </section>
    </div>
  );
}
