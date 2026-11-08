"use client";

/**
 * Назначения конкретного предмета (ЗАДАЧА «Пройти назначение» на странице
 * предмета): блок в самом верху вкладки «Тесты». Два режима запуска —
 * «Подготовка» (проверка сразу, не считается) и «Пройти назначение»
 * (полное тестирование, результат уходит преподавателю).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, GraduationCap, PlayCircle, BookOpen } from "lucide-react";
import { listAssignedTests, type AssignedTest } from "@/lib/api/tests";

export function SubjectAssignments({ subjectId }: { subjectId: string }) {
  const [items, setItems] = useState<AssignedTest[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listAssignedTests();
      if (cancelled) return;
      if (result.ok) {
        setItems(
          (result.data.items || []).filter((item: any) => String(item.subject_id || "") === String(subjectId)),
        );
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  if (!loaded || items.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/60 p-4 shadow-sm"
      aria-label="Назначенные тесты предмета"
    >
      <h2 className="flex items-center gap-2 text-base font-extrabold text-[var(--status-warn-fg)]">
        <GraduationCap className="h-5 w-5" /> Назначено преподавателем
      </h2>
      <p className="mt-1 text-xs text-[var(--status-warn-fg)]">
        «Пройти назначение» — полное тестирование, результат уйдёт в ведомость преподавателя.
        «Подготовка» — свободный прогон с проверкой сразу, не считается.
      </p>
      <div className="mt-3 space-y-2">
        {items.map((item) => {
          const overdue = item.due_at ? Date.parse(item.due_at) < Date.now() : false;
          const count = item.question_count || 10;
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--status-warn-border)] bg-white p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{item.title || "Тест"}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  {item.teacher_name && <span>{item.teacher_name}</span>}
                  <span>вопросов: {count}</span>
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
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/tests/preparation/${item.test_id}?mode=prepare&count=${count}`}
                  className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700"
                  title="Свободный прогон с проверкой сразу — не считается"
                >
                  <BookOpen className="h-4 w-4" /> Подготовка
                </Link>
                <Link
                  href={`/tests/attempt/${item.test_id}`}
                  className="btn-primary inline-flex items-center gap-1 text-sm"
                  title="Полное тестирование — результат уйдёт преподавателю"
                >
                  <PlayCircle className="h-4 w-4" /> Пройти назначение
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
