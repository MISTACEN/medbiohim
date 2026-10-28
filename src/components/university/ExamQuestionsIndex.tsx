"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { getExamQuestionsSummary } from "@/lib/api";
import { resolveSubjectSlug } from "@/lib/subjectSlug";

type SummaryRow = { slug: string; name: string; count: number };

/**
 * Экзаменационные вопросы кафедр по предметам — точка входа со страницы вуза.
 * Показываем только предметы, у которых есть опубликованные вопросы и которые
 * открываются как страница предмета; иначе ссылка вела бы в 404.
 */
export default function ExamQuestionsIndex() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const response = await getExamQuestionsSummary();
      if (!alive) return;
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      setRows(
        items
          .map((item: any) => ({
            slug: resolveSubjectSlug(String(item.slug || ""), String(item.name || "")) || "",
            name: String(item.name || item.slug || ""),
            count: Number(item.count) || 0,
          }))
          .filter((item: SummaryRow) => item.slug && item.count > 0)
          .slice(0, 8)
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (failed || !rows.length) return null;

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-sky-900">
            <ListChecks className="h-5 w-5" /> Вопросы к экзамену по предметам
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-sky-900/80">
            Перечни вопросов кафедр, собранные в одном месте: открывайте предмет и вкладку «Вопросы к экзамену»,
            чтобы готовиться по темам и отмечать разобранное.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <Link
              key={row.slug}
              href={`/subjects/${encodeURIComponent(row.slug)}?tab=exam`}
              className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              {row.name}
              <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">{row.count}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
