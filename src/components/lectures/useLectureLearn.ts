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
import { useParams } from "next/navigation";
import { generateLectureCloze, getLecture, getLectureCloze, type LectureClozeItem } from "@/lib/api";
import { srsAddCard } from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";
import { isClozeAnswerCorrect } from "@/lib/study/cloze";

export function useLectureLearn() {
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

  return {
    id,
    title,
    items,
    answers,
    setAnswers,
    checked,
    setChecked,
    added,
    loading,
    generating,
    error,
    notice,
    build,
    isRight,
    total,
    checkedCount,
    rightCount,
    wrongIndexes,
    addToCards,
    reset,
  };
}

export type LectureLearnState = ReturnType<typeof useLectureLearn>;
