"use client";

/** Карточка предмета: иконка, метаданные, бейдж сессии и действия. */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { controlLabel, examBadge, subjectIcon, type Item, type ExamWindow } from "@/components/subjects/catalog/model";

export function SubjectCard({ item, examWindows, openTutor }: {
  item: Item;
  examWindows: Record<string, ExamWindow[]>;
  openTutor: (name: string) => void;
}) {
  const s = item;
  const Icon = subjectIcon(s.icon);
  const href = `/subjects/${encodeURIComponent(s.id)}`;
  const ex = examBadge(s, examWindows);
  const exRing = ex ? (ex.tone === "exam"
    ? "border-2 border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] shadow-rose-200/60 hover:border-[var(--status-critical-border)]"
    : "border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/50 hover:border-[var(--status-warn-border)]")
    : "";
  return (
    <div className={`group flex flex-col rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${exRing || "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/35"}`}>
      <Link href={href} className="flex flex-1 gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug text-[var(--text)]">{s.name}</div>
          {s.blurb && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{s.blurb}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {ex && <span className={`rounded-full px-2 py-0.5 ${ex.tone === "exam" ? "bg-[var(--status-critical-fg)] text-white" : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"}`}>{ex.tone === "exam" ? "⚡" : "📅"} {ex.label}</span>}
            {controlLabel(s.control_type) && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[var(--primary)]">{controlLabel(s.control_type)}</span>}
            {s.total_hours != null && <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{s.total_hours} ч{s.credits != null ? ` / ${s.credits} з.е.` : ""}</span>}
            {s.hours_note && <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{s.hours_note}</span>}
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 opacity-40 transition group-hover:opacity-80" />
      </Link>
      <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3">
        <Link href={href} className="flex-1 rounded-xl border border-[var(--border)] px-3 py-1.5 text-center text-xs font-semibold hover:bg-[var(--primary-soft)]">Открыть</Link>
        <Link href="/tutor" onClick={() => openTutor(s.name)} className="flex-1 rounded-xl bg-[var(--primary)] px-3 py-1.5 text-center text-xs font-semibold text-white">Спросить тьютора</Link>
      </div>
    </div>
  );
}

/** Инструменты обучения: верхняя сетка ссылок из каталога. */
export function CatalogToolGrid({ tools }: { tools: Array<{ id: string; name: string; href: string; icon?: string; blurb?: string }> }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Инструменты обучения</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((t) => {
          const Icon = subjectIcon(t.icon);
          return (
            <Link key={t.id} href={t.href} className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-md">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="h-5 w-5" /></div>
              <div className="font-semibold">{t.name}</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{t.blurb}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
