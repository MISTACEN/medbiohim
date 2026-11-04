"use client";

/**
 * Блок «Инструменты и модели» на странице предмета.
 *
 * Показывает только применимые модули и объясняет, почему они здесь: предмет
 * определяется по slug или названию (в базе есть дисциплины с `slug = NULL`),
 * а ссылка несёт предметный контекст, не создавая копию инструмента.
 *
 * Если у модуля есть реальная тема программы с тестами, карточка ведёт прямо
 * на вкладку тестов с фильтром `?topic=` — связь строится по ключевым словам
 * и только при совпадении с существующей темой.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpenCheck, Compass } from "lucide-react";
import {
  MODULE_KIND_LABELS,
  moduleHref,
  modulesForSubject,
  relationFor,
  resolveSubjectAreaKey,
  subjectAreaName,
  type LearningModule,
} from "@/lib/learning/modules";
import { matchTopicForModule, topicTestHref, type TopicRef } from "@/lib/learning/topicLinks";
import { readVisits, recordModuleVisit } from "@/lib/learning/moduleProgress";

export default function SubjectModules({
  slug,
  name,
  subjectId = "",
  topics = [],
}: {
  slug?: string | null;
  name?: string | null;
  subjectId?: string;
  topics?: TopicRef[];
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
          const topic = matchTopicForModule(module, areaKey, topics);
          return (
            <li key={module.id}>
              <ModuleCard
                module={module}
                href={moduleHref(module, { subjectKey: areaKey, topic: relation.topics[0] })}
                reason={relation.reason}
                relationTopics={relation.topics}
                areaKey={areaKey}
                visits={visits[module.id] ?? 0}
                testHref={topic && subjectId ? topicTestHref(subjectId, topic.id) : null}
                testTitle={topic?.title ?? ""}
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
  relationTopics,
  areaKey,
  visits,
  testHref,
  testTitle,
}: {
  module: LearningModule;
  href: string;
  reason: string;
  relationTopics: string[];
  areaKey: string;
  visits: number;
  testHref: string | null;
  testTitle: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--border)] p-3 transition hover:border-[var(--primary)]">
      <Link
        href={href}
        onClick={() => recordModuleVisit(module.id, areaKey)}
        className="group flex items-start justify-between gap-2"
      >
        <span className="text-sm font-semibold leading-snug">{module.title}</span>
        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" />
      </Link>
      <span className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--muted)]">
        {MODULE_KIND_LABELS[module.kind]}
      </span>
      <span className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{reason}</span>
      {visits > 0 ? (
        <span className="mt-2 text-[10px] font-semibold text-[var(--muted)]">
          Открывали {visits} раз — прогресс общий для всех предметов
        </span>
      ) : null}
      {relationTopics.length ? (
        <span className="mt-2 flex flex-wrap gap-1">
          {relationTopics.slice(0, 3).map((topic) => (
            <span key={topic} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
              {topic}
            </span>
          ))}
        </span>
      ) : null}
      {testHref ? (
        <Link
          href={testHref}
          onClick={() => recordModuleVisit(module.id, areaKey)}
          title={testTitle}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] hover:underline"
        >
          <BookOpenCheck className="h-3.5 w-3.5 shrink-0" />
          Тест по теме: {testTitle.length > 64 ? `${testTitle.slice(0, 61)}…` : testTitle}
        </Link>
      ) : null}
    </div>
  );
}
