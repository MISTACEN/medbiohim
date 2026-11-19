"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";
import { LectureView } from "@/components/lectures/LectureView";
import { TopicHeader } from "@/components/subjects/lesson/TopicHeader";
import { TopicPracticeSections } from "@/components/subjects/lesson/TopicPracticeSections";
import { TopicTestsSection } from "@/components/subjects/lesson/TopicTestsSection";
import { useTopicPage } from "@/components/subjects/lesson/useTopicPage";

/**
 * Страница темы: одно занятие плана = лекция + тест по этой же теме + быстрый
 * поиск по лекциям и тестам предмета.
 *
 * Зачем отдельная страница: на вкладке «План» занятие — это строка, на
 * «Лекциях» — читалка, в «Тестах» — список тестов. Студенту перед занятием
 * нужны лекция и тест рядом, без переключения вкладок и без поиска нужного
 * теста среди двадцати.
 *
 * Источники: статический план кафедры (public/content/<slug>/plan-*.json) для
 * названия и даты занятия, API лекций (body_markdown приходит в списке) и
 * API тестов предмета. Ничего не выдумываем: если лекции или теста по теме
 * нет, страница честно об этом пишет.
 */
export default function TopicPage() {
  const topic = useTopicPage();
  const { slug, week, loading, error, lecture, isControlWeek } = topic;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={`/subjects/${encodeURIComponent(slug)}?tab=plan`} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> К плану предмета
      </Link>

      <TopicHeader topic={topic} />

      {loading && (
        <div className="card flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаю лекцию и тесты…
        </div>
      )}

      {error && <div className="card p-4 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      {!loading && !lecture && !isControlWeek && (
        <div className="card p-5 text-sm text-slate-500">
          Лекции по этой теме пока нет.{" "}
          {/* Вкладка lessons есть только у физиологии; остальным — общий каталог лекций. */}
          <Link
            href={slug === "physiology" ? `/subjects/${encodeURIComponent(slug)}?tab=lessons` : "/lectures"}
            className="font-semibold text-[var(--primary)]"
          >
            Все лекции предмета
          </Link>
        </div>
      )}

      {lecture && (
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <BookOpen className="h-5 w-5 text-indigo-600" /> Лекция
            </h2>
            <Link href={`/lectures/${encodeURIComponent(lecture.id)}`} className="text-sm font-semibold text-[var(--primary)]">
              Отдельная страница →
            </Link>
          </div>
          <LectureView
            lecture={lecture as any}
            lectureId={lecture.id}
            lessonNumber={Number.isFinite(week) ? week : null}
            backHref={`/subjects/${encodeURIComponent(slug)}?tab=lectures`}
            backLabel="Все лекции"
          />
        </section>
      )}

      <TopicPracticeSections topic={topic} />

      <TopicTestsSection topic={topic} />
    </div>
  );
}
