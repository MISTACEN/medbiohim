"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, CheckCircle2, ChevronDown, Circle, Search } from "lucide-react";
import { type TheoryQuestion, type TopicId } from "@/lib/physiology-colloquium/content";
import {
  type ColloquiumProgress,
  theoryForTopics,
  theoryKey,
} from "@/lib/physiology-colloquium/progress";
import type { ColloquiumContentSnapshot } from "@/lib/physiology-colloquium/settings";
import { ProgressBar } from "./ui";

export function TheoryView({
  progress,
  toggleTheory,
  initialTopic,
  content,
}: {
  progress: ColloquiumProgress;
  toggleTheory: (question: TheoryQuestion) => void;
  initialTopic?: TopicId;
  content: ColloquiumContentSnapshot;
}) {
  const [activeTopic, setActiveTopic] = useState<TopicId | "all">(initialTopic ?? "all");
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState<Record<number, boolean>>({});

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return theoryForTopics(
      activeTopic === "all" ? content.topics.map((topic) => topic.id) : [activeTopic],
      content,
    ).filter(
      (question) =>
        !query ||
        `${question.title} ${question.answer} ${question.simple}`.toLowerCase().includes(query),
    );
  }, [activeTopic, content, search]);

  const allTheory = theoryForTopics(content.topics.map((topic) => topic.id), content);
  const doneTotal = allTheory.filter((question) => progress.theory[theoryKey(question)]).length;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
              <BookOpen className="h-4 w-4" />
              Теория
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Вопросы-конспекты</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Ответ и объяснение простыми словами. Отмечай вопрос разобранным, когда можешь объяснить его своими словами.
            </p>
          </div>
          <div className="min-w-44 text-right">
            <div className="text-sm font-extrabold text-slate-900">
              {doneTotal} / {allTheory.length}
            </div>
            <div className="text-xs text-slate-500">разобрано</div>
            <ProgressBar value={doneTotal} total={allTheory.length} tone="emerald" className="mt-2" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTopic("all")}
            className={
              "rounded-lg border px-3 py-2 text-xs font-bold transition " +
              (activeTopic === "all"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            Все темы
          </button>
          {content.topics.map((topic) => {
            const questions = theoryForTopics([topic.id], content);
            const done = questions.filter((question) => progress.theory[theoryKey(question)]).length;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => setActiveTopic(topic.id)}
                className={
                  "rounded-lg border px-3 py-2 text-xs font-bold transition " +
                  (activeTopic === topic.id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {topic.shortTitle} · {done}/{questions.length}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти вопрос, термин или объяснение…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-slate-500">
          Показано {filtered.length} из{" "}
          {theoryForTopics(
            activeTopic === "all" ? content.topics.map((topic) => topic.id) : [activeTopic],
            content,
          ).length}
        </p>
        <p className="text-xs text-slate-400">Открывай карточку и отмечай, когда разобрался</p>
      </div>

      <section className="space-y-3">
        {filtered.map((question) => {
          const done = Boolean(progress.theory[theoryKey(question)]);
          const isOpen = Boolean(opened[question.id]);
          const topic = content.topics.find((item) => item.id === question.topic);
          return (
            <article
              key={question.id}
              className={"card overflow-hidden " + (done ? "border-emerald-200 bg-emerald-50/20" : "")}
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setOpened((previous) => ({ ...previous, [question.id]: !previous[question.id] }))}
                  className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left sm:p-5"
                  aria-expanded={isOpen}
                >
                  <span
                    className={
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold " +
                      (done ? "bg-emerald-100 text-emerald-700" : "bg-indigo-50 text-indigo-700")
                    }
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : question.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900">{question.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {topic?.title} · {done ? "разобрано" : "не отмечено"}
                    </span>
                  </span>
                  <ChevronDown
                    className={"mt-1 h-4 w-4 shrink-0 text-slate-400 transition " + (isOpen ? "rotate-180" : "")}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => toggleTheory(question)}
                  aria-label={done ? "Снять отметку «разобрано»" : "Отметить как разобранное"}
                  title={done ? "Снять отметку" : "Отметить как разобранное"}
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
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-indigo-700">Ответ</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{question.answer}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                      {question.topic === "basics" ? "Пояснение" : "Простыми словами"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-emerald-950">{question.simple}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTheory(question)}
                    className={
                      "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition " +
                      (done
                        ? "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                        : "bg-indigo-600 text-white hover:bg-indigo-700")
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {done ? "Снять отметку" : "Я разобрался"}
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
