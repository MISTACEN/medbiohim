"use client";

/**
 * Тесты преподавателя.
 *
 * Два списка: «Мои тесты» — всё, где автор текущий пользователь, включая
 * черновики; «Доступные» — каталог, который администратор открыл
 * преподавателям (опубликован и не скрыт флагом teacher_visible).
 * Прогон идёт на /teacher/preview/[id] без записи попыток.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, FlaskConical, Loader2, Search } from "lucide-react";
import { teacherTests, type TeacherTestItem } from "@/lib/api/teacher";
import { CreateTestButton } from "@/components/teacher/CreateTest";
import { describeApiError } from "@/lib/errors";

function TestRow({ test }: { test: TeacherTestItem }) {
  const status = test.is_published ? "опубликован" : "черновик";
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="font-semibold">{test.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
          <span>{test.subject_name || "Без предмета"}</span>
          <span aria-hidden>·</span>
          <span>вопросов: {test.question_count}</span>
          <span aria-hidden>·</span>
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              background: test.is_published ? "var(--primary-soft)" : "var(--surface-muted, #f1f5f9)",
              color: test.is_published ? "var(--primary)" : "var(--muted)",
            }}
          >
            {status}
          </span>
          {!test.is_mine && !test.teacher_visible ? (
            <span className="rounded-full px-2 py-0.5" style={{ background: "var(--status-critical-bg)" }}>
              скрыт от преподавателей
            </span>
          ) : null}
        </div>
      </div>
      <Link
        href={`/teacher/preview/${test.id}`}
        className="btn-secondary inline-flex items-center gap-1.5 text-sm"
        title="Открыть тест так, как его увидит студент: без записи попытки и статистики"
      >
        <FlaskConical className="h-4 w-4" /> Проверить глазами студента
      </Link>
    </div>
  );
}

export function MyTests() {
  const [items, setItems] = useState<TeacherTestItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    const result = await teacherTests(q || undefined);
    if (result.ok) {
      setItems(result.data.items);
      setIsAdmin(result.data.is_admin);
    } else {
      setError(describeApiError(result.error));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const mine = items.filter((test) => test.is_mine);

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
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load(query.trim());
              }}
              className="w-56 rounded-xl border py-2 pl-8 pr-3 text-sm"
              placeholder="Поиск по названию…"
              aria-label="Поиск теста по названию"
            />
          </div>
          <button
            type="button"
            onClick={() => void load(query.trim())}
            className="rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            Найти
          </button>
          <CreateTestButton onCreated={() => void load(query.trim())} />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500" aria-busy="true">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Мои тесты
            </h3>
            {mine.length ? (
              mine.map((test) => <TestRow key={test.id} test={test} />)
            ) : (
              <div className="card p-4 text-sm text-[var(--muted)]">
                {isAdmin
                  ? "Ваших тестов нет: все загруженные тесты созданы до появления авторства или импортированы без владельца."
                  : "Вы ещё не создавали тестов. Черновик появится здесь сразу после сохранения — публикация для этого не нужна."}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
