"use client";

import Link from "next/link";
import { ArrowRight, Beaker, FlaskConical, ListChecks } from "lucide-react";
import { ChemistryWorkbench } from "@/components/chemistry/ChemistryWorkbench";
import SubjectContextBanner from "@/components/subjects/SubjectContextBanner";
import { moduleById, moduleHref, subjectAreaName, type SubjectAreaKey } from "@/lib/learning/modules";

const workbench = moduleById("chemistry.workbench");
const workbenchAreas = workbench
  ? (Object.entries(workbench.relations) as Array<[SubjectAreaKey, NonNullable<(typeof workbench.relations)[SubjectAreaKey]>]>)
      .filter(([key]) => key !== workbench.primary)
  : [];

export default function ChemistryPage() {
  return (
    <div className="space-y-6">
      <SubjectContextBanner />
      <ChemistryWorkbench />

      <nav aria-label="Разделы химии" className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2">
        <Link
          href="/chemistry/elements"
          className="card flex items-center gap-4 p-4 hover:border-[var(--primary)] sm:p-5"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
          >
            <FlaskConical className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Периодическая таблица элементов</span>
            <span className="mt-0.5 block text-sm" style={{ color: "var(--muted)" }}>
              118 элементов: поиск по символу, названию или номеру, фильтр по категориям и карточка элемента.
            </span>
          </span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
        <Link
          href="/chemistry/practice"
          className="card flex items-center gap-4 p-4 hover:border-[var(--primary)] sm:p-5"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--primary))" }}
          >
            <ListChecks className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Генератор вариантов</span>
            <span className="mt-0.5 block text-sm" style={{ color: "var(--muted)" }}>
              Задачи по 8 темам, воспроизводимый seed, пошаговые решения, проверка ответа, CSV и печать.
            </span>
          </span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
        <Link
          href="/chemistry/lab"
          className="card flex items-center gap-4 p-4 hover:border-[var(--primary)] sm:p-5"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, #0f766e, var(--primary))" }}
          >
            <Beaker className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Виртуальная лаборатория</span>
            <span className="mt-0.5 block text-sm" style={{ color: "var(--muted)" }}>
              Титрование с индикатором, элемент Нернста, Бугер–Ламберт–Бер: протокол, график и CSV.
            </span>
          </span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
        <Link
          href="/chemistry/tools"
          className="card flex items-center gap-4 p-4 hover:border-[var(--primary)] sm:p-5"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, var(--primary))" }}
          >
            <FlaskConical className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Растворы и pH</span>
            <span className="mt-0.5 block text-sm" style={{ color: "var(--muted)" }}>
              Разведение C₁V₁ = C₂V₂, pH сильных и слабых электролитов, буферные системы.
            </span>
          </span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
      </nav>

      {workbench && workbenchAreas.length ? (
        <section className="mx-auto w-full max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
            Химическое ядро в других дисциплинах
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Один и тот же модуль открывается из связанных предметов с их контекстом — без копий и
            второго прогресса.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {workbenchAreas.map(([key, relation]) => (
              <Link
                key={key}
                href={moduleHref(workbench, { subjectKey: key, topic: relation.topics[0] })}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--primary)]"
              >
                {subjectAreaName(key)}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
