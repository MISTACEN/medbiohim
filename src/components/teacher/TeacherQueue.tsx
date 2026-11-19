"use client";

import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

import { OpenAnswersReview } from "@/components/teacher/OpenAnswersReview";

import { chipStyle } from "./model";
import type { TeacherWorkspaceView } from "./useTeacherWorkspace";

/** Вкладка «Работы на проверку»: очередь открытых ответов и мои задания. */
export function TeacherQueue({ tw }: { tw: TeacherWorkspaceView }) {
  const { items, overview, busy, draftFor, patchDraft, submit, load } = tw;
  return (
    <section className="space-y-3" role="tabpanel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Работы на проверку</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Открытые ответы по вашим заданиям. Комментарий обязателен только при возврате.
          </p>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card flex items-center gap-2 p-4 text-sm" style={{ color: "var(--muted)" }}>
          <CheckCircle2 className="h-4 w-4" />
          Новых работ нет — всё проверено.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const draft = draftFor(item.id);
            return (
              <li key={item.id} className="card space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {item.homework_title || "Задание"}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {item.student_name || "Студент"}
                      {item.submitted_at ? ` · ${new Date(item.submitted_at).toLocaleString("ru-RU")}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[11px]" style={chipStyle("info")}>
                    {item.status === "submitted" ? "На проверке" : item.status || "—"}
                  </span>
                </div>

                {item.text_answer ? (
                  <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>
                    {item.text_answer}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Текстового ответа нет — откройте работу в разделе ДЗ.
                  </p>
                )}

                <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)]">
                  <input
                    value={draft.grade}
                    onChange={(event) => patchDraft(item.id, { grade: event.target.value })}
                    inputMode="numeric"
                    placeholder="0…100"
                    aria-label="Оценка"
                    className="rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <input
                    value={draft.comment}
                    onChange={(event) => patchDraft(item.id, { comment: event.target.value })}
                    placeholder="Комментарий (обязателен для возврата)"
                    aria-label="Комментарий"
                    className="min-w-0 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    disabled={busy === item.id}
                    onClick={() => void submit(item.id, "grade")}
                  >
                    {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Оценить
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={busy === item.id}
                    onClick={() => void submit(item.id, "return")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Вернуть на доработку
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {overview?.homeworks?.length ? (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Мои задания
          </h3>
          <ul className="space-y-2">
            {overview.homeworks.map((homework) => (
              <li key={homework.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-medium">{homework.title}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {homework.due_at ? `до ${new Date(homework.due_at).toLocaleDateString("ru-RU")}` : "без срока"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 8.39–8.42: очередь открытых ответов тестов (попытки + сессии подготовки). */}
      <OpenAnswersReview />
    </section>
  );
}
