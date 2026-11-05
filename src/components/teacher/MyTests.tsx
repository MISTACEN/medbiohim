"use client";

/**
 * Опубликованные тесты для авторского предпросмотра (модуль teacher).
 * Прогон идёт на /teacher/preview/[id] — без записи попыток и статистики.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, FlaskConical, Loader2, Search } from "lucide-react";
import { teacherTests, type TeacherTestItem } from "@/lib/api/teacher";
import { describeApiError } from "@/lib/errors";

export function MyTests() {
  const [items, setItems] = useState<TeacherTestItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    const result = await teacherTests(q || undefined);
    if (result.ok) setItems(result.data.items);
    else setError(describeApiError(result.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardList className="h-5 w-5 text-indigo-600" /> Тесты и предпросмотр
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(query.trim());
              }}
              className="w-56 rounded-xl border py-2 pl-8 pr-3 text-sm"
              placeholder="Поиск по названию…"
            />
          </div>
          <button type="button" onClick={() => void load(query.trim())} className="rounded-xl border px-3 py-2 text-sm font-semibold">
            Найти
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {loading && (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="card p-5 text-sm text-[var(--muted)]">Опубликованных тестов не найдено.</div>
          )}
          {items.map((test) => (
            <div key={test.id} className="card flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <div className="font-semibold">{test.title}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {test.subject_name || "Без предмета"} · вопросов: {test.question_count}
                </div>
              </div>
              <Link
                href={`/teacher/preview/${test.id}`}
                className="btn-secondary inline-flex items-center gap-1.5 text-sm"
                title="Пройти тест как студент, но без записи попытки и статистики"
              >
                <FlaskConical className="h-4 w-4" /> Пройти как автор
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
