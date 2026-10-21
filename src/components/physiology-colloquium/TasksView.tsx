"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Circle, Lightbulb, ListChecks, Search } from "lucide-react";
import { type SituationalTask, type TopicId } from "@/lib/physiology-colloquium/content";
import {
  type ColloquiumProgress,
  taskKey,
  tasksForTopics,
} from "@/lib/physiology-colloquium/progress";
import type { ColloquiumContentSnapshot } from "@/lib/physiology-colloquium/settings";
import { ProgressBar } from "./ui";

export function TasksView({
  progress,
  toggleTask,
  initialTopic,
  content,
}: {
  progress: ColloquiumProgress;
  toggleTask: (task: SituationalTask) => void;
  initialTopic?: TopicId;
  content: ColloquiumContentSnapshot;
}) {
  const [activeTopic, setActiveTopic] = useState<TopicId | "all">(initialTopic ?? "all");
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState<Record<number, boolean>>({});

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasksForTopics(
      activeTopic === "all" ? content.topics.map((topic) => topic.id) : [activeTopic],
      content,
    ).filter(
      (task) =>
        !query ||
        `${task.title} ${task.question} ${task.answer} ${task.simple}`.toLowerCase().includes(query),
    );
  }, [activeTopic, content, search]);

  const allTasks = tasksForTopics(content.topics.map((topic) => topic.id), content);
  const doneTotal = allTasks.filter((task) => progress.tasks[taskKey(task)]).length;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600">
              <ListChecks className="h-4 w-4" />
              Практика
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Ситуационные задачи</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Сначала сформулируй ответ сам, потом открой разбор. Отмечай задачу решённой, когда можешь
              объяснить механизм, а не только вспомнить вывод.
            </p>
          </div>
          <div className="min-w-44 text-right">
            <div className="text-sm font-extrabold text-slate-900">
              {doneTotal} / {allTasks.length}
            </div>
            <div className="text-xs text-slate-500">решено</div>
            <ProgressBar value={doneTotal} total={allTasks.length} tone="emerald" className="mt-2" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTopic("all")}
            className={
              "rounded-lg border px-3 py-2 text-xs font-bold transition " +
              (activeTopic === "all"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            Все темы
          </button>
          {content.topics.map((topic) => {
            const tasks = tasksForTopics([topic.id], content);
            if (!tasks.length) return null;
            const done = tasks.filter((task) => progress.tasks[taskKey(task)]).length;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => setActiveTopic(topic.id)}
                className={
                  "rounded-lg border px-3 py-2 text-xs font-bold transition " +
                  (activeTopic === topic.id
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {topic.shortTitle} · {done}/{tasks.length}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти задачу или препарат…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
        <p className="text-slate-500">
          Показано {filtered.length} из{" "}
          {tasksForTopics(
            activeTopic === "all" ? content.topics.map((topic) => topic.id) : [activeTopic],
            content,
          ).length}
        </p>
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Lightbulb className="h-3.5 w-3.5" />
          Разбор открывается отдельно от условия
        </p>
      </div>

      <section className="space-y-3">
        {filtered.map((task) => {
          const done = Boolean(progress.tasks[taskKey(task)]);
          const isOpen = Boolean(opened[task.id]);
          const topic = content.topics.find((item) => item.id === task.topic);
          return (
            <article
              key={task.id}
              className={"card overflow-hidden " + (done ? "border-emerald-200 bg-emerald-50/20" : "")}
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setOpened((previous) => ({ ...previous, [task.id]: !previous[task.id] }))}
                  className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left sm:p-5"
                  aria-expanded={isOpen}
                >
                  <span
                    className={
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold " +
                      (done ? "bg-emerald-100 text-emerald-700" : "bg-violet-50 text-violet-700")
                    }
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : task.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900">{task.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {topic?.title} · {done ? "решено" : "не отмечено"}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-slate-700">{task.question}</span>
                  </span>
                  <ChevronDown
                    className={"mt-1 h-4 w-4 shrink-0 text-slate-400 transition " + (isOpen ? "rotate-180" : "")}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => toggleTask(task)}
                  aria-label={done ? "Снять отметку «решено»" : "Отметить как решённую"}
                  title={done ? "Снять отметку" : "Отметить как решённую"}
                  className={
                    "m-3 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-xl border transition " +
                    (done
                      ? "border-emerald-300 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-400 hover:border-emerald-300 hover:text-emerald-700")
                  }
                >
                  {done ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </button>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-indigo-700">Разбор</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{task.answer}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                      Простыми словами
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-emerald-950">{task.simple}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTask(task)}
                    className={
                      "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition " +
                      (done
                        ? "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                        : "bg-emerald-600 text-white hover:bg-emerald-700")
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {done ? "Снять отметку" : "Решил сам"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className="card p-8 text-center">
            <p className="font-bold text-slate-900">Ничего не найдено</p>
            <p className="mt-1 text-sm text-slate-500">Попробуй другой запрос или выбери «Все темы».</p>
          </div>
        )}
      </section>
    </div>
  );
}
