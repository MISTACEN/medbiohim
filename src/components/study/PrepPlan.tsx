"use client";

/**
 * «План подготовки» — сохранённый план к событию расписания (Фаза 1 дорожной
 * карты, docs/AI-STUDY-ROADMAP.md §2.1).
 *
 * Готовность и темы приходят из /academic/state (prep_topics, mastery_pct),
 * сам план — из /study-prep/plan: дни с шагами и «почему» у каждого шага.
 * План детерминированный (правила, без LLM), поэтому открывается мгновенно.
 * Если миграция study_plans ещё не применена, воркер отдаёт предпросмотр и
 * честно помечает, что отметки не сохраняются.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Loader2, RefreshCw, Save, X } from "lucide-react";
import { generateStudyPlan, getStudyPlan, toggleStudyPlanItem } from "@/lib/api/misc";
import { describeApiError } from "@/lib/errors";
import type { StudyPlan } from "@/lib/api/types";
import { EVENT_LABEL, type AgendaItem } from "@/lib/study/agenda";

function barTone(pct: number): string {
  if (pct >= 70) return "bg-[var(--status-ok-fg)]";
  if (pct >= 40) return "bg-[var(--status-warn-fg,var(--primary))]";
  return "bg-[var(--status-critical-fg)]";
}

export function PrepPlan({ item, onClose }: { item: AgendaItem; onClose: () => void }) {
  const eventId = item.scheduleEntryId ?? null;
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setBusy(false);
      setError("У события нет записи в расписании — по нему нельзя собрать план.");
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await getStudyPlan(eventId);
      if (cancelled) return;
      if (result.ok) {
        setPlan(result.data.plan);
        setPersisted(result.data.persisted);
        setNotice(result.data.service_notice ?? null);
      } else {
        setError(describeApiError(result.error));
      }
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const save = useCallback(async () => {
    if (!eventId) return;
    setBusy(true);
    setError(null);
    const result = await generateStudyPlan(eventId);
    setBusy(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setPlan(result.data.plan);
    setPersisted(result.data.persisted);
    setNotice(result.data.service_notice ?? null);
  }, [eventId]);

  const toggle = useCallback(
    (dayDate: string, index: number) => {
      const current = plan;
      if (!current) return;
      const done = !current.days.find((day) => day.date === dayDate)?.items[index]?.done;
      setPlan({
        ...current,
        days: current.days.map((day) =>
          day.date === dayDate
            ? { ...day, items: day.items.map((entry, i) => (i === index ? { ...entry, done } : entry)) }
            : day,
        ),
      });
      if (!current.id || !persisted) return;
      void toggleStudyPlanItem(current.id, { day: dayDate, index, done }).then((result) => {
        if (result.ok) setPlan(result.data.plan);
      });
    },
    [plan, persisted],
  );

  const readiness = Math.max(0, Math.min(100, Math.round(Number(plan?.mastery_pct ?? item.masteryPct ?? 0))));
  const kindLabel = EVENT_LABEL[item.kind] || "занятие";
  const totalItems = plan?.days.reduce((sum, day) => sum + day.items.length, 0) ?? 0;
  const doneItems = plan?.days.reduce((sum, day) => sum + day.items.filter((entry) => entry.done).length, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--card)] p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CalendarClock className="h-5 w-5 text-[var(--primary)]" /> План подготовки
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {item.title} · {kindLabel}
              {item.date ? ` · ${item.date.split("-").reverse().join(".")}` : ""}
              {item.daysLeft != null ? ` · через ${item.daysLeft} дн.` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>

        {busy && !plan ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Собираем темы события и освоенность…
          </p>
        ) : error ? (
          <p className="mt-4 text-sm text-[var(--status-critical-fg)]">{error}</p>
        ) : plan ? (
          <>
            <div className="mt-4 rounded-xl border border-[var(--border)] px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">Готовность: {readiness}%</span>
                <span className="text-xs text-[var(--muted)]">
                  {plan.topics.length ? `тем события: ${plan.topics.length}` : "темы не найдены в плане предмета"}
                  {totalItems ? ` · шагов: ${doneItems} из ${totalItems}` : ""}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]">
                <div className={"h-full rounded-full transition-all " + barTone(readiness)} style={{ width: `${readiness}%` }} />
              </div>
              {plan.topics.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {plan.topics.map((topic, index) => (
                    <li
                      key={topic.topic_id || `${topic.title}-${index}`}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                      title={`Освоено ${topic.mastery_pct}%`}
                    >
                      {topic.title} · {topic.mastery_pct}%
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <ol className="mt-4 space-y-3">
              {plan.days.map((day) => (
                <li key={day.date} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary)]">{day.label}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {day.items.map((entry, index) => (
                      <li key={`${day.date}-${index}`} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggle(day.date, index)}
                          aria-pressed={entry.done}
                          aria-label={entry.done ? "Снять отметку" : "Отметить выполненным"}
                          className={
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition " +
                            (entry.done
                              ? "border-transparent bg-[var(--status-ok-fg)] text-white"
                              : "border-[var(--border)] hover:border-[var(--primary)]")
                          }
                        >
                          {entry.done ? "✓" : ""}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={"text-sm " + (entry.done ? "text-[var(--muted)] line-through" : "")}>{entry.title}</p>
                          <p className="text-[11px] text-[var(--muted)]">почему: {entry.why}</p>
                        </div>
                        <Link
                          href={entry.href}
                          className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--primary)]"
                        >
                          Открыть <ArrowRight className="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
              <p className="max-w-sm text-xs text-[var(--muted)]">
                {persisted
                  ? "План сохранён: отметки вернутся при следующем открытии."
                  : notice || "План не сохранён — сохраните, чтобы отметки не терялись."}
              </p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : persisted ? <RefreshCw className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {persisted ? "Пересобрать" : "Сохранить план"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
