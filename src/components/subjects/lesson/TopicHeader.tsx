"use client";

/** Заголовок страницы темы: бейдж занятия, тема и поиск по лекциям и тестам. */
import Link from "next/link";
import { ClipboardCheck, Search } from "lucide-react";
import type { TopicPageState } from "@/components/subjects/lesson/useTopicPage";

export function TopicHeader({ topic }: { topic: TopicPageState }) {
  const {
    planNote, sessionDate, topicTitle, isControlWeek,
    query, setQuery, searched, hasSearchHits, searchResults,
  } = topic;

  return (
    <header className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">Занятие {Number.isFinite(topic.week) ? topic.week : "—"}</span>
        {sessionDate && <span>{sessionDate}</span>}
        {planNote && <span className="font-normal">· {planNote}</span>}
      </div>
      <h1 className="mt-2 text-base font-bold leading-snug sm:text-xl">{topicTitle || "Тема не найдена в плане"}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isControlWeek
          ? "Контрольное мероприятие плана кафедры: отдельной лекции и теста у занятия нет."
          : "Лекция и тест по этой теме — на одной странице."}
      </p>

      <div className="relative mt-3 sm:mt-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по лекциям и тестам"
          aria-label="Поиск по теме"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
      </div>

      {searched && (
        <div className="mt-3 space-y-2">
          {!hasSearchHits && <p className="text-sm text-slate-500">Ничего не найдено — попробуйте другое слово.</p>}
          {searchResults.lectures.map(({ item, snippet }) => (
            <Link
              key={item.id}
              href={`/lectures/${encodeURIComponent(item.id)}`}
              className="block rounded-xl border border-[var(--border)] p-3 text-sm transition hover:border-[var(--primary)]/50"
            >
              <span className="font-semibold">{item.title}</span>
              {item.topic && <span className="ml-2 text-xs text-slate-500">{item.topic}</span>}
              {snippet && <span className="mt-1 block text-xs text-slate-500">{snippet}</span>}
            </Link>
          ))}
          {searchResults.tests.map((test) => (
            <Link
              key={test.id}
              href={`/tests/attempt/${encodeURIComponent(test.id)}`}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-3 text-sm transition hover:border-[var(--primary)]/50"
            >
              <ClipboardCheck className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold">{test.title}</span>
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
