"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAvatarUrl, getDashboard } from "@/lib/api";
import type { Announcement } from "@/lib/guards";
import { Bell, MessageSquare, Menu, Search, Moon, Sun, LogIn, LogOut, Palette } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTheme } from "@/components/theme/ThemeProvider";

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { meta, toggleClassicMode } = useTheme();
  const [searchText, setSearchText] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // SA3: аватар подтягивается отдельным запросом и кэшируется в api.ts;
  // пока его нет — остаются инициалы, без «прыжка» вёрстки.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const userId = user?.id ? String(user.id) : null;
  useEffect(() => {
    let cancelled = false;
    if (!userId) { setAvatarUrl(null); return () => { cancelled = true; }; }
    void getAvatarUrl(userId).then((url) => { if (!cancelled) setAvatarUrl(url); });
    return () => { cancelled = true; };
  }, [userId]);
  const initials = (user?.name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const course = user?.course ?? null;
  const semester = user?.semester ?? null;
  const pageTitle = pathname === "/" ? "Медбиохим" : pathname.startsWith("/schedule") ? "Расписание" : pathname.startsWith("/university") ? "Вуз и ЕИОС" : pathname.startsWith("/homework") ? "Задания" : pathname.startsWith("/assignments") ? "Отработки" : pathname.startsWith("/bookmarks") ? "Закладки" : pathname.startsWith("/subjects") ? "Учёба" : pathname.startsWith("/community") ? "Группа" : pathname.startsWith("/settings") ? "Профиль" : "Медбиохим";

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center border-b px-4 backdrop-blur-xl sm:px-6"
      style={{ background: "color-mix(in srgb, var(--card) 85%, transparent)", borderColor: "var(--border)" }}
    >
      <button type="button" onClick={onMenuClick} className="mr-1 rounded-xl p-2 transition hover:opacity-80 lg:hidden" style={{ color: "var(--muted)" }} aria-label="Открыть меню"><Menu className="h-5 w-5" /></button>
      <div className="mr-3 min-w-0 lg:hidden"><div className="truncate text-[15px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{pageTitle}</div><div className="text-[9px] font-medium uppercase tracking-[.12em]" style={{ color: "var(--muted)" }}>Медбиохим</div></div>
      <form className="relative hidden max-w-md flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); const q = searchText.trim(); if (q) router.push(`/search?q=${encodeURIComponent(q)}`); }}><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} /><input type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Поиск по платформе..." className="w-full rounded-full border py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2" style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--text)" }} /></form>
      <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
        <span className="hidden rounded-full px-2.5 py-1 text-xs font-medium md:inline" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>{course != null ? `Курс ${course}` : "Курс не указан"}</span>
        <span className="hidden rounded-full px-2.5 py-1 text-xs font-medium md:inline" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>{semester != null ? `Сем. ${semester}` : "Семестр не указан"}</span>
        {meta.family === "classic" ? <button type="button" onClick={toggleClassicMode} aria-pressed={meta.dark} className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} title="Classic: светлая ↔ тёмная">{meta.dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button> : <Link href="/settings" className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} title="Смена темы в настройках"><Palette className="h-5 w-5" /></Link>}
        <div className="relative"><button type="button" onClick={async () => { const next = !noticeOpen; setNoticeOpen(next); if (next && announcements.length === 0 && !noticeLoading) { setNoticeLoading(true); const r = await getDashboard(); if (r.ok) setAnnouncements((r.data.announcements || []).slice(0, 5)); setNoticeLoading(false); } }} className="relative rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} aria-label="Объявления" title="Объявления"><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" /></button>{noticeOpen && <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border bg-[var(--card)] p-3 shadow-xl" style={{ borderColor: "var(--border)" }}><div className="mb-2 text-sm font-semibold">Объявления</div>{noticeLoading ? <div className="text-xs text-[var(--muted)]">Загрузка…</div> : announcements.length ? <div className="space-y-2">{announcements.map((a) => <div key={a.id} className="rounded-xl bg-[var(--background)] p-3"><div className="text-sm font-semibold">{a.title}</div><div className="mt-1 line-clamp-3 text-xs text-[var(--muted)]">{a.body}</div></div>)}</div> : <div className="text-xs text-[var(--muted)]">Новых объявлений нет.</div>}<Link href="/" onClick={() => setNoticeOpen(false)} className="mt-3 inline-flex text-xs font-semibold text-[var(--primary)]">Открыть главную →</Link></div>}</div><Link href="/community" className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} aria-label="Сообщество" title="Сообщество"><MessageSquare className="h-5 w-5" /></Link>
        {user ? <><Link href="/settings" className="ml-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,var(--primary),var(--accent))" }} title={user.name || "Профиль"} aria-label="Профиль">
          {avatarUrl
            ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            : initials}
        </Link><button type="button" onClick={logout} className="rounded-xl p-2 transition hover:opacity-80" style={{ color: "var(--muted)" }} title="Выйти"><LogOut className="h-4 w-4" /></button></> : <Link href="/login" className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm" style={{ background: "var(--primary)" }}><LogIn className="h-3.5 w-3.5" /> Войти</Link>}
      </div>
    </header>
  );
}
