"use client";

/**
 * Назначенные преподавателем тесты (кабинет 8.20 → студент).
 * Появляется над общим меню тестов, только если есть назначения.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { listAssignedTests, type AssignedTest } from "@/lib/api/tests";
import { describeApiError } from "@/lib/errors";

export function AssignedTests() {
  const [items, setItems] = useState<AssignedTest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listAssignedTests();
      if (cancelled) return;
      if (result.ok) setItems(result.data.items);
      else setError(describeApiError(result.error));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;
  if (error || items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/60 p-4 shadow-sm sm:p-5" aria-label="Назначенные тесты">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-[var(--status-warn-fg)]">
        <CalendarClock className="h-5 w-5" /> Назначено преподавателем
      </h2>
      <p className="mt-1 text-xs text-[var(--status-warn-fg)]">
        Это контролируемое тестирование: результат автоматически попадёт в ведомость преподавателя.
      </p>
      <div className="mt-3 space-y-2">
        {items.map((item) => {
          const overdue = item.due_at ? Date.parse(item.due_at) < Date.now() : false;
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--status-warn-border)] bg-white p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{item.title || "Тест"}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  {item.teacher_name && <span>{item.teacher_name}</span>}
                  {item.question_count != null && <span>вопросов: {item.question_count}</span>}
                  {item.time_limit_sec != null && <span>время: {Math.round(item.time_limit_sec / 60)} мин</span>}
                  {item.max_attempts != null && <span>попыток: {item.max_attempts}</span>}
                  {item.due_at && (
                    <span className={overdue ? "font-semibold text-[var(--status-critical-fg)]" : ""}>
                      до {new Date(item.due_at).toLocaleString("ru-RU")}
                      {overdue ? " · срок вышел" : ""}
                    </span>
                  )}
                </div>
                {item.instructions && <p className="mt-1 text-xs text-slate-500">{item.instructions}</p>}
              </div>
              <Link
                href={`/tests/preparation/${item.test_id}?mode=solve&count=${item.question_count || 10}`}
                className="btn-primary text-sm"
              >
                Пройти назначение
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
