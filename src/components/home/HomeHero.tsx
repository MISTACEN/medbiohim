"use client";

/** Шапка главной: приветствие, группа/курс/семестр, источник API и быстрые ссылки. */
import Link from "next/link";
import { GraduationCap, Landmark } from "lucide-react";
import type { HomeDashboardState } from "@/components/home/useHomeDashboard";

function apiLabel(transport: HomeDashboardState["apiTransport"]): string {
  if (!transport) return "проверяем источник…";
  if (transport.source === "cloudflare") return "Cloudflare";
  if (transport.source.includes("fallback")) return "совместимый резервный маршрут Cloudflare";
  if (transport.source === "cloudflare-unavailable") return "Cloudflare недоступен";
  if (transport.source === "unavailable") return "бэкенд не настроен";
  return "источник не определён";
}

function apiDotClass(transport: HomeDashboardState["apiTransport"]): string {
  if (!transport) return "bg-slate-300";
  if (transport.source === "cloudflare") return "bg-[var(--status-ok-fg)]";
  if (transport.source === "spaceweb") return "bg-[var(--status-warn-fg)]";
  if (transport.source.includes("fallback")) return "bg-[var(--status-warn-fg)]";
  return "bg-[var(--status-critical-fg)]";
}

export function HomeHero({ page }: { page: HomeDashboardState }) {
  const { user, apiTransport } = page;
  const name = user?.name?.split(" ")[0] || "студент";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-8 dark:border-slate-700/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="relative z-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Сегодня</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Привет, {name}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Расписание, предметы, задания и подготовка — в одном месте.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="academic-identity">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
            <GraduationCap className="h-3.5 w-3.5 text-indigo-500" />
            Группа:{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {user?.groupName || user?.groupCode || "не назначена"}
            </span>
          </span>
          <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
            Курс:{" "}
            <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">
              {user?.course != null ? user.course : "—"}
            </span>
          </span>
          <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
            Семестр:{" "}
            <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">
              {user?.semester != null ? user.semester : "—"}
            </span>
          </span>
          {!user?.groupId ? (
            <span className="text-xs text-[var(--status-warn-fg)]">Админ может назначить группу в разделе «Пользователи»</span>
          ) : null}
        </div>

        <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300" role="status" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${apiDotClass(apiTransport)}`} />
          <span className="font-semibold text-slate-700 dark:text-slate-200">API:</span>
          <span>{apiLabel(apiTransport)}</span>
          {apiTransport?.fallback && <span className="rounded-md bg-[var(--status-warn-bg)] px-2 py-0.5 font-medium text-[var(--status-warn-fg)]">резервный маршрут</span>}
          {apiTransport?.path && <span className="text-slate-400 dark:text-slate-500">· последний запрос {apiTransport.path}</span>}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/schedule"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Расписание
          </Link>
          <Link
            href="/subjects"
            className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
          >
            Предметы
          </Link>
          <Link
            href="/homework"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Задания
          </Link>
          <Link
            href="/study#assignments"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Отработки
          </Link>
          <Link
            href="/study#plan"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Учебный план
          </Link>
          <Link
            href="/university"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
          >
            <Landmark className="h-4 w-4" /> Вуз и ЕИОС
          </Link>
        </div>
      </div>
    </section>
  );
}
