"use client";

import { Bell, MessageSquare, Menu, Search } from "lucide-react";
import { currentUser } from "@/lib/mock-data";

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="glass sticky top-0 z-30 flex h-16 items-center border-b border-slate-200/60 bg-white/70 px-4 backdrop-blur-xl sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="mr-3 rounded-soft p-2 text-slate-500 transition hover:bg-indigo-50 hover:text-primary lg:hidden"
        aria-label="Меню"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Поиск по платформе…"
          className="w-full rounded-pill border border-slate-200 bg-slate-50/80 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="ml-4 flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 text-sm sm:flex">
          <span className="badge-primary">Курс {currentUser.course}</span>
          <span className="badge-primary">Сем. {currentUser.semester}</span>
        </div>
        <button type="button" className="relative rounded-soft p-2 text-slate-500 transition hover:bg-indigo-50 hover:text-primary" aria-label="Уведомления">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white" />
        </button>
        <button type="button" className="rounded-soft p-2 text-slate-500 transition hover:bg-indigo-50 hover:text-primary" aria-label="Сообщения">
          <MessageSquare className="h-5 w-5" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-card">
          {currentUser.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
        </div>
      </div>
    </header>
  );
}
