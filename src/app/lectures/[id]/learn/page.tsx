"use client";

import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Layers, Loader2, Sparkles } from "lucide-react";
import { ClozeToolbar, ClozeItem } from "@/components/lectures/LearnClozeParts";
import { useLectureLearn } from "@/components/lectures/useLectureLearn";

export default function LectureLearnPage() {
  const page = useLectureLearn();
  const { id, title, items, loading, generating, error, notice, build, wrongIndexes, added, addToCards } = page;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href={`/lectures/${encodeURIComponent(id)}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> К лекции
      </Link>

      <header>
        <h1 className="inline-flex items-center gap-2 text-xl font-extrabold">
          <BookOpenCheck className="h-5 w-5 text-[var(--primary)]" /> Конспект с пропусками
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {title || "Лекция"} · впишите пропущенные термины: проверка мгновенная, ошибки можно сразу отправить в карточки повторения.
        </p>
      </header>

      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем конспект…
        </p>
      ) : page.total === 0 ? (
        <section className="card space-y-3 p-5">
          <p className="text-sm text-[var(--muted)]">
            Для этой лекции пропуски ещё не собраны. ИИ выделит ключевые термины строго из текста лекции —
            пункты, которых нет в тексте дословно, отбрасываются.
          </p>
          <button
            type="button"
            onClick={() => void build()}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "ИИ читает лекцию…" : "Собрать конспект"}
          </button>
        </section>
      ) : (
        <>
          <ClozeToolbar page={page} />

          {notice ? <p className="text-xs text-[var(--muted)]">{notice}</p> : null}
          {error ? <p className="text-sm text-[var(--status-critical-fg)]">{error}</p> : null}

          <ol className="space-y-2">
            {items.map((item, index) => (
              <ClozeItem key={`${index}-${item.answer}`} page={page} index={index} />
            ))}
          </ol>

          {wrongIndexes.length > 0 ? (
            <button
              type="button"
              onClick={() => void Promise.all(wrongIndexes.filter((index) => !added[index]).map((index) => addToCards(index)))}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white"
            >
              <Layers className="h-4 w-4" /> Все ошибки ({wrongIndexes.filter((index) => !added[index]).length}) в карточки
            </button>
          ) : null}
        </>
      )}
    </main>
  );
}
