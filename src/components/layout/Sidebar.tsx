"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Calendar, ClipboardList, BookOpen, GraduationCap, FileQuestion,
  FolderOpen, TrendingUp, Users, Settings, LayoutDashboard, HelpCircle, Shield,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/auth/AuthProvider";

const navItems = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/schedule", label: "Расписание", icon: Calendar },
  { href: "/homework", label: "Задания", icon: ClipboardList, badge: true },
  { href: "/subjects", label: "Предметы", icon: BookOpen },
  { href: "/curriculum", label: "Учебный план", icon: GraduationCap },
  { href: "/tests", label: "Тесты и билеты", icon: FileQuestion },
  { href: "/materials", label: "Материалы", icon: FolderOpen },
  { href: "/progress", label: "Прогресс", icon: TrendingUp },
  { href: "/community", label: "Сообщество", icon: Users },
];

const bottomItems = [
  { href: "/admin", label: "Админ", icon: LayoutDashboard },
  { href: "/settings", label: "Настройки", icon: Settings },
  { href: "/help", label: "Помощь", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const displayName = user?.name || "Гость";
  const roleLabel =
    user?.role === "teacher"
      ? "Преподаватель"
      : user?.role === "admin"
        ? "Админ"
        : user?.role === "moderator"
          ? "Модератор"
          : user
            ? "Студент"
            : "Не авторизован";

  return (
    <aside className="glass fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-indigo-100/60 bg-gradient-to-b from-indigo-600/95 via-indigo-600/90 to-violet-600/95 text-white shadow-lift">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-soft bg-white/15 shadow-inner">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <div className="text-lg font-extrabold tracking-tight">Медбиохим</div>
          <div className="text-[11px] uppercase tracking-wider text-white/70">образовательная платформа</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} className={clsx(
                  "flex items-center gap-3 rounded-soft px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active ? "bg-white/20 text-white shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"
                )}>
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-white/10 px-3 py-3">
        <ul className="space-y-1">
          {bottomItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} className={clsx(
                  "flex items-center gap-3 rounded-soft px-3 py-2.5 text-sm font-medium transition",
                  active ? "bg-white/20 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                )}>
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center gap-3 rounded-soft bg-white/10 px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold">
            {displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{displayName}</div>
            <div className="text-xs text-white/70">{roleLabel}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
