"use client";

/**
 * Ручная проверка открытых ответов (кабинет 8.39–8.42).
 *
 * Очередь: ответы, которые движок не смог оценить автоматически, по тестам,
 * видимым учителю (свои created_by или подключённые админом teacher_visible).
 * Вердикт пишется grading_source=manual — студент видит его в обычном разборе.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import {
  gradeOpenAnswer,
  teacherGradingQueue,
  type OpenAnswerItem,
} from "@/lib/api/teacher";

export function OpenAnswerGrading() {
  const [items, setItems] = useState<OpenAnswerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await teacherGradingQueue();
    if (result.ok) setItems(result.data.items);
    else setError(describeApiError(result.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function verdict(item: OpenAnswerItem, isCorrect: boolean) {
    setBusy(item.id + String(isCorrect));
    setNote("");
    const result = await gradeOpenAnswer(item.id, isCorrect, feedback[item.id] ?? null);
    setBusy("");
    if (result.ok) {
      setNote(isCorrect ? `Зачтено: ${item.student_name}` : `Не зачтено: ${item.student_name}`);
      setItems((rows) => rows.filter((row) => row.id !== item.id));
    } else {
      setNote(describeApiError(result.error));
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Проверка открытых ответов</h2>
        <button type="button" onClick={() => void load()} className="btn-secondary text-xs inline-flex items-center gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Обновить
        </button>
      </div>

      {note && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{note}</div>}
      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {loading && (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="card p-5 text-sm text-[var(--muted)]">
          Очередь пуста — все открытые ответы оценены движком или уже проверены.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="card space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{item.student_name}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">{item.test_title || "Тест"}</span>
                </div>
                {item.answered_at && (
                  <span className="text-xs text-[var(--muted)]">
                    {new Date(item.answered_at).toLocaleString("ru-RU")}
                  </span>
                )}
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-500">Вопрос</div>
                <div className="mt-0.5">{item.question_text || "—"}</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] p-3">
                <div className="text-xs font-semibold text-slate-500">Ответ студента</div>
                <div className="mt-0.5 whitespace-pre-wrap">{item.student_answer || "—"}</div>
              </div>
              <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/40 p-3">
                <div className="text-xs font-semibold text-[var(--status-ok-fg)]">Эталон</div>
                <div className="mt-0.5 whitespace-pre-wrap">{item.etalon || "—"}</div>
              </div>
              <input
                value={feedback[item.id] || ""}
                onChange={(e) => setFeedback((f) => ({ ...f, [item.id]: e.target.value }))}
                className="w-full rounded-xl border p-2 text-sm"
                placeholder="Комментарий студенту (необязательно)"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === item.id + "true"}
                  onClick={() => void verdict(item, true)}
                  className="btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" /> Зачесть
                </button>
                <button
                  type="button"
                  disabled={busy === item.id + "false"}
                  onClick={() => void verdict(item, false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--status-critical-border)] px-4 py-2 text-sm font-semibold text-[var(--status-critical-fg)] disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" /> Не зачесть
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
