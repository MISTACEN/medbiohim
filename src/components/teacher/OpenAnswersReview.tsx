"use client";

/**
 * 8.39–8.42: очередь ручной проверки открытых ответов тестов.
 *
 * Показывает ответы студентов (попытки назначенных тестов и сессии подготовки),
 * оставленные движком на ручную проверку. Преподаватель видит эталон, ответ
 * студента и выносит вердикт «зачтено / не зачтено» с комментарием; для попыток
 * сервер пересчитывает балл попытки.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import { listOpenAnswers, reviewOpenAnswer, type OpenAnswerItem } from "@/lib/api/teacher";

export function OpenAnswersReview() {
  const [items, setItems] = useState<OpenAnswerItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError("");
    const result = await listOpenAnswers();
    if (result.ok) {
      setItems(result.data.items);
    } else {
      setError(describeApiError(result.error));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function verdict(item: OpenAnswerItem, isCorrect: boolean) {
    setBusy(item.kind + ":" + item.id);
    setNote("");
    const result = await reviewOpenAnswer({
      kind: item.kind,
      id: item.id,
      is_correct: isCorrect,
      feedback: notes[item.id] || undefined,
    });
    setBusy("");
    if (result.ok) {
      setNote(isCorrect
        ? `Зачтено: ${item.user_name} · ${item.test_title ?? "тест"}`
        : `Не зачтено: ${item.user_name} · ${item.test_title ?? "тест"}`);
      setItems((current) => current.filter((x) => !(x.kind === item.kind && x.id === item.id)));
    } else {
      setNote(describeApiError(result.error));
    }
  }

  return (
    <section className="space-y-3" aria-label="Открытые ответы тестов">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">Открытые ответы тестов</h3>
        <button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Обновить
        </button>
      </div>

      {note && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{note}</div>}
      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      {!loaded && (
        <div className="flex items-center gap-2 p-4 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}

      {loaded && items.length === 0 && (
        <div className="card p-4 text-sm text-[var(--muted)]">
          Открытых ответов, ожидающих проверки, нет. Здесь появятся ответы студентов по вашим тестам,
          которые движок не смог оценить автоматически.
        </div>
      )}

      {items.map((item) => (
        <div key={item.kind + "-" + item.id} className="card space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{item.user_name}</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{item.test_title ?? "тест"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {item.kind === "attempt" ? "попытка назначения" : "сессия подготовки"}
            </span>
            {item.answered_at && (
              <span className="text-[var(--muted)]">{new Date(item.answered_at).toLocaleString("ru-RU")}</span>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="font-semibold">{item.question_text}</div>
            {item.etalon && (
              <div className="mt-1 text-xs text-[var(--status-ok-fg)]">Эталон: {item.etalon}</div>
            )}
            <div className="mt-2 whitespace-pre-wrap">{item.student_answer || "—"}</div>
          </div>
          <input
            type="text"
            value={notes[item.id] ?? ""}
            onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
            className="w-full rounded-xl border p-2 text-sm"
            placeholder="Комментарий студенту (необязательно)"
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === item.kind + ":" + item.id}
              onClick={() => void verdict(item, true)}
              className="btn-primary inline-flex items-center gap-1.5 text-sm"
            >
              <Check className="h-4 w-4" /> Зачесть
            </button>
            <button
              type="button"
              disabled={busy === item.kind + ":" + item.id}
              onClick={() => void verdict(item, false)}
              className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              <X className="h-4 w-4" /> Не зачесть
            </button>
            {busy === item.kind + ":" + item.id && <Loader2 className="h-4 w-4 animate-spin self-center" />}
          </div>
        </div>
      ))}
    </section>
  );
}
