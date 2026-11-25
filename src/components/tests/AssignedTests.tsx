"use client";

/**
 * Назначенные преподавателем тесты — блок в самом верху экрана тестирования.
 *
 * Показывает не просто список, а состояние каждой работы: не начата, в
 * процессе, пройдена (лучший процент), сколько попыток осталось и когда срок.
 * Данные берутся из существующих эндпоинтов `/tests/assignments` и
 * `/tests/attempts` — второго механизма назначений нет.
 */
import Link from "next/link";
import { CalendarClock, CheckCircle2, CircleDashed, Clock3, PlayCircle } from "lucide-react";
import { useApiRequest } from "@/hooks/useApiRequest";
import { listAssignedTests, listMyAttempts, type AssignedTest } from "@/lib/api/tests";

type AttemptRow = {
  test_id: string;
  status: string;
  percent: number | null;
  group_id: string | null;
  started_at: string | null;
};

type AssignmentView = AssignedTest & {
  used: number;
  best: number | null;
  inProgress: boolean;
  overdue: boolean;
  exhausted: boolean;
  passed: boolean;
};

function buildViews(items: AssignedTest[], attempts: AttemptRow[]): AssignmentView[] {
  const byTest = new Map<string, AttemptRow[]>();
  for (const attempt of attempts) {
    const key = String(attempt.test_id || "");
    if (!key) continue;
    const bucket = byTest.get(key);
    if (bucket) bucket.push(attempt);
    else byTest.set(key, [attempt]);
  }

  return items.map((item) => {
    const rows = (byTest.get(String(item.test_id)) || []).filter(
      (row) => !item.group_id || !row.group_id || String(row.group_id) === String(item.group_id),
    );
    const submitted = rows.filter((row) => row.status === "submitted");
    const best = submitted.reduce<number | null>(
      (acc, row) => (row.percent == null ? acc : Math.max(acc ?? 0, Number(row.percent))),
      null,
    );
    const limit = item.max_attempts ?? null;
    return {
      ...item,
      used: submitted.length,
      best,
      inProgress: rows.some((row) => row.status === "in_progress"),
      overdue: item.due_at ? Date.parse(item.due_at) < Date.now() : false,
      exhausted: limit != null && submitted.length >= limit,
      passed: submitted.length > 0,
    };
  });
}

/** Незавершённые — выше, внутри — по сроку; пройденные уходят вниз. */
function sortViews(items: AssignmentView[]): AssignmentView[] {
  const rank = (item: AssignmentView) => (item.inProgress ? 0 : item.passed ? 2 : 1);
  return [...items].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const aDue = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
    const bDue = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
}

export function AssignedTests() {
  const { data } = useApiRequest<AssignmentView[]>(async () => {
    const [assignments, attempts] = await Promise.all([listAssignedTests(), listMyAttempts()]);
    if (!assignments.ok) return [];
    const rows: AttemptRow[] = attempts.ok ? attempts.data?.items || [] : [];
    return sortViews(buildViews(assignments.data.items || [], rows));
  }, []);

  const items = data ?? [];
  if (items.length === 0) return null;

  const pending = items.filter((item) => !item.passed).length;
  const passed = items.length - pending;

  return (
    <section
      className="rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]/60 p-4 shadow-sm sm:p-5"
      aria-label="Назначенные тесты"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-[var(--status-warn-fg)]">
          <CalendarClock className="h-5 w-5" /> Назначено преподавателем
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[var(--status-warn-fg)]">
            {items.length}
          </span>
        </h2>
        <p className="text-xs font-semibold text-[var(--status-warn-fg)]">
          {pending > 0 ? `К выполнению: ${pending}` : "Все назначения пройдены"}
          {passed > 0 && pending > 0 ? ` · пройдено: ${passed}` : ""}
        </p>
      </div>
      <p className="mt-1 text-xs text-[var(--status-warn-fg)]">
        Это контролируемое тестирование: результат автоматически попадёт в ведомость преподавателя.
      </p>

      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const limit = item.max_attempts ?? null;
          const status = item.inProgress
            ? { text: "В процессе", className: "bg-white text-[var(--status-warn-fg)]" }
            : item.passed
              ? { text: item.best != null ? `Пройдено · лучший ${Math.round(item.best)}%` : "Пройдено", className: "bg-white text-[var(--status-ok-fg)]" }
              : { text: "Не начато", className: "bg-white text-slate-600" };
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--status-warn-border)] bg-white p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{item.title || "Тест"}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.className}`}>
                    {item.passed ? <CheckCircle2 className="h-3 w-3" /> : item.inProgress ? <Clock3 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                    {status.text}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  {item.teacher_name && <span>{item.teacher_name}</span>}
                  {item.question_count != null && <span>вопросов: {item.question_count}</span>}
                  {item.time_limit_sec != null && <span>время: {Math.round(item.time_limit_sec / 60)} мин</span>}
                  <span className={item.exhausted ? "font-semibold text-[var(--status-critical-fg)]" : ""}>
                    попыток: {item.used}
                    {limit != null ? ` из ${limit}` : ""}
                    {item.exhausted ? " · исчерпаны" : ""}
                  </span>
                  {item.due_at && (
                    <span className={item.overdue ? "font-semibold text-[var(--status-critical-fg)]" : ""}>
                      до {new Date(item.due_at).toLocaleString("ru-RU")}
                      {item.overdue ? " · срок вышел" : ""}
                    </span>
                  )}
                </div>
                {item.instructions && <p className="mt-1 text-xs text-slate-500">{item.instructions}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/tests/preparation/${item.test_id}?mode=prepare&count=${item.question_count || 10}`}
                  className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700"
                  title="Свободный прогон с проверкой сразу — не считается"
                >
                  Подготовка
                </Link>
                <Link
                  href={`/tests/attempt/${item.test_id}`}
                  className={item.exhausted ? "inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-500" : "btn-primary inline-flex items-center gap-1 text-sm"}
                >
                  <PlayCircle className="h-4 w-4" />
                  {item.inProgress ? "Продолжить" : item.exhausted ? "Просмотреть" : "Пройти назначение"}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
