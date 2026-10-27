"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, CheckCircle2, Pencil } from "lucide-react";
import { adminContentArchive, adminDbList, adminDbUpdate, type AdminDbRow, hasToken } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";

/** Вопросы тестов: каскадные фильтры + общая таблица с поиском и пагинацией. */
export default function TestQuestionsPage() {
  const [rows, setRows] = useState<AdminDbRow[]>([]);
  const [subjects, setSubjects] = useState<AdminDbRow[]>([]);
  const [modules, setModules] = useState<AdminDbRow[]>([]);
  const [topics, setTopics] = useState<AdminDbRow[]>([]);
  const [subject, setSubject] = useState("");
  const [module, setModule] = useState("");
  const [topic, setTopic] = useState("");
  const [edit, setEdit] = useState<AdminDbRow | null>(null);
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

  const moduleOptions = modules.filter((row) => !subject || String(row.subject_id) === subject);
  const topicOptions = topics.filter((row) => !module || String(row.module_id) === module);

  const visible = useMemo(
    () => rows.filter((row) => !row.archived_at
      && (!subject || String(row.subject_id) === subject)
      && (!module || String(row.module_id) === module)
      && (!topic || String(row.topic_id) === topic)),
    [rows, subject, module, topic]
  );

  async function save() {
    if (!edit) return;
    setBusy("save");
    const payload = { ...edit };
    delete payload.id;
    const result = await adminDbUpdate("questions", String(edit.id), payload);
    setBusy("");
    if (!result.ok) return setError(describeApiError(result.error));
    setEdit(null);
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
          {row.topic_id ? <div className="mt-1 text-xs text-slate-400">тема привязана</div> : <div className="mt-1 text-xs text-amber-600">без темы</div>}
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
            onClick={() => setEdit({ ...row })}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Архивировать вопрос"
            className="rounded-lg bg-rose-50 p-2 text-rose-700 disabled:opacity-50"
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
        <p className="page-subtitle">Редактирование и безопасное архивирование вопросов с каскадной иерархией.</p>
      </header>

      {note && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{note}</div>}

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

      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="card w-full max-w-3xl" role="dialog" aria-modal="true" aria-label="Редактирование вопроса">
            <h2 className="text-lg font-bold">Редактирование</h2>
            <textarea
              className="input mt-4 min-h-32 w-full"
              value={String(edit.text ?? "")}
              onChange={(e) => setEdit({ ...edit, text: e.target.value })}
            />
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <select
                className="input"
                aria-label="Предмет"
                value={String(edit.subject_id ?? "")}
                onChange={(e) => setEdit({ ...edit, subject_id: e.target.value, module_id: null, topic_id: null })}
              >
                {subjects.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}
              </select>
              <select
                className="input"
                aria-label="Модуль"
                value={String(edit.module_id ?? "")}
                onChange={(e) => setEdit({ ...edit, module_id: e.target.value || null, topic_id: null })}
              >
                <option value="">Без модуля</option>
                {modules.filter((row) => String(row.subject_id) === String(edit.subject_id)).map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>{String(row.title)}</option>
                ))}
              </select>
              <select
                className="input"
                aria-label="Тема"
                value={String(edit.topic_id ?? "")}
                onChange={(e) => setEdit({ ...edit, topic_id: e.target.value || null })}
              >
                <option value="">Без темы</option>
                {topics.filter((row) => String(row.module_id) === String(edit.module_id)).map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>{String(row.title)}</option>
                ))}
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Отмена</button>
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
