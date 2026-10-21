"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import type { SituationalTask, TopicId } from "@/lib/physiology-colloquium/content";
import type { ColloquiumContentSnapshot } from "@/lib/physiology-colloquium/settings";
import { EmptyState, Field, ListButton, PanelHeader, fieldClass } from "./fields";

export function TasksPanel({
  content,
  onChange,
}: {
  content: ColloquiumContentSnapshot;
  onChange: (content: ColloquiumContentSnapshot) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(content.tasks[0]?.id ?? null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return content.tasks.filter(
      (item) => !query || `${item.title} ${item.question} ${item.answer} ${item.simple}`.toLowerCase().includes(query),
    );
  }, [content.tasks, search]);

  const selected =
    content.tasks.find((item) => item.id === selectedId) ?? filtered[0] ?? content.tasks[0] ?? null;

  const update = (patch: Partial<SituationalTask>) => {
    if (!selected) return;
    onChange({
      ...content,
      tasks: content.tasks.map((item) => (item.id === selected.id ? { ...item, ...patch } : item)),
    });
  };

  const add = () => {
    const id = Math.max(0, ...content.tasks.map((item) => item.id)) + 1;
    const item: SituationalTask = {
      id,
      topic: (content.topics[0]?.id ?? "membrane") as TopicId,
      title: "Новая ситуационная задача",
      question: "",
      answer: "",
      simple: "",
    };
    onChange({ ...content, tasks: [...content.tasks, item] });
    setSelectedId(id);
    setSearch("");
  };

  const remove = () => {
    if (!selected) return;
    if (!window.confirm("Удалить ситуационную задачу?")) return;
    const tasks = content.tasks.filter((item) => item.id !== selected.id);
    onChange({ ...content, tasks });
    setSelectedId(tasks[0]?.id ?? null);
  };

  return (
    <div className="space-y-5">
      <PanelHeader
        title="Ситуационные задачи"
        description={`${content.tasks.length} задач. Полный разбор и короткий ответ для повторения.`}
        actions={
          <button type="button" onClick={add} className="btn-primary inline-flex min-h-10 items-center gap-2 px-4 text-sm">
            <Plus className="h-4 w-4" /> Добавить задачу
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="card space-y-3 p-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по задачам…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <div className="text-xs font-semibold text-slate-400">Найдено: {filtered.length}</div>
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((item) => (
              <ListButton
                key={item.id}
                active={selected?.id === item.id}
                title={item.title}
                meta={`#${item.id} · ${content.topics.find((topic) => topic.id === item.topic)?.shortTitle ?? item.topic}`}
                onClick={() => setSelectedId(item.id)}
              />
            ))}
            {!filtered.length && <EmptyState>Ничего не найдено.</EmptyState>}
          </div>
        </section>

        <section className="card space-y-4 p-5">
          {!selected ? (
            <EmptyState>Нет задач. Добавьте первую задачу.</EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Задача #{selected.id}
                  </div>
                  <h3 className="mt-1 text-lg font-extrabold text-slate-900">{selected.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={remove}
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 hover:bg-rose-100"
                >
                  <Trash2 className="h-4 w-4" /> Удалить
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Раздел">
                  <select
                    value={selected.topic}
                    onChange={(event) => update({ topic: event.target.value as TopicId })}
                    className={fieldClass}
                  >
                    {content.topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Название">
                  <input
                    value={selected.title}
                    onChange={(event) => update({ title: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
              </div>

              <Field label="Условие задачи">
                <textarea
                  value={selected.question}
                  rows={7}
                  onChange={(event) => update({ question: event.target.value })}
                  className={fieldClass}
                />
              </Field>

              <Field label="Полный разбор">
                <textarea
                  value={selected.answer}
                  rows={8}
                  onChange={(event) => update({ answer: event.target.value })}
                  className={fieldClass}
                />
              </Field>

              <Field label="Короткий ответ" hint="Ключевая мысль для быстрого повторения.">
                <textarea
                  value={selected.simple}
                  rows={4}
                  onChange={(event) => update({ simple: event.target.value })}
                  className={fieldClass}
                />
              </Field>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
