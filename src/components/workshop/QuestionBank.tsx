"use client";

/**
 * Личный банк вопросов: автор собирает свои вопросы для тестов и тренируется
 * по ним. Вопросы хранятся отдельно от общего банка кафедры и видны только
 * владельцу — публикация в общие тесты остаётся модерацией.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import {
  createMyQuestion,
  deleteMyQuestion,
  listMyQuestions,
  updateMyQuestion,
  type MyBankQuestion,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

const KIND_LABEL: Record<MyBankQuestion["kind"], string> = {
  single: "Один ответ",
  multiple: "Несколько ответов",
  open: "Открытый ответ",
};

const EMPTY_FORM = {
  text: "",
  kind: "single" as MyBankQuestion["kind"],
  topic: "",
  options: ["", "", "", ""],
  answer: "",
  explanation: "",
};

export default function QuestionBank() {
  const [questions, setQuestions] = useState<MyBankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [practice, setPractice] = useState<{ index: number; picked: string; checked: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    void listMyQuestions().then((result: any) => {
      if (!alive) return;
      if (result?.ok) setQuestions((result.data?.items || []) as MyBankQuestion[]);
      else setError(describeApiError(result?.error));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return questions;
    return questions.filter((item) => `${item.text} ${item.topic || ""}`.toLowerCase().includes(needle));
  }, [questions, query]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function submit() {
    const options = form.options.map((option) => option.trim()).filter(Boolean);
    if (!form.text.trim()) {
      setError("Напишите текст вопроса");
      return;
    }
    if (form.kind !== "open" && options.length < 2) {
      setError("Для теста нужно минимум два варианта ответа");
      return;
    }
    if (form.kind !== "open" && !form.answer.trim()) {
      setError("Укажите правильный ответ");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    const payload = {
      text: form.text.trim(),
      kind: form.kind,
      topic: form.topic.trim(),
      options: form.kind === "open" ? [] : options,
      answer: form.answer.trim(),
      explanation: form.explanation.trim(),
    };
    const result: any = editingId
      ? await updateMyQuestion(editingId, payload)
      : await createMyQuestion(payload);
    setBusy(false);
    if (!result?.ok) {
      setError(describeApiError(result?.error));
      return;
    }
    const saved = result.data?.question as MyBankQuestion;
    setQuestions((items) =>
      editingId ? items.map((item) => (item.id === editingId ? saved : item)) : [saved, ...items]
    );
    setNote(editingId ? "Вопрос обновлён." : "Вопрос добавлен в личный банк.");
    resetForm();
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    const result: any = await deleteMyQuestion(id);
    setBusy(false);
    if (!result?.ok) {
      setError(describeApiError(result?.error));
      return;
    }
    setQuestions((items) => items.filter((item) => item.id !== id));
    if (editingId === id) resetForm();
  }

  function startEdit(item: MyBankQuestion) {
    setEditingId(item.id);
    setForm({
      text: item.text,
      kind: item.kind,
      topic: item.topic || "",
      options: [0, 1, 2, 3].map((index) => item.options?.[index] || ""),
      answer: item.answer || "",
      explanation: item.explanation || "",
    });
    setError("");
    setNote("");
  }

  const current = practice ? visible[practice.index] : null;
  const correct = current
    ? String(current.answer || "").trim().toLowerCase() === String(practice?.picked || "").trim().toLowerCase()
    : false;

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-base font-bold">Мой банк вопросов</h2>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Свои вопросы для тестов и самопроверки. Видны только вам — в общий банк кафедры они не попадают.
        </p>

        <textarea
          value={form.text}
          onChange={(event) => setForm({ ...form, text: event.target.value })}
          rows={3}
          placeholder="Текст вопроса"
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--muted)]">
            Тип
            <select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value as MyBankQuestion["kind"] })}
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
            >
              <option value="single">Один ответ</option>
              <option value="multiple">Несколько ответов</option>
              <option value="open">Открытый ответ</option>
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Тема
            <input
              value={form.topic}
              onChange={(event) => setForm({ ...form, topic: event.target.value })}
              placeholder="Например: Эмбриология"
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        {form.kind !== "open" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {form.options.map((option, index) => (
              <input
                key={index}
                value={option}
                onChange={(event) => {
                  const next = [...form.options];
                  next[index] = event.target.value;
                  setForm({ ...form, options: next });
                }}
                placeholder={"Вариант " + (index + 1)}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              />
            ))}
          </div>
        )}

        <input
          value={form.answer}
          onChange={(event) => setForm({ ...form, answer: event.target.value })}
          placeholder={form.kind === "open" ? "Эталонный ответ" : "Правильный ответ (как в варианте)"}
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />
        <input
          value={form.explanation}
          onChange={(event) => setForm({ ...form, explanation: event.target.value })}
          placeholder="Пояснение (необязательно)"
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary inline-flex items-center gap-2 text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editingId ? "Сохранить вопрос" : "Добавить вопрос"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <X className="h-4 w-4" /> Отмена
            </button>
          )}
          <button
            type="button"
            onClick={() => setPractice({ index: 0, picked: "", checked: false })}
            disabled={!visible.length}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" /> Проверить себя
          </button>
        </div>
        {note ? <p className="text-xs text-[var(--status-ok-fg)]">{note}</p> : null}
        {error ? <p className="text-xs text-[var(--status-critical-fg)]">{error}</p> : null}
      </div>

      {practice && current && (
        <div className="card space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
            <span>Вопрос {practice.index + 1} из {visible.length}</span>
            <button type="button" onClick={() => setPractice(null)} className="text-[var(--primary)]">Закрыть</button>
          </div>
          <p className="text-sm font-semibold">{current.text}</p>
          {current.kind === "open" ? (
            <input
              value={practice.picked}
              onChange={(event) => setPractice({ ...practice, picked: event.target.value, checked: false })}
              placeholder="Ваш ответ"
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {current.options.map((option) => {
                const picked = practice.picked.split("|").includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      if (current.kind === "multiple") {
                        const list = practice.picked.split("|").filter(Boolean);
                        const next = picked ? list.filter((item) => item !== option) : [...list, option];
                        setPractice({ ...practice, picked: next.join("|"), checked: false });
                        return;
                      }
                      setPractice({ ...practice, picked: option, checked: false });
                    }}
                    className={
                      "rounded-xl border px-3 py-2 text-left text-sm " +
                      (picked ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold" : "border-[var(--border)] bg-white")
                    }
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPractice({ ...practice, checked: true })}
              disabled={!practice.picked}
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              <Check className="h-4 w-4" /> Проверить
            </button>
            <button
              type="button"
              onClick={() => setPractice({ index: (practice.index + 1) % visible.length, picked: "", checked: false })}
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold"
            >
              Следующий
            </button>
          </div>
          {practice.checked && (
            <div className={"rounded-xl p-3 text-sm " + (correct ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]")}>
              {correct ? "Верно." : "Правильный ответ: " + current.answer}
              {current.explanation ? <p className="mt-1 text-xs opacity-90">{current.explanation}</p> : null}
            </div>
          )}
        </div>
      )}

      <div className="card space-y-2 p-3 sm:p-4">
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по вопросам и темам"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        {loading ? (
          <p className="flex items-center gap-2 p-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем банк…
          </p>
        ) : visible.length === 0 ? (
          <p className="p-2 text-sm text-[var(--muted)]">Пока пусто — добавьте первый вопрос выше.</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <li key={item.id} className="rounded-xl border border-[var(--border)] bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.text}</div>
                    <div className="mt-1 text-[11px] text-[var(--muted)]">
                      {KIND_LABEL[item.kind]}{item.topic ? " · " + item.topic : ""} · ответ: {item.answer}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => startEdit(item)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold">
                      Изменить
                    </button>
                    <button type="button" onClick={() => void remove(item.id)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--status-critical-fg)]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
