"use client";

/**
 * Боковое меню — короткая навигация.
 * Лекции, билеты, практика, материалы, SRS — внутри страницы предмета.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  Calendar,
  ClipboardList,
  BookOpen,
  TrendingUp,
  Users,
  Settings,
  LayoutDashboard,
  HelpCircle,
  Shield,
  Bot,
  Calculator,
  Search,
  Landmark,
  ListChecks,
  Microscope,
  Layers,
  Sparkles,
  Bookmark,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/auth/AuthProvider";

// C8 (TECH-AUDIT-PLAN §5.7, чеклист #52-54): 5 плоских пунктов + «Ещё».
// Главная — ежедневный вход; расписание, предметы, прогресс, сообщество —
// частые разделы; остальное собрано в раскрывающийся «Ещё».
const navItems = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/schedule", label: "Расписание", icon: Calendar },
  { href: "/subjects", label: "Предметы", icon: BookOpen },
  { href: "/progress", label: "Прогресс", icon: TrendingUp },
  { href: "/community", label: "Сообщество", icon: Users },
];

const moreItems = [
  { href: "/search", label: "Поиск", icon: Search },
  { href: "/university", label: "Вуз и ЕИОС", icon: Landmark },
  { href: "/atlas", label: "Атлас", icon: Microscope },
  { href: "/workshop", label: "Мастерская", icon: Layers },
  { href: "/academic", label: "Учебный план", icon: ClipboardList },
  { href: "/assignments", label: "Отработки", icon: ListChecks },
  { href: "/calculators", label: "Калькуляторы", icon: Calculator },
  { href: "/attestations", label: "Аттестации", icon: ClipboardList },
  { href: "/tutor", label: "AI-тьютор", icon: Bot },
];

const bottomItems: Array<{
  href: string;
  label: string;
  icon: typeof Settings;
  adminOnly?: boolean;
  starostaOnly?: boolean;
}> = [
  { href: "/group", label: "Кабинет старосты", icon: Users, starostaOnly: true },
  { href: "/settings", label: "Настройки", icon: Settings },
  { href: "/changelog", label: "Что нового", icon: Sparkles },
  { href: "/bookmarks", label: "Закладки", icon: Bookmark },
  { href: "/help", label: "Помощь", icon: HelpCircle },
  { href: "/admin", label: "Админ", icon: LayoutDashboard, adminOnly: true },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
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
          : user?.groupRole === "starosta"
            ? "Староста"
            : user
              ? "Студент"
              : "Не авторизован";

  const showAdmin =
    user?.role === "admin" || user?.role === "moderator" || user?.role === "teacher";

  // C8: «Ещё» раскрыто по умолчанию, если активен один из его разделов.
  const moreActive = moreItems.some((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );
  const [moreOpen, setMoreOpen] = useState(moreActive);

  return (
    <aside className="app-sidebar fixed left-0 top-0 z-40 flex h-[100dvh] w-64 flex-col overflow-hidden shadow-xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md"
          style={{ background: "var(--sidebar-active)" }}
        >
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <div className="text-lg font-extrabold tracking-tight">Медбиохим</div>
          <div className="text-[10px] font-medium uppercase tracking-wider opacity-60">
            предмет · курс · семестр
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "app-sidebar-active shadow-md"
                      : "opacity-80 hover:bg-white/10 hover:opacity-100"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
            className={clsx(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              moreActive
                ? "app-sidebar-active shadow-md"
                : "opacity-80 hover:bg-white/10 hover:opacity-100"
            )}
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" strokeWidth={2} />
            <span className="flex-1 text-left">Ещё</span>
            <ChevronDown className={clsx("h-4 w-4 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen && (
            <ul className="mt-1 space-y-1">
              {moreItems.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                        active
                          ? "app-sidebar-active shadow-md"
                          : "opacity-75 hover:bg-white/10 hover:opacity-100"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 px-3 text-[10px] leading-relaxed opacity-50">
          Лекции, билеты, практика, материалы и карточки — внутри выбранного предмета.
        </p>
      </nav>

      <div className="shrink-0 border-t border-white/10 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <ul className="space-y-1">
          {bottomItems
            .filter((item) => !item.adminOnly || showAdmin)
            .filter((item) => !item.starostaOnly || user?.groupRole === "starosta")
            .map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "app-sidebar-active shadow-md"
                        : "opacity-80 hover:bg-white/10 hover:opacity-100"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
        </ul>
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="truncate text-sm font-semibold">{displayName}</div>
          <div className="text-[11px] opacity-60">{roleLabel}</div>
        </div>
      </div>
    </aside>
  );
}
