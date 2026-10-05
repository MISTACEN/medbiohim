"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, ClipboardList, Users, UserRound } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/subjects", label: "Учёба", icon: BookOpen },
  { href: "/homework", label: "ДЗ", icon: ClipboardList },
  { href: "/community", label: "Группа", icon: Users },
  { href: "/settings", label: "Профиль", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-[var(--card)]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
      style={{ borderColor: "var(--border)", boxShadow: "0 -8px 30px rgba(15,23,42,.08)" }}
      aria-label="Основная навигация"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
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
                "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold transition active:scale-95",
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
