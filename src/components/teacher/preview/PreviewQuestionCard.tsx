"use client";

import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { displayOptionEntries } from "@/components/questions/optionOrder";
import { gradeQuestion, questionTypeLabelFull } from "@/lib/question-types";

import { optionKey, optionLabel } from "./model";
import type { TeacherPreviewView } from "./useTeacherPreview";

/** Карточка текущего вопроса предпросмотра: варианты, эталон и навигация. */
export function PreviewQuestionCard({ view }: { view: TeacherPreviewView }) {
  const q = view.q;
  const norm = view.norm;
  if (!q || !norm) return null;

  const isMulti = q.allow_multiple || q.requires_order;
  const isRevealed = view.revealed[q.id];
  const outcome = isRevealed ? gradeQuestion(norm, view.answers[q.id] || null) : null;
  const selectedKeys = view.selection(q.id);
  const correctKeys = new Set(norm.correctIndexes.map((i) => optionKey(q.options[i], i)));

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-indigo-600 px-2 text-sm font-extrabold text-white">
          {String(view.idx + 1).padStart(2, "0")}
        </span>
        <div>
          <div className="text-sm font-bold text-slate-700">{questionTypeLabelFull(q.type)}</div>
          {q.topic_title && <div className="text-xs text-slate-400">{q.topic_title}</div>}
        </div>
      </div>
      <ChemRichText text={q.text} className="text-lg font-semibold" />

      {q.is_closed ? (
        <div className="space-y-2">
          {/* Показ перемешан как у студента; ключи — из исходного порядка. */}
          {displayOptionEntries(q, q.options, optionKey).map(({ option, key, index }) => {
            const selected = selectedKeys.includes(key);
            const isCorrectOption = isRevealed && correctKeys.has(key);
            const position = q.requires_order && selected ? selectedKeys.indexOf(key) + 1 : null;
            return (
              <AnswerOption
                key={key + "-" + index}
                as="label"
                variant="choice"
                state={
                  isRevealed
                    ? isCorrectOption
                      ? "correct"
                      : selected
                        ? "wrong"
                        : "idle"
                    : selected
                      ? "selected"
                      : "idle"
                }
                badge={position ?? key}
                badgeVariant="square"
                leading={
                  <input
                    type={isMulti ? "checkbox" : "radio"}
                    name={"preview-" + q.id}
                    checked={selected}
                    disabled={isRevealed}
                    onChange={() => view.toggleOption(key)}
                    className="mt-1"
                  />
                }
                trailing={
                  isCorrectOption ? (
                    <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--status-ok-fg)]">эталон</span>
                  ) : null
                }
              >
                <ChemRichText text={optionLabel(option)} className="flex-1 space-y-1" />
              </AnswerOption>
            );
          })}
        </div>
      ) : (
        <textarea
          value={view.answers[q.id] || ""}
          disabled={isRevealed}
          onChange={(e) => view.setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
          placeholder="Введите ответ, чтобы сверить его с эталоном…"
          className="min-h-40 w-full rounded-xl border p-4 text-sm outline-none focus:border-indigo-400"
        />
      )}

      {isRevealed && (
        <div className="rounded-xl bg-[var(--status-ok-bg)] p-4 text-[var(--status-ok-fg)]">
          <div className="font-semibold">Эталон</div>
          <div className="mt-1">
            <ChemRichText
              text={q.is_closed
                ? norm.correctIndexes.map((i) => optionKey(q.options[i], i)).join(", ")
                : q.answer_display || q.answer || "—"}
              asHtml={!q.is_closed}
            />
          </div>
          {q.answer_resolution && <div className="mt-1 text-sm opacity-80">{q.answer_resolution}</div>}
          {outcome?.isCorrect == null && !q.is_closed && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => view.setOpenVerdicts((v) => ({ ...v, [q.id]: "correct" }))}
                className="rounded-lg border border-[var(--status-ok-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-ok-fg)]"
              >
                Я оцениваю ответ как верный
              </button>
              <button
                type="button"
                onClick={() => view.setOpenVerdicts((v) => ({ ...v, [q.id]: "wrong" }))}
                className="rounded-lg border border-[var(--status-critical-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)]"
              >
                Как неверный
              </button>
            </div>
          )}
          {outcome?.isCorrect != null && (
            <div className={"mt-2 text-sm font-semibold " + (outcome.isCorrect ? "" : "text-[var(--status-critical-fg)]")}>
              {outcome.isCorrect ? "✓ Ответ совпал с эталоном" : "✗ Ответ не совпал с эталоном"}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          disabled={view.idx === 0}
          onClick={() => view.setIdx((i) => i - 1)}
          className="rounded-xl border px-4 py-2"
        >
          Назад
        </button>
        <div className="flex gap-2">
          {!isRevealed && (
            <button type="button" onClick={view.checkCurrent} className="btn-secondary">
              Показать эталон
            </button>
          )}
          {view.idx < view.questions.length - 1 ? (
            <button
              type="button"
              disabled={!isRevealed}
              onClick={() => view.setIdx((i) => i + 1)}
              className="btn-primary"
            >
              Следующий
            </button>
          ) : (
            <button type="button" disabled={!isRevealed} onClick={() => view.setFinished(true)} className="btn-primary">
              Завершить предпросмотр
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
