"use client";

/**
 * «Карточка дня» — одно повторение за 30 секунд прямо на /study.
 * Карточка берётся из очереди SRS (самая срочная), оценка уходит обычным
 * /srs/review: отдельного хранилища нет, прогресс тот же, что в /cards.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, RotateCcw, Sparkles, ThumbsUp } from "lucide-react";
import { srsDue, srsReview, type SrsCard } from "@/lib/features-api";

export function DailyCard() {
  const [card, setCard] = useState<SrsCard | null>(null);
  const [dueLeft, setDueLeft] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const loadNext = useCallback(async () => {
    const response = await srsDue(1);
    if (!response.ok) {
      setCard(null);
      setLoading(false);
      return;
    }
    const next = response.data?.items?.[0] ?? null;
    setCard(next);
    setRevealed(false);
    setDone(!next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  async function rate(rating: 1 | 3) {
    if (!card || busy) return;
    setBusy(true);
    const response = await srsReview(card.id, rating);
    setBusy(false);
    if (response.ok) {
      const summary = response.data?.summary;
      if (summary && typeof summary.due === "number") setDueLeft(summary.due);
    }
    await loadNext();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Карточка дня…
      </div>
    );
  }

  if (done || !card) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex items-center gap-2 font-bold">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" /> Карточка дня
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          На сейчас очередь пуста — всё повторено. Можно взять карточки заранее.
        </p>
        <Link href="/cards" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">
          Открыть карточки <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" /> Карточка дня
        </div>
        {dueLeft != null ? <span className="text-xs text-[var(--muted)]">в очереди: {dueLeft}</span> : null}
      </div>

      <div className="mt-3 rounded-xl border border-[var(--border)] bg-slate-50/60 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {card.subject || "Предмет"}{card.topic ? ` · ${card.topic}` : ""}
        </p>
        <p className="mt-1 text-sm font-semibold leading-relaxed">{card.front}</p>
        {revealed ? (
          <p className="mt-2 border-t border-[var(--border)] pt-2 text-sm leading-relaxed text-[var(--muted)]">{card.back}</p>
        ) : null}
      </div>

      {revealed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary h-9 gap-1.5 px-3 text-xs" disabled={busy} onClick={() => void rate(1)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Не помню
          </button>
          <button type="button" className="btn-primary h-9 gap-1.5 px-3 text-xs" disabled={busy} onClick={() => void rate(3)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />} Помню
          </button>
        </div>
      ) : (
        <button type="button" className="mt-3 h-9 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold" onClick={() => setRevealed(true)}>
          Показать ответ
        </button>
      )}
    </div>
  );
}
