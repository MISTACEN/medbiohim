"use client";

/**
 * Личный банк вопросов преподавателя (модуль teacher).
 *
 * Вопросы хранятся только у автора (/my-questions, site_content:user_questions)
 * и не попадают в общие банки тестов без отдельной модерации. Текст вопроса
 * пишется с поддержкой химических формул (ChemRichText) — так вопрос выглядит
 * одинаково в редакторе, предпросмотре и на стороне студента.
 */
import { useCallback, useEffect, useState } from "react";
import { HelpCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import {
  createMyQuestion,
  deleteMyQuestion,
  listMyQuestions,
  updateMyQuestion,
} from "@/lib/api/myQuestions";
import { describeApiError } from "@/lib/errors";

type QuestionItem = {
  id: string;
  text: string;
  kind: "single" | "multiple" | "open";
  options: string[];
  answer: string;
  explanation?: string;
  subject_slug?: string;
  topic?: string;
};

type Draft = {
  id: string | null;
  text: string;
  kind: "single" | "multiple" | "open";
  options: string[];
  answer: string;
  explanation: string;
  subject_slug: string;
  topic: string;
};

const EMPTY: Draft = {
  id: null,
  text: "",
  kind: "single",
  options: ["", ""],
  answer: "",
  explanation: "",
  subject_slug: "",
  topic: "",
};

const KIND_LABEL: Record<Draft["kind"], string> = {
  single: "Один ответ",
  multiple: "Несколько ответов",
  open: "Открытый ответ",
};

export function MyQuestionBank() {
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result: any = await listMyQuestions();
    if (result?.ok) setItems(Array.isArray(result.data?.items) ? result.data.items : []);
    else setError(describeApiError(result?.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setOption(index: number, value: string) {
    if (!draft) return;
    setDraft({ ...draft, options: draft.options.map((o, i) => (i === index ? value : o)) });
  }

  function toggleCorrect(index: number) {
    if (!draft) return;
    const current = draft.answer.split(";").map((s) => s.trim()).filter(Boolean);
    const option = draft.options[index];
    if (draft.kind === "single") {
      setDraft({ ...draft, answer: option });
      return;
    }
    const next = current.includes(option) ? current.filter((x) => x !== option) : [...current, option];
    setDraft({ ...draft, answer: next.join("; ") });
  }

  async function save() {
    if (!draft) return;
    if (!draft.text.trim()) {
      setNote("Текст вопроса обязателен");
      return;
    }
    if (draft.kind !== "open" && draft.options.filter((o) => o.trim()).length < 2) {
      setNote("Для теста нужно минимум два варианта ответа");
      return;
    }
    if (draft.kind !== "open" && !draft.answer.trim()) {
      setNote("Отметьте правильный вариант");
      return;
    }
    const payload = {
      text: draft.text,
      kind: draft.kind,
      options: draft.kind === "open" ? [] : draft.options.filter((o) => o.trim()),
      answer: draft.answer,
      explanation: draft.explanation,
      subject_slug: draft.subject_slug || "general",
      topic: draft.topic,
    };
    setBusy("save");
    setNote("");
    const result: any = draft.id
      ? await updateMyQuestion(draft.id, payload)
      : await createMyQuestion(payload);
    setBusy("");
    if (result?.ok) {
      setNote(draft.id ? "Вопрос обновлён" : "Вопрос добавлен в личный банк");
      setDraft(null);
      await load();
    } else {
      setNote(describeApiError(result?.error));
    }
  }

  async function remove(id: string) {
    setBusy("delete-" + id);
    const result: any = await deleteMyQuestion(id);
    setBusy("");
    setNote(result?.ok ? "Вопрос удалён" : describeApiError(result?.error));
    await load();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <HelpCircle className="h-5 w-5 text-indigo-600" /> Личный банк вопросов
        </h2>
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className="btn-secondary inline-flex items-center gap-1">
          <Plus className="h-4 w-4" /> Новый вопрос
        </button>
      </div>

      {note && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{note}</div>}
      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {loading && (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}

      {!loading && !draft && (
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="card p-5 text-sm text-[var(--muted)]">
              Банк пуст. Вопросы из личного банка не попадают к студентам автоматически — их можно использовать в материалах и отправить на модерацию в общий банк.
            </div>
          )}
          {items.map((question) => (
            <div key={question.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{KIND_LABEL[question.kind] || question.kind}</span>
                    {question.topic && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{question.topic}</span>}
                    {question.subject_slug && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{question.subject_slug}</span>}
                  </div>
                  <ChemRichText text={question.text} className="font-medium" />
                  {question.kind !== "open" && (
                    <div className="mt-1 text-sm text-[var(--status-ok-fg)]">Эталон: {question.answer}</div>
                  )}
                  {question.explanation && (
                    <div className="mt-1 text-xs text-[var(--muted)]">Пояснение: {question.explanation}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft({
                      id: question.id,
                      text: question.text,
                      kind: question.kind || "single",
                      options: question.options?.length ? [...question.options] : ["", ""],
                      answer: question.answer || "",
                      explanation: question.explanation || "",
                      subject_slug: question.subject_slug || "",
                      topic: question.topic || "",
                    })}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    title="Редактировать"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy === "delete-" + question.id}
                    onClick={() => void remove(question.id)}
                    className="rounded-lg border border-[var(--status-critical-border)] px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)] disabled:opacity-50"
                    title="Удалить"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="card space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"], answer: "" })}
              className="rounded-xl border p-2 text-sm"
            >
              <option value="single">Один ответ</option>
              <option value="multiple">Несколько ответов</option>
              <option value="open">Открытый ответ</option>
            </select>
            <input
              value={draft.subject_slug}
              onChange={(e) => setDraft({ ...draft, subject_slug: e.target.value })}
              className="rounded-xl border p-2 text-sm"
              placeholder="Предмет (slug), например histology"
            />
            <input
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
              className="rounded-xl border p-2 text-sm"
              placeholder="Тема"
            />
          </div>
          <textarea
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            className="min-h-28 w-full rounded-xl border p-3 text-sm outline-none focus:border-indigo-400"
            placeholder="Текст вопроса. Химические формулы: H2SO4 → H₂SO₄ отображаются у студента."
          />
          <ChemRichText text={draft.text} className="rounded-xl bg-slate-50 p-3 text-sm" />

          {draft.kind !== "open" && (
            <div className="space-y-2">
              {draft.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type={draft.kind === "single" ? "radio" : "checkbox"}
                    name={"correct-" + (draft.id || "new")}
                    checked={draft.answer.split(";").map((s) => s.trim()).includes(option) && Boolean(option.trim())}
                    onChange={() => toggleCorrect(index)}
                    className="mt-0.5"
                    title="Правильный вариант"
                  />
                  <input
                    value={option}
                    onChange={(e) => setOption(index, e.target.value)}
                    className="flex-1 rounded-xl border p-2 text-sm"
                    placeholder={"Вариант " + String.fromCharCode(65 + index)}
                  />
                  {draft.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, options: draft.options.filter((_, i) => i !== index) })}
                      className="rounded-lg border px-2 py-1 text-xs text-slate-500"
                      title="Убрать вариант"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {draft.options.length < 10 && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}
                  className="text-sm font-semibold text-indigo-600 hover:underline"
                >
                  + Добавить вариант
                </button>
              )}
            </div>
          )}

          {draft.kind === "open" && (
            <input
              value={draft.answer}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              className="w-full rounded-xl border p-2 text-sm"
              placeholder="Эталонный ответ (для сверки и ручной проверки)"
            />
          )}

          <textarea
            value={draft.explanation}
            onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
            className="min-h-16 w-full rounded-xl border p-3 text-sm outline-none focus:border-indigo-400"
            placeholder="Пояснение к ответу (необязательно)"
          />

          <div className="flex gap-2">
            <button type="button" disabled={busy === "save"} onClick={() => void save()} className="btn-primary">
              {busy === "save" ? "Сохраняю…" : "Сохранить вопрос"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
