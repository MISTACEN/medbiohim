"use client";

import { BookOpen, Layers3, ListChecks } from "lucide-react";
import type { TopicId } from "@/lib/physiology-colloquium/content";
import type { ColloquiumContentSnapshot } from "@/lib/physiology-colloquium/settings";
import { EmptyState, Field, PanelHeader, fieldClass } from "./fields";

function toggleId(values: string[], id: string): string[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

export function StructurePanel({
  content,
  onChange,
}: {
  content: ColloquiumContentSnapshot;
  onChange: (content: ColloquiumContentSnapshot) => void;
}) {
  const updateTopic = (index: number, patch: Partial<ColloquiumContentSnapshot["topics"][number]>) => {
    const topics = content.topics.map((topic, itemIndex) =>
      itemIndex === index ? { ...topic, ...patch } : topic,
    );
    onChange({ ...content, topics });
  };

  const updateModule = (
    index: number,
    patch: Partial<ColloquiumContentSnapshot["test_modules"][number]>,
  ) => {
    const test_modules = content.test_modules.map((module, itemIndex) =>
      itemIndex === index ? { ...module, ...patch } : module,
    );
    onChange({ ...content, test_modules });
  };

  const updateStage = (
    index: number,
    patch: Partial<ColloquiumContentSnapshot["plan_stages"][number]>,
  ) => {
    const plan_stages = content.plan_stages.map((stage, itemIndex) =>
      itemIndex === index ? { ...stage, ...patch } : stage,
    );
    onChange({ ...content, plan_stages });
  };

  return (
    <div className="space-y-6">
      <PanelHeader
        title="Структура подготовки"
        description="Названия разделов, тестовых модулей и этапов плана. Идентификаторы не меняются, чтобы сохранить прогресс студентов."
      />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Разделы</h3>
        </div>
        {!content.topics.length && <EmptyState>Разделы не заданы.</EmptyState>}
        <div className="grid gap-3 lg:grid-cols-2">
          {content.topics.map((topic, index) => (
            <div key={topic.id} className="card space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                  {topic.id}
                </span>
                <span className="text-xs font-semibold text-slate-400">{topic.range}</span>
              </div>
              <Field label="Название">
                <input
                  value={topic.title}
                  onChange={(event) => updateTopic(index, { title: event.target.value })}
                  className={fieldClass}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Короткое название">
                  <input
                    value={topic.shortTitle}
                    onChange={(event) => updateTopic(index, { shortTitle: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Диапазон вопросов">
                  <input
                    value={topic.range}
                    onChange={(event) => updateTopic(index, { range: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <Field label="Описание">
                <textarea
                  value={topic.description}
                  rows={2}
                  onChange={(event) => updateTopic(index, { description: event.target.value })}
                  className={fieldClass}
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Тестовые модули</h3>
        </div>
        {!content.test_modules.length && <EmptyState>Тестовые модули не заданы.</EmptyState>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {content.test_modules.map((module, index) => (
            <div key={module.id} className="card space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                  {module.id}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {content.tests.filter((test) => test.module === module.id).length} вопросов
                </span>
              </div>
              <Field label="Название">
                <input
                  value={module.title}
                  onChange={(event) => updateModule(index, { title: event.target.value })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Короткое название">
                <input
                  value={module.shortTitle}
                  onChange={(event) => updateModule(index, { shortTitle: event.target.value })}
                  className={fieldClass}
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers3 className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Этапы плана</h3>
        </div>
        {!content.plan_stages.length && <EmptyState>Этапы не заданы.</EmptyState>}
        <div className="space-y-3">
          {content.plan_stages.map((stage, index) => (
            <div key={stage.id} className="card space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                  {stage.id}
                </span>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <span>{stage.minutes} мин</span>
                  <span>·</span>
                  <span>{content.theory.filter((item) => stage.theoryTopics.includes(item.topic)).length} теории</span>
                  <span>·</span>
                  <span>{content.tests.filter((item) => stage.testModules.includes(item.module)).length} тестов</span>
                  <span>·</span>
                  <span>{content.tasks.filter((item) => stage.taskTopics.includes(item.topic)).length} задач</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px]">
                <Field label="Название">
                  <input
                    value={stage.title}
                    onChange={(event) => updateStage(index, { title: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Подзаголовок">
                  <input
                    value={stage.subtitle}
                    onChange={(event) => updateStage(index, { subtitle: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Минуты">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={stage.minutes}
                    onChange={(event) => updateStage(index, { minutes: Number(event.target.value) })}
                    className={fieldClass}
                  />
                </Field>
              </div>

              <Field label="Цель этапа">
                <textarea
                  value={stage.goal}
                  rows={2}
                  onChange={(event) => updateStage(index, { goal: event.target.value })}
                  className={fieldClass}
                />
              </Field>

              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Теория</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {content.topics.map((topic) => {
                      const active = stage.theoryTopics.includes(topic.id);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() =>
                            updateStage(index, {
                              theoryTopics: toggleId(stage.theoryTopics, topic.id) as TopicId[],
                            })
                          }
                          className={
                            "rounded-full border px-2.5 py-1 text-[11px] font-bold transition " +
                            (active
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                          }
                        >
                          {topic.shortTitle}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Тесты</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {content.test_modules.map((module) => {
                      const active = stage.testModules.includes(module.id);
                      return (
                        <button
                          key={module.id}
                          type="button"
                          onClick={() =>
                            updateStage(index, {
                              testModules: toggleId(stage.testModules, module.id),
                            })
                          }
                          className={
                            "rounded-full border px-2.5 py-1 text-[11px] font-bold transition " +
                            (active
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                          }
                        >
                          {module.shortTitle}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Задачи</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {content.topics.map((topic) => {
                      const active = stage.taskTopics.includes(topic.id);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() =>
                            updateStage(index, {
                              taskTopics: toggleId(stage.taskTopics, topic.id) as TopicId[],
                            })
                          }
                          className={
                            "rounded-full border px-2.5 py-1 text-[11px] font-bold transition " +
                            (active
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                          }
                        >
                          {topic.shortTitle}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
