"use client";

/**
 * Интерактивный конспект лекции (Фаза 4 дорожной карты): текст с пропусками по
 * ключевым терминам, мгновенная проверка и отправка ошибок в карточки SRS.
 *
 * Пункты приходят с сервера только как дословные цитаты (`before + answer +
 * after` из текста лекции), поэтому проверка честная: сравниваем ответ с
 * термином из лекции, а не с формулировкой модели.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpenCheck, CheckCircle2, Layers, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { generateLectureCloze, getLecture, getLectureCloze, type LectureClozeItem } from "@/lib/api";
import { srsAddCard } from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";
import { isClozeAnswerCorrect } from "@/lib/study/cloze";

export default function LectureLearnPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const [title, setTitle] = useState("");
  const [subjectSlug, setSubjectSlug] = useState("");
  const [items, setItems] = useState<LectureClozeItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const lecture = await getLecture(id);
      if (!cancelled && lecture?.ok) {
        const row = lecture.data?.lecture || lecture.data || null;
        setTitle(String(row?.title || ""));
        setSubjectSlug(String(row?.subject_slug || ""));
      }
      const cached = await getLectureCloze(id);
      if (cancelled) return;
      if (cached.ok) setItems(cached.data.items || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const build = useCallback(async () => {
    if (!id || generating) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    const result = await generateLectureCloze(id);
    setGenerating(false);
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setItems(result.data.items || []);
    if (result.data.cached) setNotice("Конспект взят из кэша.");
  }, [id, generating]);

  const isRight = useCallback(
    (index: number) => isClozeAnswerCorrect(answers[index] || "", items[index]?.answer || ""),
    [answers, items],
  );

  const total = items.length;
  const checkedCount = Object.keys(checked).length;
  const rightCount = useMemo(
    () => items.reduce((sum, _item, index) => sum + (checked[index] && isRight(index) ? 1 : 0), 0),
    [items, checked, isRight],
  );
  const wrongIndexes = useMemo(
    () => items.map((_item, index) => index).filter((index) => checked[index] && !isRight(index)),
    [items, checked, isRight],
  );

  const addToCards = useCallback(
    async (index: number) => {
      const item = items[index];
      if (!item) return;
      const result = await srsAddCard({
        front: `${item.before} ___ ${item.after}`.replace(/\s+/g, " ").trim().slice(0, 300),
        back: item.answer,
        subject_slug: subjectSlug || undefined,
        topic: title || undefined,
      });
      if (!result.ok) {
        setError(describeApiError(result.error));
        return;
      }
      setAdded((current) => ({ ...current, [index]: true }));
    },
    [items, subjectSlug, title],
  );

  function reset() {
    setAnswers({});
    setChecked({});
    setNotice(null);
    setError(null);
  }

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
      ) : total === 0 ? (
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
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs">
            <span className="font-semibold">
              Заполнено: {checkedCount} из {total} · верно {rightCount}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setChecked(Object.fromEntries(items.map((_item, index) => [index, true])))}
                className="rounded-full bg-[var(--primary)] px-3 py-1.5 font-semibold text-white"
              >
                Проверить
              </button>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 font-semibold">
                <RotateCcw className="h-3.5 w-3.5" /> Сбросить
              </button>
            </div>
          </div>

          {notice ? <p className="text-xs text-[var(--muted)]">{notice}</p> : null}
          {error ? <p className="text-sm text-[var(--status-critical-fg)]">{error}</p> : null}

          <ol className="space-y-2">
            {items.map((item, index) => {
              const isChecked = checked[index] === true;
              const correct = isChecked && isRight(index);
              return (
                <li key={`${index}-${item.answer}`} className="rounded-xl border border-[var(--border)] px-3 py-2.5">
                  <p className="text-sm leading-7">
                    {item.before}{" "}
                    <input
                      value={answers[index] || ""}
                      onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))}
                      disabled={isChecked}
                      placeholder={item.hint}
                      aria-label={`Пропуск ${index + 1}`}
                      className={
                        "mx-1 w-40 rounded-lg border px-2 py-1 text-sm outline-none " +
                        (isChecked
                          ? correct
                            ? "border-[var(--status-ok-fg)] bg-[var(--status-ok-bg)]"
                            : "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)]"
                          : "border-[var(--border)] bg-[var(--background)] focus:ring-2 focus:ring-[var(--primary)]/30")
                      }
                    />{" "}
                    {item.after}
                  </p>
                  {isChecked ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      {correct ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--status-ok-fg)]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Верно
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 font-semibold text-[var(--status-critical-fg)]">
                            <XCircle className="h-3.5 w-3.5" /> Термин: {item.answer}
                          </span>
                          <button
                            type="button"
                            onClick={() => void addToCards(index)}
                            disabled={added[index]}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)]/40 px-2.5 py-1 font-semibold text-[var(--primary)] disabled:opacity-50"
                          >
                            <Layers className="h-3 w-3" /> {added[index] ? "В карточках" : "В карточки"}
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
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
