"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, Trash2, Wand2 } from "lucide-react";
import type {
  ColloquiumContentSnapshot,
  ColloquiumTestQuestion,
} from "@/lib/physiology-colloquium/settings";
import { EmptyState, Field, ListButton, PanelHeader, fieldClass } from "./fields";

export function TestsPanel({
  content,
  onChange,
}: {
  content: ColloquiumContentSnapshot;
  onChange: (content: ColloquiumContentSnapshot) => void;
}) {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(content.tests[0]?.id ?? null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return content.tests.filter((item) => {
      if (moduleFilter !== "all" && item.module !== moduleFilter) return false;
      return (
        !query ||
        `${item.question} ${item.answer} ${item.why} ${item.options.map((option) => option.text).join(" ")}`
          .toLowerCase()
          .includes(query)
      );
    });
  }, [content.tests, moduleFilter, search]);

  const selected =
    content.tests.find((item) => item.id === selectedId) ?? filtered[0] ?? content.tests[0] ?? null;

  const update = (patch: Partial<ColloquiumTestQuestion>) => {
    if (!selected) return;
    onChange({
      ...content,
      tests: content.tests.map((item) => (item.id === selected.id ? { ...item, ...patch } : item)),
    });
  };

  const updateOption = (index: number, text: string) => {
    if (!selected) return;
    update({
      options: selected.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, text } : option,
      ),
    });
  };

  const toggleCorrect = (number: number) => {
    if (!selected) return;
    const correct = selected.correct.includes(number)
      ? selected.correct.filter((value) => value !== number)
      : [...selected.correct, number].sort((a, b) => a - b);
    update({ correct });
  };

  const addOption = () => {
    if (!selected) return;
    const number = Math.max(0, ...selected.options.map((option) => option.number)) + 1;
    update({ options: [...selected.options, { number, text: "Новый вариант" }] });
  };

  const removeOption = (number: number) => {
    if (!selected || selected.options.length <= 2) return;
    update({
      options: selected.options.filter((option) => option.number !== number),
      correct: selected.correct.filter((value) => value !== number),
    });
  };

  const recalculateAnswer = () => {
    if (!selected) return;
    const answer = selected.options
      .filter((option) => selected.correct.includes(option.number))
      .map((option) => `${option.number}) ${option.text}`)
      .join("; ");
    update({ answer });
  };

  const add = () => {
    const id = Math.max(0, ...content.tests.map((item) => item.id)) + 1;
    const moduleId =
      moduleFilter === "all" ? content.test_modules[0]?.id ?? "cell" : moduleFilter;
    const item: ColloquiumTestQuestion = {
      id,
      module: moduleId,
      number: Math.max(0, ...content.tests.filter((test) => test.module === moduleId).map((test) => test.number ?? 0)) + 1,
      question: "Новый тестовый вопрос",
      options: [
        { number: 1, text: "Вариант 1" },
        { number: 2, text: "Вариант 2" },
      ],
      correct: [1],
      answer: "1) Вариант 1",
      why: "",
      whyLabel: "Пояснение",
    };
    onChange({ ...content, tests: [...content.tests, item] });
    setModuleFilter(moduleId);
    setSelectedId(id);
    setSearch("");
  };

  const remove = () => {
    if (!selected) return;
    if (!window.confirm("Удалить тестовый вопрос? Он исчезнет из тестов и экзамена.")) return;
    const tests = content.tests.filter((item) => item.id !== selected.id);
    onChange({ ...content, tests });
    setSelectedId(tests[0]?.id ?? null);
  };

  return (
    <div className="space-y-5">
      <PanelHeader
        title="Тесты"
        description={`${content.tests.length} вопросов в банке. Правильные варианты отмечаются галочками.`}
        actions={
          <button type="button" onClick={add} className="btn-primary inline-flex min-h-10 items-center gap-2 px-4 text-sm">
            <Plus className="h-4 w-4" /> Добавить тест
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="card space-y-3 p-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по тестам…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
            className={fieldClass}
          >
            <option value="all">Все модули</option>
            {content.test_modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
          <div className="text-xs font-semibold text-slate-400">Найдено: {filtered.length}</div>
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((item) => (
              <ListButton
                key={item.id}
                active={selected?.id === item.id}
                title={item.question}
                meta={`#${item.number ?? item.id} · ${content.test_modules.find((module) => module.id === item.module)?.shortTitle ?? item.module} · ${item.correct.length} отв.`}
                onClick={() => setSelectedId(item.id)}
              />
            ))}
            {!filtered.length && <EmptyState>Ничего не найдено.</EmptyState>}
          </div>
        </section>

        <section className="card space-y-4 p-5">
          {!selected ? (
            <EmptyState>Нет тестов. Добавьте первый вопрос.</EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Тест #{selected.number ?? selected.id}
                  </div>
                  <h3 className="mt-1 line-clamp-2 text-lg font-extrabold text-slate-900">{selected.question}</h3>
                </div>
                <button
                  type="button"
                  onClick={remove}
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 hover:bg-rose-100"
                >
                  <Trash2 className="h-4 w-4" /> Удалить
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <Field label="Модуль">
                  <select
                    value={selected.module}
                    onChange={(event) => update({ module: event.target.value })}
                    className={fieldClass}
                  >
                    {content.test_modules.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Номер">
                  <input
                    type="number"
                    min={1}
                    value={selected.number ?? 1}
                    onChange={(event) => update({ number: Number(event.target.value) })}
                    className={fieldClass}
                  />
                </Field>
              </div>

              <Field label="Вопрос">
                <textarea
                  value={selected.question}
                  rows={3}
                  onChange={(event) => update({ question: event.target.value })}
                  className={fieldClass}
                />
              </Field>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Варианты ответа</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addOption}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Вариант
                    </button>
                    <button
                      type="button"
                      onClick={recalculateAnswer}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      <Wand2 className="h-3.5 w-3.5" /> Пересчитать ответ
                    </button>
                  </div>
                </div>

                {selected.options.map((option, index) => {
                  const correct = selected.correct.includes(option.number);
                  return (
                    <div
                      key={option.number}
                      className={
                        "flex items-start gap-2 rounded-xl border p-2.5 " +
                        (correct ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white")
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleCorrect(option.number)}
                        aria-label={correct ? "Убрать правильный вариант" : "Отметить правильным"}
                        className={
                          "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-bold " +
                          (correct
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-slate-300 bg-white text-slate-400 hover:border-emerald-400")
                        }
                      >
                        {correct ? <CheckCircle2 className="h-4 w-4" /> : option.number}
                      </button>
                      <input
                        value={option.text}
                        onChange={(event) => updateOption(index, event.target.value)}
                        className={fieldClass + " mt-0"}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(option.number)}
                        disabled={selected.options.length <= 2}
                        className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Удалить вариант"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <Field label="Эталонный ответ">
                <textarea
                  value={selected.answer}
                  rows={2}
                  onChange={(event) => update({ answer: event.target.value })}
                  className={fieldClass}
                />
              </Field>

              <Field label="Пояснение / разбор">
                <textarea
                  value={selected.why}
                  rows={4}
                  onChange={(event) => update({ why: event.target.value })}
                  className={fieldClass}
                />
              </Field>

              <Field label="Заголовок пояснения">
                <input
                  value={selected.whyLabel ?? "Пояснение"}
                  onChange={(event) => update({ whyLabel: event.target.value })}
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
