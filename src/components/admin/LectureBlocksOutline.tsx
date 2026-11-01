"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { adminCreateQuestion, listSubjectsCatalog } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  appendBlock,
  blockQuizIds,
  blockRanges,
  moveBlock,
  removeBlockAt,
  setBlockQuiz,
  updateBlockTitle,
} from "@/lib/lectureBlocks";

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  subjectSlug?: string;
  topic?: string;
};

type Draft = { text: string; options: string[]; correct: number[] };

const EMPTY_DRAFT: Draft = { text: "", options: ["", "", "", ""], correct: [] };

/** Структура лекции для админки: блоки можно создавать, переименовывать,
 *  переставлять, удалять и прикреплять к ним мини-тесты из банка или из
 *  только что созданных вопросов. */
export function LectureBlocksOutline({ value, onChange, subjectSlug, topic }: Props) {
  const blocks = useMemo(() => blockRanges(value), [value]);
  const [subjectId, setSubjectId] = useState("");
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [newTitle, setNewTitle] = useState("");
  const [idsText, setIdsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listSubjectsCatalog()
      .then((r: any) => {
        if (!alive) return;
        if (!r.ok) { setSubjectError(describeApiError(r.error)); return; }
        const item = (r.data?.items || []).find((row: any) => String(row.slug || "") === String(subjectSlug || ""));
        setSubjectId(String(item?.id || ""));
        setSubjectError(item?.id ? null : "У предмета нет id — тест блока не привязать.");
      })
      .catch(() => alive && setSubjectError("Не удалось загрузить предмет"));
    return () => { alive = false; };
  }, [subjectSlug]);

  const active = activeIndex != null ? blocks[activeIndex] : null;

  function commit(next: string) {
    onChange(next);
  }

  async function createQuestion() {
    if (!draft.text.trim() || draft.correct.length === 0) {
      setMsg("Нужен текст вопроса и хотя бы один верный вариант.");
      return;
    }
    setBusy(true);
    const options = draft.options.map((option) => option.trim()).filter(Boolean);
    const answer = draft.correct.join(",");
    const r: any = await adminCreateQuestion({
      text: draft.text.trim(),
      type: "mcq",
      kind: "test",
      subject_slug: subjectSlug || "general",
      topic: topic || undefined,
      options,
      answer,
      is_published: true,
    });
    setBusy(false);
    if (!r.ok) { setMsg(describeApiError(r.error)); return; }
    const id = String(r.data?.question?.id || "");
    if (!id) { setMsg("Вопрос создан, но id не вернулся — вставьте вручную."); return; }
    setIdsText((current) => (current ? current + ", " + id : id));
    setDraft(EMPTY_DRAFT);
    setMsg("Вопрос создан и добавлен в набор теста блока.");
  }

  function applyQuiz(index: number) {
    if (!subjectId) { setMsg(subjectError || "Не удалось определить предмет."); return; }
    const ids = idsText.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
    if (!ids.length) { setMsg("Добавьте хотя бы один id вопроса."); return; }
    commit(setBlockQuiz(value, index, { subjectId, title: "Проверь себя · " + (blocks[index]?.title || ""), questionIds: ids }));
    setMsg("Тест прикреплён к блоку.");
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Структура лекции</h3>
          <p className="text-xs text-[var(--muted)]">Блоки — подтемы, которые студент переключает внутри занятия.</p>
        </div>
        <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--primary)]">
          {blocks.length} блоков
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="Название нового блока, например 3.8. Метаболизм медиаторов"
          className="min-w-[220px] flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => { commit(appendBlock(value, newTitle)); setNewTitle(""); setMsg("Блок добавлен в конец лекции."); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Добавить блок
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {blocks.map((block, index) => {
          const quizIds = blockQuizIds(block);
          const isActive = activeIndex === index;
          return (
            <li key={block.start + "-" + index} className="rounded-xl border border-[var(--border)] p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-5 shrink-0 text-xs font-bold text-[var(--muted)]">{index + 1}</span>
                <input
                  defaultValue={block.title}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next && next !== block.title) commit(updateBlockTitle(value, index, next));
                  }}
                  className="min-w-[180px] flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-sm font-semibold"
                />
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {quizIds.length ? `тест: ${quizIds.length}` : "без теста"}
                </span>
                <button type="button" title="Выше" disabled={index === 0} onClick={() => commit(moveBlock(value, index, -1))} className="rounded-lg border border-[var(--border)] p-1.5 disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Ниже" disabled={index === blocks.length - 1} onClick={() => commit(moveBlock(value, index, 1))} className="rounded-lg border border-[var(--border)] p-1.5 disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Удалить блок" onClick={() => commit(removeBlockAt(value, index))} className="rounded-lg border border-[var(--status-critical-border)] p-1.5 text-[var(--status-critical-fg)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndex(isActive ? null : index);
                    setIdsText(quizIds.join(", "));
                    setMsg(null);
                  }}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold"
                >
                  {isActive ? "Скрыть тест" : "Тест блока"}
                </button>
              </div>

              {isActive && active ? (
                <div className="mt-3 space-y-3 rounded-xl bg-[var(--background)] p-3">
                  <label className="block text-xs font-semibold">
                    ID вопросов (через запятую)
                    <textarea
                      value={idsText}
                      onChange={(event) => setIdsText(event.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 font-mono text-[11px]"
                      placeholder="вставьте id из банка или создайте вопрос ниже"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => applyQuiz(index)}
                    disabled={!subjectId}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Прикрепить тест к этому блоку
                  </button>

                  <div className="rounded-lg border border-dashed border-[var(--border)] p-2.5">
                    <div className="text-xs font-bold">Новый вопрос в банк</div>
                    <textarea
                      value={draft.text}
                      onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                      rows={2}
                      placeholder="Текст вопроса"
                      className="mt-1.5 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
                    />
                    <div className="mt-1.5 grid gap-1.5">
                      {draft.options.map((option, optionIndex) => (
                        <label key={optionIndex} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={draft.correct.includes(optionIndex + 1)}
                            onChange={(event) => setDraft({
                              ...draft,
                              correct: event.target.checked
                                ? [...draft.correct, optionIndex + 1].sort((a, b) => a - b)
                                : draft.correct.filter((value) => value !== optionIndex + 1),
                            })}
                          />
                          <input
                            value={option}
                            onChange={(event) => {
                              const next = [...draft.options];
                              next[optionIndex] = event.target.value;
                              setDraft({ ...draft, options: next });
                            }}
                            placeholder={`Вариант ${optionIndex + 1}`}
                            className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void createQuestion()}
                      disabled={busy}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Создать вопрос и добавить в тест
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
        {blocks.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
            В лекции ещё нет блоков. Добавьте первый — студент увидит его в оглавлении занятия.
          </li>
        )}
      </ol>

      {msg ? <div className="mt-2 text-xs font-semibold text-[var(--primary)]">{msg}</div> : null}
      {subjectError ? <div className="mt-1 text-xs text-[var(--muted)]">{subjectError}</div> : null}
    </section>
  );
}
