"use client";

import { Search, Bell, MessageSquare, Menu } from "lucide-react";
import { currentUser } from "@/lib/mock-data";

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="mr-3 rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
        aria-label="Открыть меню"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative max-w-xl flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Поиск по предметам, темам, материалам..."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="ml-4 flex items-center gap-3 sm:gap-4">
        <div className="hidden items-center gap-2 text-sm text-gray-600 sm:flex">
          <span className="rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
            Курс: {currentUser.course}
          </span>
          <span className="rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
            Семестр: {currentUser.semester}
          </span>
        </div>

        <button
          type="button"
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"
          aria-label="Уведомления"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
        </button>

        <button
          type="button"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"
          aria-label="Сообщения"
        >
          <MessageSquare className="h-5 w-5" />
        </button>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          {currentUser.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)}
        </div>
      </div>
    </header>
  );
}
