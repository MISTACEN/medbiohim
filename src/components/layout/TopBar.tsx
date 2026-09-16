"use client";

import Link from "next/link";
import { Bell, MessageSquare, Menu, Search, Moon, Sun, LogIn, LogOut, Palette } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTheme } from "@/components/theme/ThemeProvider";

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const { meta, toggleClassicMode } = useTheme();
  const initials = (user?.name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const course = user?.course ?? 2;
  const semester = user?.semester ?? 3;

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center border-b px-4 backdrop-blur-xl sm:px-6"
      style={{ background: "color-mix(in srgb, var(--card) 85%, transparent)", borderColor: "var(--border)" }}
    >
      <button type="button" onClick={onMenuClick} className="mr-3 rounded-xl p-2 transition hover:opacity-80 lg:hidden" style={{ color: "var(--muted)" }} aria-label="Меню"><Menu className="h-5 w-5" /></button>
      <div className="relative max-w-md flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} /><input type="search" placeholder="Поиск по платформе..." className="w-full rounded-full border py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2" style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--text)" }} /></div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <span className="hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>Курс {course}</span>
        <span className="hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>Сем. {semester}</span>
        {meta.family === "classic" ? <button type="button" onClick={toggleClassicMode} className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} title="Classic: светлая ↔ тёмная">{meta.dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button> : <Link href="/settings" className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} title="Смена темы в настройках"><Palette className="h-5 w-5" /></Link>}
        <button type="button" className="relative rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} aria-label="Уведомления"><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" /></button>
        <button type="button" className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} aria-label="Сообщения"><MessageSquare className="h-5 w-5" /></button>
        {user ? <><div className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }}>{initials}</div><button type="button" onClick={logout} className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} title="Выйти"><LogOut className="h-4 w-4" /></button></> : <Link href="/login" className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm" style={{ background: "var(--primary)" }}><LogIn className="h-3.5 w-3.5" /> Войти</Link>}
      </div>
    </header>
  );
}
