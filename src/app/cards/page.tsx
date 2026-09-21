"use client";

import { useCallback, useEffect, useState } from "react";
import {
  srsSummary,
  srsDue,
  srsReview,
  srsEnsure,
  type SrsCard,
  type SrsSummary,
} from "@/lib/features-api";
import { Brain, Loader2, RotateCcw, Check, Flame } from "lucide-react";

type Rating = 1 | 2 | 3 | 4;

const RATING_BTNS: Array<{ r: Rating; label: string; hint: string; className: string }> = [
  { r: 1, label: "Снова", hint: "~1 мин", className: "bg-red-500 hover:bg-red-600 text-white" },
  { r: 2, label: "Трудно", hint: "короче", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  { r: 3, label: "Хорошо", hint: "SM-2", className: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { r: 4, label: "Легко", hint: "длиннее", className: "bg-sky-500 hover:bg-sky-600 text-white" },
];

export default function CardsPage() {
  const [summary, setSummary] = useState<SrsSummary | null>(null);
  const [queue, setQueue] = useState<SrsCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(0);
  const [subjectSlug, setSubjectSlug] = useState("");

  const refresh = useCallback(async (slug?: string) => {
    setLoading(true);
    setError(null);
    const [sumRes, dueRes] = await Promise.all([
      srsSummary(),
      srsDue(25, slug || undefined),
    ]);
    setLoading(false);
    if (!sumRes.ok) {
      setError(sumRes.error.message);
      return;
    }
    setSummary(sumRes.data);
    if (dueRes.ok) {
      setQueue(dueRes.data.items || []);
      setIdx(0);
      setFlipped(false);
    } else {
      setError(dueRes.error.message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const card = queue[idx] || null;

  async function loadMore() {
    setBusy(true);
    const res = await srsEnsure(20, subjectSlug || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await refresh(subjectSlug || undefined);
  }

  async function rate(r: Rating) {
    if (!card || busy) return;
    setBusy(true);
    const res = await srsReview(card.id, r);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSummary(res.data.summary);
    setDoneToday((n) => n + 1);
    setFlipped(false);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
    } else {
      await refresh(subjectSlug || undefined);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Загрузка колоды…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Brain className="h-7 w-7 text-[var(--primary)]" />
            Карточки SRS
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Интервальное повторение (SM-2) по всем предметам. Ошибки закрепляются, лёгкое уходит дальше.
          </p>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 font-semibold text-[var(--primary)]">
              К повторению: {summary.due}
            </span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1">
              В колоде: {summary.total}
            </span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1">
              Новых доступно: {summary.new_available}
            </span>
            {doneToday > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
                <Flame className="h-3.5 w-3.5" /> сегодня {doneToday}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          value={subjectSlug}
          onChange={(e) => {
            setSubjectSlug(e.target.value);
            void refresh(e.target.value || undefined);
          }}
        >
          <option value="">Все предметы</option>
          {(summary?.subjects || []).map((s) => (
            <option key={s.subject_slug} value={s.subject_slug}>
              {s.subject} ({s.count})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={busy}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--primary-soft)] disabled:opacity-40"
        >
          +20 новых в колоду
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {!card ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center shadow-sm">
          <Check className="mx-auto h-10 w-10 text-[var(--success)]" />
          <p className="mt-3 font-semibold">На сейчас карточек нет</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Добавьте новые в колоду или зайдите позже — интервалы пересчитаются.
          </p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="mt-4 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Набрать колоду
          </button>
        </div>
      ) : (
        <>
          <div className="text-xs text-[var(--muted)]">
            {idx + 1} / {queue.length}
            {card.subject ? ` · ${card.subject}` : ""}
            {card.topic ? ` · ${card.topic}` : ""}
          </div>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-left shadow-sm transition hover:border-[var(--primary)]/40 min-h-[220px]"
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {flipped ? "Ответ" : "Вопрос"} · нажмите, чтобы перевернуть
            </div>
            <div className="whitespace-pre-wrap text-base leading-relaxed">
              {flipped ? card.back || "— (нет эталонного ответа)" : card.front}
            </div>
          </button>

          {!flipped ? (
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] py-3 text-sm font-semibold hover:bg-[var(--primary-soft)]"
            >
              <RotateCcw className="h-4 w-4" /> Показать ответ
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATING_BTNS.map((b) => (
                <button
                  key={b.r}
                  type="button"
                  disabled={busy}
                  onClick={() => void rate(b.r)}
                  className={`rounded-xl px-3 py-3 text-sm font-semibold shadow disabled:opacity-40 ${b.className}`}
                >
                  <div>{b.label}</div>
                  <div className="text-[10px] font-normal opacity-90">{b.hint}</div>
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-[11px] text-[var(--muted)]">
            Снова → сразу · Трудно → короче интервал · Хорошо / Легко → дальше по SM-2
          </p>
        </>
      )}
    </div>
  );
}
