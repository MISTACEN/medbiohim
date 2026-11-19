"use client";

/** Блоки занятия из плана кафедры: лабораторная работа и практика занятия. */
import { FlaskConical } from "lucide-react";
import type { TopicPageState } from "@/components/subjects/lesson/useTopicPage";

export function TopicPracticeSections({ topic }: { topic: TopicPageState }) {
  const { labItems, practice } = topic;

  return (
    <>
      {labItems.length > 0 && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FlaskConical className="h-5 w-5 text-[var(--status-ok-fg)]" /> Лабораторная работа
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Лабораторная работа по плану кафедры — {labItems.length} опытов. Ход и уравнения — в блоке практики лекции.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            {labItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>
      )}

      {(practice?.practice || practice?.preparations?.length) && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FlaskConical className="h-5 w-5 text-[var(--status-ok-fg)]" /> Практика занятия
          </h2>
          {practice?.practice && <p className="mt-1 text-sm text-slate-500">{practice.practice}</p>}
          {practice?.preparations?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Гистопрепараты</p>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {practice.preparations.map((item, i) => (
                  <li key={i} className="rounded-full border border-[var(--border)] px-3 py-1">
                    {item.n ? `№${item.n} · ` : ""}
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}
