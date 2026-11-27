"use client";

/**
 * История практики: серии диагностикума и старые тренировки в одном списке.
 *
 * Раньше это были две разные истории: серии экзамена не показывались нигде после
 * финиша, а карточные тренировки жили отдельно. Здесь они рядом, с пометкой
 * источника, но разбор открывается родной для каждой: серия — своим разбором,
 * тренировка — экраном результата.
 */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import {
  getDiagnosticumSession,
  getDiagnosticumSessions,
  type DiagnosticumSessionItem,
  type DiagnosticumSessionSummary,
} from "@/lib/diagnosticum-api";
import { historyLabel } from "@/components/trainers/HistologyTrainerParts";
import type { Training } from "@/lib/content-api";

type TrainerHistoryProps = {
  /** Старые тренировки: приходят из родителя, чтобы не грузить их дважды. */
  sessions: Training[];
  onResume: (id: string) => void;
  onReview: (id: string) => void;
  onCancel: (id: string) => void;
};

/** Подписи правильных вариантов из разбора серии (эталон уже раскрыт сервером). */
function correctLabels(item: DiagnosticumSessionItem): string[] {
  const labels = new Map<string, string>();
  for (const part of item.question.parts ?? []) {
    for (const option of part.options) labels.set(`${part.id}:${option.id}`, option.label);
  }
  const out: string[] = [];
  for (const [partId, key] of Object.entries(item.answers ?? {})) {
    const names = (key.correct ?? []).map((id) => labels.get(`${partId}:${id}`) ?? "").filter(Boolean);
    if (names.length) out.push(names.join(", "));
  }
  return out;
}

export function TrainerHistory({ sessions, onResume, onReview, onCancel }: TrainerHistoryProps) {
  const [extra, setExtra] = useState<DiagnosticumSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<DiagnosticumSessionItem[]>([]);

  useEffect(() => {
    let alive = true;
    void getDiagnosticumSessions()
      .then((res) => {
        if (!alive) return;
        if (res.ok) setExtra(res.data.items || []);
        else setError(describeApiError(res.error));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(sessionId: string) {
    if (openId === sessionId) {
      setOpenId(null);
      return;
    }
    setOpenId(sessionId);
    setItems([]);
    const res = await getDiagnosticumSession(sessionId);
    if (res.ok) setItems(res.data.items || []);
    else setError(describeApiError(res.error));
  }

  const total = sessions.length + extra.length;
  const visibleLegacy = expanded ? sessions : sessions.slice(0, 4);
  const visibleSeries = expanded ? extra : extra.slice(0, 4);

  return (
    <details className="card p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-bold text-slate-800">
        История практики · {total}
      </summary>
      {error ? <p className="mt-2 text-sm text-[var(--status-critical-fg)]">{error}</p> : null}

      <div className="mt-3 space-y-2">
        {visibleSeries.map((item) => (
          <div key={item.session_id} className="rounded-xl border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="mr-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                  серия
                </span>
                {item.title}
                {item.section ? ` · ${item.section}` : ""} · {item.total} вопр.
                {item.score != null ? ` · ${item.score} б.` : ""}
                {item.status !== "finished" ? " · не завершена" : ""}
              </span>
              <div className="flex gap-2">
                {item.status === "finished" ? (
                  <button
                    type="button"
                    onClick={() => void toggle(item.session_id)}
                    className="rounded-lg border px-2 py-1"
                  >
                    {openId === item.session_id ? "Скрыть" : "Разбор"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">продолжите в тренажёре</span>
                )}
              </div>
            </div>
            {openId === item.session_id ? (
              <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-slate-600">
                {items.map((entry) => {
                  const labels = correctLabels(entry);
                  return (
                    <li key={entry.attempt_id}>
                      <span className="font-semibold text-slate-800">
                        {entry.index + 1}.{" "}
                        {entry.correct ? "верно" : entry.answered ? "ошибка" : "пропуск"} ·{" "}
                        {entry.score ?? 0} б.
                      </span>
                      {!entry.correct && labels.length ? (
                        <span className="block">Верно: {labels.join(" · ")}</span>
                      ) : null}
                    </li>
                  );
                })}
                {!items.length ? <li>Загружаю разбор…</li> : null}
              </ul>
            ) : null}
          </div>
        ))}

        {visibleLegacy.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
            <span>
              <span className="mr-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                тренировка
              </span>
              {historyLabel(t)} · {t.content_type || "all"} · {t.answered_count || 0}/
              {t.total_questions || t.question_count}
            </span>
            <div className="flex gap-2">
              {t.status === "in_progress" ? (
                <button type="button" onClick={() => onResume(t.id)} className="rounded-lg border px-2 py-1">
                  Продолжить
                </button>
              ) : null}
              {t.status === "completed" ? (
                <button type="button" onClick={() => onReview(t.id)} className="rounded-lg border px-2 py-1">
                  Разбор
                </button>
              ) : null}
              {t.status === "in_progress" ? (
                <button
                  type="button"
                  onClick={() => onCancel(t.id)}
                  className="rounded-lg border px-2 py-1 text-[var(--status-critical-fg)]"
                >
                  Отменить
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {total > 4 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-sm text-indigo-600"
        >
          {expanded ? "Свернуть" : "Показать ещё"} <ChevronDown className="inline h-4 w-4" />
        </button>
      ) : null}
    </details>
  );
}
