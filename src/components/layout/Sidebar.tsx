"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  ClipboardList,
  BookOpen,
  GraduationCap,
  FileQuestion,
  FolderOpen,
  TrendingUp,
  Users,
  Settings,
  HelpCircle,
  Shield,
} from "lucide-react";
import { currentUser, homeworks } from "@/lib/mock-data";
import clsx from "clsx";

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
  { href: "/settings", label: "Настройки", icon: Settings },
  { href: "/help", label: "Помощь", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const pendingHw = homeworks.filter(
    (h) => h.status === "pending" || h.status === "overdue"
  ).length;

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-primary text-white shadow-lg">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight">Медбиохим</div>
          <div className="text-xs text-white/70">образовательная платформа</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/20 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && pendingHw > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-semibold">
                      {pendingHw}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <ul className="space-y-1">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/20 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-lg bg-white/10 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
            {currentUser.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {currentUser.name}
            </div>
            <div className="text-xs text-white/70 capitalize">
              {currentUser.role === "student"
                ? "Студент"
                : currentUser.role === "teacher"
                  ? "Преподаватель"
                  : currentUser.role === "admin"
                    ? "Админ"
                    : "Модератор"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
