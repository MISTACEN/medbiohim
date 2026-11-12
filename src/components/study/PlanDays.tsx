"use client";

/**
 * План по дням: детерминированная раскладка задач по срокам + акценты AI.
 * День перегруза не прячется — помечается, чтобы студент сам решал, что снять.
 */
import { CalendarDays, Check, Circle, Download, Loader2, Printer, TriangleAlert } from "lucide-react";
import type { AiPlanPatch, StudyDay, StudyPlanV2 } from "@/lib/study/program";

const SOURCE_LABEL: Record<string, string> = {
  program: "ДЗ",
  kr: "КР",
  repeat: "повтор",
  assignment: "отработка",
  class: "занятие",
};

export function PlanDays({
  plan,
  patch,
  done,
  onToggle,
  onPrint,
  onExport,
}: {
  plan: StudyPlanV2;
  patch: AiPlanPatch | null;
  done: Record<string, boolean>;
  onToggle: (id: string) => void;
  onPrint: () => void;
  onExport: () => void;
}) {
  const total = plan.days.reduce((sum, day) => sum + day.items.length, 0);

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-2 p-4">
        <div>
          <h2 className="text-sm font-semibold">План по дням до КР</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {plan.days.length} дней, {total} пунктов. Даты фиксированы: 17.11 — открытые тесты, 19.11 — § 6 и репетиция,{" "}
            {plan.deadline.split("-").reverse().join(".")} — КР.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            <Download className="h-4 w-4" /> В календарь
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            <Printer className="h-4 w-4" /> Печать
          </button>
        </div>
      </section>

      {plan.days.length === 0 ? (
        <section className="card flex items-center gap-2 p-6 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Собираем план…
        </section>
      ) : (
        <section className="space-y-2">
          {plan.days.map((day) => (
            <DayCard key={day.date} day={day} focus={patch?.days[day.date]} done={done} onToggle={onToggle} />
          ))}
        </section>
      )}
    </div>
  );
}

function DayCard({
  day,
  focus,
  done,
  onToggle,
}: {
  day: StudyDay;
  focus?: string;
  done: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 font-semibold">
            <CalendarDays className="h-4 w-4 text-[var(--muted)]" /> {day.label}
          </div>
          <div className="text-xs text-[var(--muted)]">{focus || day.focus}</div>
        </div>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs font-semibold " +
            (day.heavy
              ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
              : "bg-[var(--primary-soft)] text-[var(--primary)]")
          }
        >
          {day.load} мин{day.heavy ? " · перегруз" : ""}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {day.items.map((item) => {
          const checked = Boolean(done[item.id]);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-pressed={checked}
                className="flex w-full items-start gap-2.5 px-4 py-2 text-left text-sm hover:bg-[var(--background)]"
              >
                {checked ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
                )}
                <span className="min-w-0">
                  <span className={"block " + (checked ? "line-through opacity-60" : "")}>{item.text}</span>
                  {item.hint ? <span className="mt-0.5 block text-xs text-[var(--muted)]">{item.hint}</span> : null}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  {item.minutes} мин
                  <span className="rounded-full bg-[var(--background)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {day.heavy ? (
        <p className="flex items-center gap-1.5 border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--status-warn-fg)]">
          <TriangleAlert className="h-3.5 w-3.5" /> День перегружен: сними 1–2 пункта или сократи прогон.
        </p>
      ) : null}
    </article>
  );
}

/** Печатный план: список дней и задач, без интерфейса. */
export function PlanPrintSheet({ plan, patch }: { plan: StudyPlanV2; patch: AiPlanPatch | null }) {
  return (
    <div className="study-print hidden print:block">
      <h1 className="mb-3 text-lg font-bold">План подготовки к КР</h1>
      {plan.days.map((day) => (
        <section key={day.date} className="mb-3">
          <h2 className="text-sm font-bold">{day.label} · {day.load} мин</h2>
          <p className="text-xs">{patch?.days[day.date] || day.focus}</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {day.items.map((item) => <li key={item.id}>{item.text} — {item.minutes} мин</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}