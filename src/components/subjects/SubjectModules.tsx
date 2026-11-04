"use client";

/**
 * Блок «Инструменты и модели» на странице предмета.
 *
 * Показывает только применимые модули и объясняет, почему они здесь: предмет
 * определяется по slug или названию (в базе есть дисциплины с `slug = NULL`),
 * а ссылка несёт предметный контекст, не создавая копию инструмента.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Compass } from "lucide-react";
import {
  MODULE_KIND_LABELS,
  moduleHref,
  modulesForSubject,
  relationFor,
  resolveSubjectAreaKey,
  subjectAreaName,
  type LearningModule,
} from "@/lib/learning/modules";
import { readVisits, recordModuleVisit } from "@/lib/learning/moduleProgress";

export default function SubjectModules({
  slug,
  name,
}: {
  slug?: string | null;
  name?: string | null;
}) {
  const areaKey = useMemo(() => resolveSubjectAreaKey({ slug, name }), [slug, name]);
  const modules = useMemo(
    () => modulesForSubject(areaKey, { excludeFunctions: ["simulation"] }),
    [areaKey],
  );
  // Прогресс привязан к модулю, а не к предмету: переход между дисциплинами
  // не обнуляет счётчик открытий.
  const [visits, setVisits] = useState<Record<string, number>>({});
  useEffect(() => {
    const map: Record<string, number> = {};
    for (const visit of readVisits()) map[visit.moduleId] = visit.visits;
    setVisits(map);
  }, []);

  if (!areaKey || !modules.length) return null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Compass className="h-5 w-5 text-[var(--primary)]" />
            Инструменты для этого предмета
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Подобраны по содержанию {subjectAreaName(areaKey).toLowerCase()}: один и тот же модуль
            открывается с предметным контекстом из любой связанной дисциплины.
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {modules.length}
        </span>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {modules.map((module) => {
          const relation = relationFor(module, areaKey);
          if (!relation) return null;
          const href = moduleHref(module, { subjectKey: areaKey, topic: relation.topics[0] });
          return (
            <li key={module.id}>
              <ModuleCard
                module={module}
                href={href}
                reason={relation.reason}
                topics={relation.topics}
                areaKey={areaKey}
                visits={visits[module.id] ?? 0}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ModuleCard({
  module,
  href,
  reason,
  topics,
  areaKey,
  visits,
}: {
  module: LearningModule;
  href: string;
  reason: string;
  topics: string[];
  areaKey: string;
  visits: number;
}) {
  return (
    <Link
      href={href}
      onClick={() => recordModuleVisit(module.id, areaKey)}
      className="group flex h-full flex-col rounded-xl border border-[var(--border)] p-3 transition hover:border-[var(--primary)]"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-snug">{module.title}</span>
        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" />
      </span>
      <span className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--muted)]">
        {MODULE_KIND_LABELS[module.kind]}
      </span>
      <span className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{reason}</span>
      {visits > 0 ? (
        <span className="mt-2 text-[10px] font-semibold text-[var(--muted)]">
          Открывали {visits} раз — прогресс общий для всех предметов
        </span>
      ) : null}
      {topics.length ? (
        <span className="mt-2 flex flex-wrap gap-1">
          {topics.slice(0, 3).map((topic) => (
            <span key={topic} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
              {topic}
            </span>
          ))}
        </span>
      ) : null}
    </Link>
  );
}
