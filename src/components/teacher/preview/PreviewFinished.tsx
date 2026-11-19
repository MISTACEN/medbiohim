"use client";

import Link from "next/link";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { questionTypeLabelFull } from "@/lib/question-types";

import { optionKey, optionLabel } from "./model";
import type { TeacherPreviewView } from "./useTeacherPreview";

/** Итог предпросмотра: сводка автопроверки и разбор всех вопросов с эталонами. */
export function PreviewFinished({ view }: { view: TeacherPreviewView }) {
  const total = view.questions.length;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Авторский предпросмотр</p>
        <h1 className="page-title">{view.title}</h1>
        <p className="page-subtitle">
          Попытка не создана, статистика не изменилась. Автопроверка: верно {view.stats.correct},
          неверно {view.stats.wrong}, без эталона/вручную {view.stats.unresolved} из {total}.
        </p>
      </div>
      <div className="space-y-3">
        {view.questions.map((question, index) => {
          const verdict = view.verdictFor(question, index);
          const given = view.selection(question.id);
          const labelOf = (key: string) => {
            const i = question.options.findIndex((o, j) => optionKey(o, j) === key);
            return i >= 0 ? `${key}) ${optionLabel(question.options[i])}` : key;
          };
          const etalonKeys = view.normalized[index].correctIndexes.map(String);
          return (
            <div
              key={question.id}
              className={
                "rounded-xl border p-4 text-sm " +
                (verdict === "correct"
                  ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/50"
                  : verdict === "wrong"
                    ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/40"
                    : "border-slate-200 bg-white")
              }
            >
              <div className="text-xs text-slate-500">
                Вопрос {index + 1} · {questionTypeLabelFull(question.type)}
              </div>
              <ChemRichText text={question.text} className="mt-1 font-medium" />
              <div className="mt-2">
                <span className="text-slate-500">Ответ: </span>
                {question.is_closed ? (
                  given.length ? given.map(labelOf).join("; ") : <span className="italic text-slate-400">нет ответа</span>
                ) : (
                  (view.answers[question.id] || "").trim() || <span className="italic text-slate-400">нет ответа</span>
                )}
              </div>
              <div className="mt-1">
                <span className="text-slate-500">Эталон: </span>
                <span className="font-semibold text-[var(--status-ok-fg)]">
                  {question.is_closed
                    ? etalonKeys.map(labelOf).join("; ") || "—"
                    : question.answer_display || question.answer || "—"}
                </span>
              </div>
              {question.answer_resolution ? (
                <div className="mt-1 text-xs text-slate-500">{question.answer_resolution}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={view.restart} className="btn-primary">
          Пройти заново
        </button>
        <Link href="/teacher" className="btn-secondary inline-block">
          В кабинет
        </Link>
      </div>
    </div>
  );
}
