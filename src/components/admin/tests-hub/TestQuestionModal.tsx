"use client";

import { Check, CheckCircle2, Plus, Trash2, X } from "lucide-react";

import { Button, Modal } from "@/components/ui";
import { QUESTION_TYPES } from "./model";
import type { QuestionDraft } from "./model";
import type { TestQuestionsController } from "./useTestQuestions";

type Props = {
  page: TestQuestionsController;
  draft: QuestionDraft;
};

/** Модальное окно полного редактирования вопроса: текст, варианты, тип, привязки. */
export function TestQuestionModal({ page, draft }: Props) {
  const {
    subjects, modules, topics,
    setDraft, patchDraft, setType, addOption, removeOption, updateOption,
    error, busy, save,
  } = page;

  return (
    <Modal
      open
      onClose={() => setDraft(null)}
      closeOnBackdrop={false}
      size="xl"
      labelledBy="edit-question-title"
      className="max-h-[92vh] overflow-y-auto"
    >
        <div className="flex items-start justify-between gap-3">
          <h2 id="edit-question-title" className="text-lg font-bold">Редактирование вопроса</h2>
          <Button variant="secondary" size="sm" icon={X} aria-label="Закрыть" className="px-2 py-2" onClick={() => setDraft(null)} />
        </div>

        {error && <div className="mt-3 rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

        <label className="mt-4 block text-sm">
          Текст вопроса
          <textarea
            className="input mt-1 min-h-32 w-full"
            value={draft.text}
            onChange={(e) => patchDraft({ text: e.target.value })}
          />
        </label>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Тип вопроса
            <select className="input mt-1 w-full" value={draft.type} onChange={(e) => setType(e.target.value)}>
              {QUESTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Сложность (1–5)
            <input
              className="input mt-1 w-full"
              type="number" min={1} max={5}
              value={draft.difficulty}
              onChange={(e) => patchDraft({ difficulty: e.target.value })}
              placeholder="не задана"
            />
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={draft.is_published} onChange={(e) => patchDraft({ is_published: e.target.checked })} />
            Опубликован
          </label>
        </div>

        {(draft.type === "mcq" || draft.type === "multiple" || draft.type === "ordering") && (
          <section className="mt-4 rounded-2xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">
                Варианты ответа
                {draft.type === "ordering" && <span className="ml-2 text-xs font-normal text-slate-500">порядок правильного ответа задаётся в поле «Ответ» ниже</span>}
              </div>
              <button type="button" className="rounded-xl border bg-slate-50 px-3 py-1.5 text-xs font-bold" onClick={addOption}>
                <Plus className="mr-1 inline h-3.5 w-3.5" />Добавить вариант
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {draft.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  {draft.type !== "ordering" && (
                    <button
                      type="button"
                      role={draft.type === "mcq" ? "radio" : "checkbox"}
                      aria-checked={option.correct}
                      aria-label={"Пометить вариант " + (index + 1) + " правильным"}
                      className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold transition " + (option.correct ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50")}
                      onClick={() => updateOption(index, { correct: !option.correct })}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <span className="w-6 shrink-0 text-center text-xs text-slate-400">{index + 1}</span>
                  <input
                    className="input min-w-0 flex-1"
                    value={option.label}
                    placeholder={"Текст варианта " + (index + 1)}
                    onChange={(e) => updateOption(index, { label: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={"Удалить вариант " + (index + 1)}
                    className="rounded-lg bg-[var(--status-critical-bg)] p-2 text-[var(--status-critical-fg)]"
                    onClick={() => removeOption(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {!draft.options.length && (
                <div className="rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">Вариантов нет — добавьте хотя бы два.</div>
              )}
            </div>
          </section>
        )}

        <label className="mt-4 block text-sm">
          Правильный ответ / объяснение
          <textarea
            className="input mt-1 min-h-20 w-full"
            value={draft.answer}
            placeholder={draft.type === "open" ? "Эталон ответа и пояснение для проверки" : "Например: 2 или пояснение к правильным вариантам"}
            onChange={(e) => patchDraft({ answer: e.target.value })}
          />
        </label>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            className="input"
            aria-label="Предмет"
            value={draft.subject_id}
            onChange={(e) => patchDraft({ subject_id: e.target.value, module_id: "", topic_id: "" })}
          >
            {subjects.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}
          </select>
          <select
            className="input"
            aria-label="Модуль"
            value={draft.module_id}
            onChange={(e) => patchDraft({ module_id: e.target.value, topic_id: "" })}
          >
            <option value="">Без модуля</option>
            {modules.filter((row) => String(row.subject_id) === draft.subject_id).map((row) => (
              <option key={String(row.id)} value={String(row.id)}>{String(row.title)}</option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Тема"
            value={draft.topic_id}
            onChange={(e) => patchDraft({ topic_id: e.target.value })}
          >
            <option value="">Без темы</option>
            {topics.filter((row) => String(row.module_id) === draft.module_id).map((row) => (
              <option key={String(row.id)} value={String(row.id)}>{String(row.title)}</option>
            ))}
          </select>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDraft(null)}>Отмена</Button>
          <Button icon={CheckCircle2} loading={busy === "save"} onClick={() => void save()}>Сохранить</Button>
        </div>
    </Modal>
  );
}
