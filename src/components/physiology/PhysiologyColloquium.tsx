"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Flame,
  Lightbulb,
  ListChecks,
  Target,
} from "lucide-react";
import {
  COLLOQUIUM_META,
  EXAM_CHECKLIST,
  modules,
  type ColloquiumModule,
} from "@/content/physiology-colloquium/modules";

type SectionId = "theory" | "tasks" | "tests" | "must";

function ModuleCard({
  mod,
  open,
  onToggle,
}: {
  mod: ColloquiumModule;
  open: boolean;
  onToggle: () => void;
}) {
  const [section, setSection] = useState<SectionId>("theory");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  function toggleReveal(id: string) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-indigo-50/50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
          {mod.number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900 sm:text-lg">{mod.title}</h3>
          <p className="mt-1 text-sm text-slate-600 line-clamp-2">{mod.essence}</p>
        </div>
        {open ? (
          <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-indigo-500" />
        ) : (
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-indigo-50 px-4 pb-4 pt-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {(
              [
                { id: "theory" as const, label: "Контрольные", Icon: BookOpen },
                { id: "tasks" as const, label: "Задачи", Icon: Flame },
                { id: "tests" as const, label: "Тесты", Icon: ListChecks },
                { id: "must" as const, label: "Must know", Icon: Target },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                  (section === id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {section === "theory" && (
            <div className="space-y-3">
              {mod.controlQuestions.length === 0 && (
                <p className="text-sm text-slate-500">В этом модуле нет отдельных контрольных — смотри must know и тесты.</p>
              )}
              {mod.controlQuestions.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-sm font-semibold text-slate-900">{item.q}</p>
                  <button
                    type="button"
                    onClick={() => toggleReveal(item.id)}
                    className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                  >
                    {revealed[item.id] ? "Скрыть ответ" : "Показать ответ"}
                  </button>
                  {revealed[item.id] && (
                    <div className="mt-2 space-y-2 text-sm">
                      <p>
                        <span className="font-semibold text-emerald-700">Ответ: </span>
                        {item.a}
                      </p>
                      <p className="rounded-lg bg-amber-50 p-2 text-slate-700">
                        <Lightbulb className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                        <span className="font-medium">Простыми словами: </span>
                        {item.simple}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {section === "tasks" && (
            <div className="space-y-3">
              {mod.tasks.length === 0 && (
                <p className="text-sm text-slate-500">Ситуационных задач в этом модуле нет.</p>
              )}
              {mod.tasks.map((item) => (
                <div key={item.id} className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                  <p className="text-sm font-semibold text-slate-900">{item.q}</p>
                  <button
                    type="button"
                    onClick={() => toggleReveal("t-" + item.id)}
                    className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                  >
                    {revealed["t-" + item.id] ? "Скрыть разбор" : "Показать разбор"}
                  </button>
                  {revealed["t-" + item.id] && (
                    <div className="mt-2 space-y-2 text-sm">
                      <p>
                        <span className="font-semibold text-emerald-700">Ответ: </span>
                        {item.a}
                      </p>
                      <p className="rounded-lg bg-white/80 p-2 text-slate-700">
                        <span className="font-medium">Логика: </span>
                        {item.simple}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {section === "tests" && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 text-sm">
              <p>
                <span className="font-semibold">Банк: </span>
                {mod.tests.range}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Фокус: </span>
                {mod.tests.focus}
              </p>
              <p className="mt-2 flex items-start gap-2 text-slate-700">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                {mod.tests.tip}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Полный банк тестов — во вкладке «Тесты» / «База вопросов» предмета. Здесь — навигация по темам.
              </p>
            </div>
          )}

          {section === "must" && (
            <ul className="space-y-2">
              {mod.mustKnow.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-slate-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

/** Вкладка «Коллоквиум» на странице предмета Физиология. */
export default function PhysiologyColloquium() {
  const [openId, setOpenId] = useState<string | null>(modules[0]?.id ?? null);
  const [showChecklist, setShowChecklist] = useState(true);

  const progressHint = useMemo(
    () => "Иди по модулям по порядку: 1 → 7. В каждом: теория → задачи → must know → тесты банка.",
    []
  );

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">
          {COLLOQUIUM_META.subjectName} · итоговый коллоквиум
        </p>
        <h2 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">
          {COLLOQUIUM_META.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{COLLOQUIUM_META.source}</p>
        <p className="mt-2 text-sm text-indigo-800">{progressHint}</p>
      </header>

      <section className="card border-amber-100 bg-amber-50/40 p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setShowChecklist((v) => !v)}
        >
          <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-900">
            <ClipboardList className="h-4 w-4" />
            Чек-лист перед занятием
          </span>
          {showChecklist ? (
            <ChevronDown className="h-4 w-4 text-amber-700" />
          ) : (
            <ChevronRight className="h-4 w-4 text-amber-700" />
          )}
        </button>
        {showChecklist && (
          <ul className="mt-3 space-y-1.5">
            {EXAM_CHECKLIST.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-slate-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        {modules.map((mod) => (
          <ModuleCard
            key={mod.id}
            mod={mod}
            open={openId === mod.id}
            onToggle={() => setOpenId((id) => (id === mod.id ? null : mod.id))}
          />
        ))}
      </div>
    </div>
  );
}
