"use client";

import { TABS, chipStyle } from "./model";
import type { TeacherWorkspaceView } from "./useTeacherWorkspace";

/**
 * KPI: только реальные значения из /teacher/overview, /teacher/students
 * и /teacher/test-assignments.
 */
export function TeacherKpis({ tw }: { tw: TeacherWorkspaceView }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tw.metrics.map(({ id, label, value, hint, footer, chip, chipKind, icon: Icon, tone, toneBg }) => (
        <div key={id} className="card flex flex-col justify-between gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--text)" }}>{value}</span>
                <span className="text-xs text-[var(--muted)]">{hint}</span>
              </div>
            </div>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: toneBg, color: tone }}
            >
              <Icon className="h-5 w-5" />
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--muted)]">
            <span className="min-w-0 truncate">{footer}</span>
            {chip ? (
              <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={chipStyle(chipKind)}>
                {chip}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Вкладки: одна область работы за раз вместо длинной ленты блоков. */
export function TeacherTabs({ tw }: { tw: TeacherWorkspaceView }) {
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[var(--border)] p-1.5"
      role="tablist"
      aria-label="Разделы кабинета преподавателя"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tw.tab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => tw.setTab(id)}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition"
            style={active ? { background: "var(--primary)", color: "#fff" } : { color: "var(--muted)" }}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tw.tabCounts[id] ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-bold"
                style={
                  active
                    ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                    : { background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)" }
                }
              >
                {tw.tabCounts[id]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
