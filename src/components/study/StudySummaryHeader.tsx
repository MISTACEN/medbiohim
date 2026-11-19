"use client";

import Link from "next/link";
import { GraduationCap, Loader2, TriangleAlert } from "lucide-react";

import { fmtDate } from "@/lib/study/agenda-fmt";

import { ANCHORS } from "./study-hub-model";
import type { StudyHubView } from "./useStudyHub";

/** Плитка сводки: цифра, пояснение и полоска прогресса. */
function StatTile({
  label,
  value,
  hint,
  barPct,
  barTone,
}: {
  label: string;
  value: string;
  hint?: string;
  barPct?: number;
  barTone?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-extrabold leading-none tabular-nums tracking-tight">{value}</span>
        {hint ? <span className="text-[11px] font-semibold text-[var(--muted)]">{hint}</span> : null}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--primary-soft)]">
        <div
          className={"h-full rounded-full transition-[width] duration-500 " + (barTone || "bg-[var(--primary)]")}
          style={{ width: `${Math.max(0, Math.min(100, Number(barPct ?? 0)))}%` }}
        />
      </div>
    </div>
  );
}

/** Шапка хаба «Учёба»: сводка цифрами, строка про КР и якоря разделов. */
export function StudySummaryHeader({ hub }: { hub: StudyHubView }) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-200/50 via-violet-200/40 to-transparent blur-2xl dark:from-indigo-500/15 dark:via-violet-500/10"
      />
      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
          <GraduationCap className="h-3.5 w-3.5" /> Учёба
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]">План, отработки и прогресс в одном месте</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Сводка считается по расписанию, официальному плану, тестам и вашим отметкам. ИИ-ассистент помогает собрать план дня и подготовиться к контрольным.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile
            label="Общий прогресс"
            value={hub.overall != null ? `${Math.round(Number(hub.overall))}%` : "—"}
            hint={hub.studyProgress.total ? `${hub.studyProgress.done} из ${hub.studyProgress.total} задач` : undefined}
            barPct={hub.overall != null ? Number(hub.overall) : 0}
          />
          <StatTile
            label="ДЗ"
            value={hub.homework && hub.homework.total > 0 ? `${hub.homework.done}/${hub.homework.total}` : "—"}
            hint={hub.homework && hub.homework.total > 0 ? `${hub.homeworkPct}%` : undefined}
            barPct={hub.homeworkPct}
            barTone="bg-[var(--status-ok-fg)]"
          />
          <StatTile
            label="Тесты"
            value={hub.tests && hub.tests.attempts > 0 ? `${hub.tests.finished ?? 0}/${hub.tests.attempts}` : "—"}
            hint={hub.tests?.avg_score != null ? `ср. ${Math.round(Number(hub.tests.avg_score))}` : undefined}
            barPct={hub.testsPct}
            barTone="bg-[var(--status-info-fg)]"
          />
          <StatTile
            label="Долги"
            value={String(hub.totalDebts)}
            hint={hub.totalDebts ? "закрыть в отработках" : "нет"}
            barPct={hub.totalDebts ? 100 : 0}
            barTone={hub.totalDebts ? "bg-[var(--status-critical-fg)]" : "bg-[var(--status-ok-fg)]"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted)]">
          <span>
            Подготовка к КР: <b className="font-semibold text-[var(--text)]">{fmtDate(hub.krDate)}</b>
            {hub.daysLeft > 0 ? ` · осталось ${hub.daysLeft} дн.` : ""}
          </span>
          <span>Задачи подготовки: {hub.studyProgress.done} из {hub.studyProgress.total}</span>
          {hub.authLoading || hub.loading ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> обновляем</span>
          ) : null}
          {!hub.loggedIn && !hub.authLoading ? (
            <Link href="/login" className="font-semibold text-[var(--primary)]">Войти, чтобы вести отработки</Link>
          ) : null}
        </div>
        {hub.progressError ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--status-critical-fg)]">
            <TriangleAlert className="h-4 w-4" /> {hub.progressError}
          </p>
        ) : null}

        <nav aria-label="Разделы страницы" className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
          {ANCHORS.map((anchor) => (
            <a
              key={anchor.href}
              href={anchor.href}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
            >
              {anchor.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
