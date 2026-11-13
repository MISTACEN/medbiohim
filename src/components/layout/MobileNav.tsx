"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, ClipboardList, Users, UserRound, Landmark } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/auth/AuthProvider";
import { useModuleAccess } from "@/hooks/useModuleAccess";

// moduleKey — раздел из реестра Access Control: без выдачи пункт скрывается
// (сервер дополнительно проверяет каждый маршрут).
const items = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/study", label: "Учёба", icon: BookOpen },
  { href: "/university", label: "Вуз", icon: Landmark, moduleKey: "university" },
  { href: "/homework", label: "ДЗ", icon: ClipboardList },
  { href: "/community", label: "Группа", icon: Users, moduleKey: "community" },
  { href: "/settings", label: "Профиль", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { keys } = useModuleAccess(Boolean(user));
  // Директива владельца: учитель видит только рабочее место и профиль —
  // студенческая нижняя навигация для него скрыта полностью.
  const teacherWorkspace = user?.role === "teacher";
  // keys = null — доступ ещё вычисляется: показываем всё, как раньше.
  const visible = teacherWorkspace
    ? [
        { href: "/teacher", label: "Кабинет", icon: ClipboardList },
        { href: "/settings", label: "Профиль", icon: UserRound },
      ]
    : keys
      ? items.filter((item) => !item.moduleKey || keys.has(item.moduleKey))
      : items;

  return (
    <nav
      // iOS: fixed-элементы с backdrop-filter «уезжают» вместе со страницей
      // (WebKit bug 297779) и дрожат при rubber-banding. Непрозрачный фон и
      // собственный compositing-слой (translateZ) держат бар на месте.
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-[var(--card)] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
      style={{
        borderColor: "var(--border)",
        boxShadow: "0 -8px 30px rgba(15,23,42,.08)",
        transform: "translateZ(0)",
      }}
      aria-label="Основная навигация"
    >
      <div
        className={
          "mx-auto grid max-w-lg " +
          (visible.length === 6
            ? "grid-cols-6"
            : visible.length === 5
              ? "grid-cols-5"
              : visible.length === 4
                ? "grid-cols-4"
                : visible.length === 3
                  ? "grid-cols-3"
                  : visible.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-1")
        }
      >
        {visible.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[9px] font-semibold transition active:scale-95 sm:text-[10px]",
                active ? "text-[var(--primary)]" : "text-[var(--muted)]"
              )}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span
                  className="absolute top-0 h-1 w-8 rounded-full"
                  style={{ background: "var(--primary)" }}
                />
              )}
              <span
                className={clsx(
                  "flex h-8 w-11 items-center justify-center rounded-xl transition",
                  active && "bg-[var(--primary-soft)]"
                )}
              >
                <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
