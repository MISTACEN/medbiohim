"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  gradeQuestion,
  normalizeQuestion,
} from "@/lib/question-types";
import { testPreview, type PreviewQuestion } from "@/lib/api/teacher";
import { describeApiError } from "@/lib/errors";

import { type Verdict } from "./model";

/**
 * Данные и действия авторского предпросмотра теста: загрузка вопросов,
 * выбор ответов, показ эталона и ручная оценка открытых ответов.
 */
export function useTeacherPreview() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [openVerdicts, setOpenVerdicts] = useState<Record<string, Verdict>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await testPreview(id);
      if (cancelled) return;
      if (result.ok) {
        setTitle(result.data.test.title);
        setSubject(result.data.test.subject_name || "");
        setQuestions(result.data.questions);
      } else {
        setError(describeApiError(result.error));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const normalized = useMemo(
    () =>
      questions.map((q) =>
        normalizeQuestion(
          { type: q.type, text: q.text, answer: q.answer || "", options: q.options },
          { reveal: true },
        ),
      ),
    [questions],
  );

  const q = questions[idx];
  const norm = normalized[idx];

  function selection(qid: string): string[] {
    const value = answers[qid];
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    return [];
  }

  function toggleOption(key: string) {
    if (!q || revealed[q.id]) return;
    const current = selection(q.id);
    const isMulti = q.allow_multiple || q.requires_order;
    const next = isMulti
      ? current.includes(key)
        ? current.filter((x) => x !== key)
        : [...current, key]
      : [key];
    setAnswers((a) => ({ ...a, [q.id]: JSON.stringify(next) }));
  }

  function checkCurrent() {
    if (!q) return;
    setRevealed((r) => ({ ...r, [q.id]: true }));
  }

  function verdictFor(question: PreviewQuestion, index: number): Verdict {
    const given = answers[question.id];
    if (!revealed[question.id] && !given) return "unresolved";
    const outcome = gradeQuestion(normalized[index], given || null);
    if (outcome.isCorrect == null) return openVerdicts[question.id] || "unresolved";
    return outcome.isCorrect ? "correct" : "wrong";
  }

  const stats = useMemo(() => {
    const counts = { correct: 0, wrong: 0, unresolved: 0 };
    questions.forEach((question, index) => {
      counts[verdictFor(question, index)] += 1;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, revealed, openVerdicts]);

  function restart() {
    setAnswers({});
    setRevealed({});
    setOpenVerdicts({});
    setIdx(0);
    setFinished(false);
  }

  return {
    loading, error, title, subject,
    questions, normalized, idx, setIdx,
    answers, setAnswers, revealed, openVerdicts, setOpenVerdicts,
    finished, setFinished, q, norm,
    selection, toggleOption, checkCurrent, verdictFor, stats, restart,
  };
}

export type TeacherPreviewView = ReturnType<typeof useTeacherPreview>;
