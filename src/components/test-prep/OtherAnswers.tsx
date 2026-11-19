"use client";

/** Нетекстовые ветки ответа: пропуски, соответствия и развёрнутый текст. */
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { optionKey, optionLabel } from "@/components/test-prep/answers";
import type { PreparationController } from "@/components/test-prep/usePreparation";
import type { QuestionView } from "@/components/test-prep/view";

export function ClozeAnswer({ page, view }: { page: PreparationController; view: QuestionView }) {
  const { q, answers, checked, experience, answer, setAnswers } = page;
  const { clozeBlanks, isChecking } = view;

  return (
    <>
      <div className="space-y-2">
        {Array.from({ length: clozeBlanks }, (_, blank) => {
          const parts = (answers[q.id] || "").split(";");
          return (
            <div key={blank} className="flex items-center gap-2">
              <span className="w-16 text-xs font-semibold text-slate-500">Пропуск {blank + 1}</span>
              <input
                value={parts[blank] || ""}
                disabled={!!checked[q.id] || isChecking}
                onChange={(e) => {
                  const nextParts = [...parts];
                  while (nextParts.length < clozeBlanks) nextParts.push("");
                  nextParts[blank] = e.target.value;
                  setAnswers((a) => ({ ...a, [q.id]: nextParts.join(";") }));
                }}
                className="flex-1 rounded-xl border p-2.5 text-sm outline-none focus:border-indigo-400"
                placeholder={"Ответ " + (blank + 1)}
              />
            </div>
          );
        })}
      </div>
      <button
        disabled={!!checked[q.id] || isChecking || !(answers[q.id] || "").trim()}
        onClick={() => void answer(answers[q.id] || "")}
        className="btn-primary"
      >
        {isChecking ? "Проверяем…" : experience === "prepare" ? "Проверить ответ" : "Сохранить ответ"}
      </button>
    </>
  );
}

export function MatchAnswer({ page, view }: { page: PreparationController; view: QuestionView }) {
  const { q, answers, checked, experience, answer, setAnswers } = page;
  const { options, matchRights, isChecking } = view;

  return (
    <>
      <div className="space-y-2">
        {options.map((option, index) => {
          const key = optionKey(option, index);
          const selected = (() => {
            try {
              const parsed = JSON.parse(answers[q.id] || "[]");
              return Array.isArray(parsed) ? String(parsed[index] ?? "") : "";
            } catch { return ""; }
          })();
          return (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="min-w-40 flex-1 text-sm font-medium">
                <ChemRichText text={optionLabel(option)} className="inline" />
              </span>
              <select
                value={selected}
                disabled={!!checked[q.id] || isChecking}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(answers[q.id] || "[]");
                    const next = Array.isArray(parsed) ? [...parsed] : options.map(() => "");
                    while (next.length < options.length) next.push("");
                    next[index] = e.target.value;
                    setAnswers((a) => ({ ...a, [q.id]: JSON.stringify(next) }));
                  } catch {}
                }}
                className="min-w-48 rounded-xl border p-2 text-sm"
              >
                <option value="">— выберите —</option>
                {matchRights.map((right) => (
                  <option key={right} value={right}>{right}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <button
        disabled={!!checked[q.id] || isChecking || !(answers[q.id] || "").trim() || answers[q.id] === "[]"}
        onClick={() => void answer(answers[q.id] || "")}
        className="btn-primary"
      >
        {isChecking ? "Проверяем…" : experience === "prepare" ? "Проверить соответствие" : "Сохранить ответ"}
      </button>
    </>
  );
}

export function OpenAnswer({ page, view }: { page: PreparationController; view: QuestionView }) {
  const { q, answers, checked, experience, answer, setAnswers } = page;
  const { isChecking } = view;

  return (
    <>
      <textarea
        value={answers[q.id] || ""}
        disabled={!!checked[q.id] || isChecking}
        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
        placeholder="Введите свой ответ…"
        className="min-h-40 w-full rounded-xl border p-4 text-sm outline-none focus:border-indigo-400"
      />
      <button
        disabled={!!checked[q.id] || isChecking || !(answers[q.id] || "").trim()}
        onClick={() => void answer(answers[q.id] || "")}
        className="btn-primary"
      >
        {isChecking ? "Проверяем…" : experience === "prepare" ? "Проверить ответ" : "Сохранить ответ"}
      </button>
    </>
  );
}
