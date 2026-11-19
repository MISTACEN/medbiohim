"use client";

import { Archive, Pencil } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/ui";
import type { AdminDbRow } from "@/lib/api";
import type { TestQuestionsController } from "./useTestQuestions";

/** Общая таблица вопросов с поиском, пагинацией и каскадными фильтрами. */
export function TestQuestionsTable({ page }: { page: TestQuestionsController }) {
  const {
    visible, subjects, moduleOptions, topicOptions,
    subject, setSubject, module, setModule, topic, setTopic,
    loading, error, load, openEditor, archive, busy,
  } = page;

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

  return (
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
  );
}
