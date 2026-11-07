"use client";

/**
 * Назначения тестов (кабинет преподавателя, пункты 8.20–8.24).
 *
 * Преподаватель назначает опубликованный тест своим группам: дедлайн,
 * лимит времени, число попыток, сколько вопросов взять из банка. Ниже —
 * сводка: сколько прошли, сколько в ожидании, средний процент группы.
 * Вне области (чужие группы) сервер не даст создать назначение.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { describeApiError } from "@/lib/errors";
import {
  createTestAssignment,
  deleteTestAssignment,
  teacherOverview,
  teacherTestAssignments,
  teacherTests,
  type TeacherOverview,
  type TeacherTestAssignment,
  type TeacherTestItem,
} from "@/lib/api/teacher";

export function TestAssignments() {
  const [assignments, setAssignments] = useState<TeacherTestAssignment[]>([]);
  const [tests, setTests] = useState<TeacherTestItem[]>([]);
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [testId, setTestId] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [questionCount, setQuestionCount] = useState("");
  const [instructions, setInstructions] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [list, catalog, summary] = await Promise.all([
      teacherTestAssignments(),
      teacherTests(),
      teacherOverview(),
    ]);
    if (list.ok) setAssignments(list.data.items);
    else setError(describeApiError(list.error));
    if (catalog.ok) {
      setTests(catalog.data.items);
      if (!testId && catalog.data.items.length) setTestId(catalog.data.items[0].id);
    }
    if (summary.ok) setOverview(summary.data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleGroup(id: string) {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function submit() {
    if (!testId || !groupIds.length) {
      setNote("Выберите тест и хотя бы одну группу");
      return;
    }
    setBusy("create");
    setNote("");
    const result = await createTestAssignment({
      test_id: testId,
      group_ids: groupIds,
      due_at: dueAt || null,
      time_limit_sec: timeLimitMin ? Number(timeLimitMin) * 60 : null,
      max_attempts: maxAttempts ? Number(maxAttempts) : null,
      question_count: questionCount ? Number(questionCount) : null,
      instructions: instructions || null,
    });
    setBusy("");
    if (result.ok) {
      setNote(`Назначено: ${result.data.test_title}`);
      setCreating(false);
      setGroupIds([]);
      setDueAt("");
      setTimeLimitMin("");
      setMaxAttempts("");
      setQuestionCount("");
      setInstructions("");
      await load();
    } else {
      setNote(describeApiError(result.error));
    }
  }

  async function remove(id: string) {
    setBusy("revoke-" + id);
    const result = await deleteTestAssignment(id);
    setBusy("");
    if (result.ok) {
      setNote("Назначение отменено");
      await load();
    } else {
      setNote(describeApiError(result.error));
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CalendarClock className="h-5 w-5 text-indigo-600" /> Назначения тестов
        </h2>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="btn-secondary inline-flex items-center gap-1"
          disabled={!tests.length}
        >
          <Plus className="h-4 w-4" /> Назначить тест
        </button>
      </div>

      {note && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{note}</div>}
      {error && <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      {loading && (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}

      {!loading && assignments.length === 0 && !creating && (
        <div className="card p-5 text-sm text-[var(--muted)]">
          Назначений пока нет. Выберите тест, отметьте свои группы и задайте срок — студенты увидят
          его в разделе «Тесты».
        </div>
      )}

      {!loading && assignments.length > 0 && (
        <div className="space-y-2">
          {assignments.map((item) => (
            <div key={item.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{item.test_title || "Тест"}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                      {item.individual ? "персонально" : item.group_name || "группа"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                      прошли {item.completed} / {item.students_targeted}
                    </span>
                    {item.avg_percent != null && (
                      <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 font-semibold text-[var(--status-ok-fg)]">
                        средний {item.avg_percent}%
                      </span>
                    )}
                    {item.pending > 0 && (
                      <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 font-semibold text-[var(--status-warn-fg)]">
                        ожидают: {item.pending}
                      </span>
                    )}
                    {item.due_at && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                        до {new Date(item.due_at).toLocaleDateString("ru-RU")}
                      </span>
                    )}
                    {item.max_attempts != null && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                        попыток: {item.max_attempts}
                      </span>
                    )}
                    {item.question_count != null && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                        вопросов: {item.question_count}
                      </span>
                    )}
                  </div>
                  {item.instructions && (
                    <p className="mt-1 text-xs text-[var(--muted)]">{item.instructions}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/teacher/preview/${item.test_id}`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  >
                    Пройти как автор
                  </Link>
                  <button
                    type="button"
                    disabled={busy === "revoke-" + item.id}
                    onClick={() => void remove(item.id)}
                    className="rounded-lg border border-[var(--status-critical-border)] px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)] disabled:opacity-50"
                    title="Отменить назначение"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div className="card space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={testId} onChange={(e) => setTestId(e.target.value)} className="rounded-xl border p-2 text-sm">
              {tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.title} ({test.question_count} вопр.)
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="rounded-xl border p-2 text-sm"
              placeholder="Дедлайн"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">Группы (только назначенные вам)</div>
            {(overview?.groups?.length ?? 0) === 0 ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-[var(--muted)]">
                Вам не назначено ни одной группы — попросите администратора в разделе «Преподаватели».
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {overview?.groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={
                      "rounded-xl px-3 py-1.5 text-sm font-semibold " +
                      (groupIds.includes(group.id)
                        ? "bg-indigo-600 text-white"
                        : "border border-[var(--border)]")
                    }
                  >
                    {group.name || group.code || "Группа"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="block text-xs font-semibold text-slate-600">Лимит времени, мин</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={timeLimitMin}
                onChange={(e) => setTimeLimitMin(e.target.value)}
                className="mt-1 w-full rounded-xl border p-2"
                placeholder="без лимита"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold text-slate-600">Попыток</span>
              <input
                type="number"
                min={1}
                max={100}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="mt-1 w-full rounded-xl border p-2"
                placeholder="без ограничения"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold text-slate-600">Вопросов из банка</span>
              <input
                type="number"
                min={1}
                max={500}
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="mt-1 w-full rounded-xl border p-2"
                placeholder="все"
              />
            </label>
          </div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="min-h-16 w-full rounded-xl border p-3 text-sm"
            placeholder="Инструкция для студентов (необязательно)"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy === "create" || !overview?.groups?.length}
              onClick={() => void submit()}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <ClipboardList className="h-4 w-4" /> {busy === "create" ? "Назначаю…" : "Назначить"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
