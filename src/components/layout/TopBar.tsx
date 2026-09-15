"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, MessageSquare, Menu, Search, Moon, Sun, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const [dark, setDark] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => {
    // Default = light (as in mockups). Dark only if user explicitly chose it.
    const saved = localStorage.getItem("mb_theme");
    const preferDark = saved === "dark";
    setDark(preferDark);
    document.documentElement.classList.toggle("dark", preferDark);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("mb_theme", next ? "dark" : "light");
  }

  const initials = (user?.name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/80 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="mr-3 rounded-xl p-2 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-white/10 lg:hidden"
        aria-label="Меню"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Поиск по платформе..."
          className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 sm:inline dark:bg-slate-800 dark:text-slate-300">
          Курс {user?.course ?? 1}
        </span>
        <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 sm:inline dark:bg-slate-800 dark:text-slate-300">
          Сем. 2
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-xl p-2 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-white/10"
          aria-label="Тема"
        >
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button
          type="button"
          className="relative rounded-xl p-2 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-white/10"
          aria-label="Уведомления"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <button
          type="button"
          className="rounded-xl p-2 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-white/10"
          aria-label="Сообщения"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
        {user ? (
          <>
            <div className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
              {initials}
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              title="Выйти"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            <LogIn className="h-3.5 w-3.5" />
            Войти
          </Link>
        )}
      </div>
    </header>
  );
}
