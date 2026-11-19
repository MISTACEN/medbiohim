"use client";

/** Блок «Тест по теме»: ссылки на найденные тесты занятия и навигация. */
import Link from "next/link";
import { ArrowRight, ClipboardCheck, FlaskConical } from "lucide-react";
import type { TopicPageState } from "@/components/subjects/lesson/useTopicPage";

export function TopicTestsSection({ topic }: { topic: TopicPageState }) {
  const { slug, isControlWeek, topicTests, isChemistrySubject } = topic;

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <ClipboardCheck className="h-5 w-5 text-indigo-600" /> Тест по теме
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {isControlWeek
          ? "Контрольная работа проверяется на занятии: отдельного теста к ней нет, охват — в плане предмета."
          : "Мини-тесты уже встроены в лекцию — они проверяют каждый блок сразу после теории. Полный тест темы открывается отдельно."}
      </p>
      {isControlWeek ? null : topicTests.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-slate-500">
          Отдельного теста по теме нет. Мини-тесты лекции при этом работают.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {topicTests.map((test) => (
            <li key={test.id}>
              <Link
                href={`/tests/attempt/${encodeURIComponent(test.id)}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3 text-sm transition hover:border-[var(--primary)]/50"
              >
                <span className="font-semibold">{test.title}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href={`/subjects/${encodeURIComponent(slug)}?tab=tests`} className="rounded-xl border border-[var(--border)] px-3 py-2 font-semibold">
          Все тесты предмета
        </Link>
        {/* Вкладка chem есть только у химических предметов: на странице предмета
            она рендерится по тому же признаку (/chem|хим/). Для остальных предметов
            кнопка ведёт в пустую панель — не показываем. */}
        {isChemistrySubject && (
          <Link href={`/subjects/${encodeURIComponent(slug)}?tab=chem`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 font-semibold">
            <FlaskConical className="h-4 w-4" /> Химический модуль: структуры и тренажёры
          </Link>
        )}
      </div>
    </section>
  );
}
