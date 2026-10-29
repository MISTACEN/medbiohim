"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Check, CheckCircle2, Pencil, Plus, Trash2, X } from "lucide-react";
import { adminContentArchive, adminDbList, adminUpdateBankQuestion, type AdminDbRow, hasToken } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";

/** Вопросы тестов: каскадные фильтры + общая таблица с поиском и пагинацией. */

type QuestionOption = { label: string; correct: boolean };

type QuestionDraft = {
  id: string;
  text: string;
  type: string;
  answer: string;
  options: QuestionOption[];
  difficulty: string;
  is_published: boolean;
  subject_id: string;
  module_id: string;
  topic_id: string;
};

const QUESTION_TYPES: Array<[string, string]> = [
  ["mcq", "Один вариант (mcq)"],
  ["multiple", "Несколько вариантов (multiple)"],
  ["open", "Открытый ответ"],
  ["short", "Короткий ответ"],
  ["number", "Число"],
  ["ordering", "Установить порядок"],
];

const CLOSED_TYPES = new Set(["mcq", "multiple", "ordering"]);
const CORRECT_TYPES = new Set(["mcq", "multiple"]);

/** Row.options может быть массивом {label, correct} или старым массивом строк. */
function toEditableOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === "string"
      ? { label: item, correct: false }
      : { label: String(item?.label ?? ""), correct: item?.correct === true },
  );
}

function toDraft(row: AdminDbRow): QuestionDraft {
  return {
    id: String(row.id),
    text: String(row.text ?? ""),
    type: String(row.type || "mcq"),
    answer: String(row.answer ?? ""),
    options: toEditableOptions(row.options),
    difficulty: row.difficulty == null ? "" : String(row.difficulty),
    is_published: row.is_published !== false,
    subject_id: String(row.subject_id ?? ""),
    module_id: String(row.module_id ?? ""),
    topic_id: String(row.topic_id ?? ""),
  };
}

function draftToPayload(draft: QuestionDraft): Record<string, unknown> {
  const closed = CLOSED_TYPES.has(draft.type);
  return {
    text: draft.text,
    type: draft.type,
    answer: draft.answer,
    options: closed
      ? draft.options.map((option) => ({ label: option.label.trim(), correct: option.correct }))
      : [],
    is_published: draft.is_published,
    subject_id: draft.subject_id || null,
    module_id: draft.module_id || null,
    topic_id: draft.topic_id || null,
    ...(draft.difficulty === "" ? {} : { difficulty: Number(draft.difficulty) }),
  };
}

export default function TestQuestionsPage() {
  const [rows, setRows] = useState<AdminDbRow[]>([]);
  const [subjects, setSubjects] = useState<AdminDbRow[]>([]);
  const [modules, setModules] = useState<AdminDbRow[]>([]);
  const [topics, setTopics] = useState<AdminDbRow[]>([]);
  const [subject, setSubject] = useState("");
  const [module, setModule] = useState("");
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const { confirm, dialog } = useConfirm();

  async function load() {
    setLoading(true);
    const [questions, subjectRows, moduleRows, topicRows] = await Promise.all([
      adminDbList("questions", 1000),
      adminDbList("subjects", 500),
      adminDbList("modules", 500),
      adminDbList("topics", 1000),
    ]);
    setLoading(false);
    if (questions.ok) {
      setRows(questions.data.items);
      setError("");
    } else {
      setError(describeApiError(questions.error));
    }
    if (subjectRows.ok) setSubjects(subjectRows.data.items);
    if (moduleRows.ok) setModules(moduleRows.data.items);
    if (topicRows.ok) setTopics(topicRows.data.items);
  }

  useEffect(() => { if (hasToken()) void load(); }, []);

  const moduleOptions = useMemo(
    () => modules.filter((row) => !subject || String(row.subject_id) === subject),
    [modules, subject],
  );
  const topicOptions = useMemo(
    () => topics.filter((row) => !module || String(row.module_id) === module),
    [topics, module],
  );

  const visible = useMemo(
    () => rows.filter((row) => !row.archived_at
      && (!subject || String(row.subject_id) === subject)
      && (!module || String(row.module_id) === module)
      && (!topic || String(row.topic_id) === topic)),
    [rows, subject, module, topic]
  );

  function openEditor(row: AdminDbRow) {
    setError("");
    setDraft(toDraft(row));
  }

  function patchDraft(patch: Partial<QuestionDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function setType(nextType: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      // Для закрытых типов без вариантов сразу даём две пустые строки.
      const needsOptions = ["mcq", "multiple", "ordering"].includes(nextType);
      const options = needsOptions && prev.options.length < 2
        ? [...prev.options, ...Array.from({ length: 2 - prev.options.length }, () => ({ label: "", correct: false }))]
        : prev.options;
      return { ...prev, type: nextType, options };
    });
  }

  function addOption() {
    setDraft((prev) => prev ? { ...prev, options: [...prev.options, { label: "", correct: false }] } : prev);
  }

  function removeOption(index: number) {
    setDraft((prev) => prev ? { ...prev, options: prev.options.filter((_, i) => i !== index) } : prev);
  }

  function updateOption(index: number, patch: Partial<QuestionOption>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const options = prev.options.map((option, i) => {
        if (i !== index) return option;
        return { ...option, ...patch };
      });
      // Одиночный выбор: правильный только один — как чекбокс-радио.
      if (prev.type === "mcq" && patch.correct === true) {
        return { ...prev, options: options.map((option, i) => (i === index ? option : { ...option, correct: false })) };
      }
      return { ...prev, options };
    });
  }

  function validate(d: QuestionDraft): string {
    if (!d.text.trim()) return "Текст вопроса обязателен.";
    if (CORRECT_TYPES.has(d.type)) {
      if (d.options.length < 2) return "Нужно минимум 2 варианта ответа.";
      if (d.options.some((option) => !option.label.trim())) return "Заполни текст каждого варианта (или удали пустые).";
      if (!d.options.some((option) => option.correct)) return "Пометьте хотя бы один вариант как правильный.";
      if (d.type === "mcq" && d.options.filter((option) => option.correct).length !== 1) return "Для одиночного выбора должен быть ровно один правильный вариант.";
    }
    if (d.difficulty !== "" && (!/^[1-5]$/.test(d.difficulty))) return "Сложность — целое число от 1 до 5.";
    return "";
  }

  async function save() {
    if (!draft) return;
    const validationError = validate(draft);
    if (validationError) return setError(validationError);
    setBusy("save");
    const result = await adminUpdateBankQuestion(draft.id, draftToPayload(draft));
    setBusy("");
    if (!result.ok) return setError(describeApiError(result.error));
    setDraft(null);
    setError("");
    setNote("Вопрос сохранён");
    await load();
  }

  async function archive(row: AdminDbRow) {
    const agreed = await confirm({
      title: "Архивировать вопрос?",
      description: "Вопрос перестанет появляться в тестах, но останется в базе и в журнале версий.",
      confirmLabel: "Архивировать",
      danger: true,
    });
    if (!agreed) return;
    setBusy("archive-" + String(row.id));
    const result = await adminContentArchive("questions", String(row.id));
    setBusy("");
    if (!result.ok) return setError(describeApiError(result.error));
    setNote("Вопрос архивирован");
    await load();
  }

  const columns: Array<DataTableColumn<AdminDbRow>> = [
    {
      key: "text",
      header: "Вопрос",
      sortValue: (row) => String(row.text || ""),
      render: (row) => (
        <div className="max-w-[46rem]">
          <div className="line-clamp-2 leading-snug" title={String(row.text || "")}>{String(row.text || "")}</div>
          {row.topic_id ? <div className="mt-1 text-xs text-slate-400">тема привязана</div> : <div className="mt-1 text-xs text-[var(--status-warn-fg)]">без темы</div>}
        </div>
      ),
    },
    {
      key: "type",
      header: "Тип",
      sortValue: (row) => String(row.type || ""),
      render: (row) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{String(row.type || "—")}</span>,
    },
    {
      key: "actions",
      header: "Действия",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            aria-label="Изменить вопрос"
            className="rounded-lg bg-indigo-50 p-2 text-indigo-700"
            onClick={() => openEditor(row)}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Архивировать вопрос"
            className="rounded-lg bg-[var(--status-critical-bg)] p-2 text-[var(--status-critical-fg)] disabled:opacity-50"
            disabled={busy === "archive-" + String(row.id)}
            onClick={() => void archive(row)}
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Вопросы тестов</h1>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin/tests" className="text-sm text-indigo-600">← Тесты</Link>
        <h1 className="mt-1 page-title">Вопросы тестов</h1>
        <p className="page-subtitle">Полное редактирование вопросов: текст, варианты ответов, правильный ответ, тип и объяснение.</p>
      </header>

      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{note}</div>}

      <section className="card">
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(row) => String(row.id)}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          searchText={(row) => String(row.text || "")}
          searchPlaceholder="Поиск по тексту вопроса…"
          empty="Вопросов нет"
          caption="Вопросы тестов"
          pageSize={25}
          filters={
            <>
              <select
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                aria-label="Предмет"
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setModule(""); setTopic(""); }}
              >
                <option value="">Все предметы</option>
                {subjects.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}
              </select>
              <select
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                aria-label="Модуль"
                value={module}
                onChange={(e) => { setModule(e.target.value); setTopic(""); }}
              >
                <option value="">Все модули</option>
                {moduleOptions.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.title)}</option>)}
              </select>
              <select
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                aria-label="Тема"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="">Все темы</option>
                {topicOptions.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.title)}</option>)}
              </select>
            </>
          }
        />
      </section>

      {dialog}

      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="card max-h-[92vh] w-full max-w-3xl overflow-y-auto" role="dialog" aria-modal="true" aria-label="Редактирование вопроса">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold">Редактирование вопроса</h2>
              <button type="button" className="rounded-xl border bg-white p-2" onClick={() => setDraft(null)} aria-label="Закрыть">
                <X className="h-4 w-4" />
              </button>
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
              <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>Отмена</button>
              <button type="button" className="btn-primary" disabled={busy === "save"} onClick={() => void save()}>
                <CheckCircle2 className="mr-2 inline h-4 w-4" />Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
