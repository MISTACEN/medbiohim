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
import { BarChart3, CalendarClock, ClipboardList, Download, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { describeApiError } from "@/lib/errors";
import {
  createTestAssignment,
  deleteTestAssignment,
  downloadAssignmentCsv,
  testAssignmentAnalytics,
  teacherOverview,
  teacherStudents,
  teacherTestAssignments,
  teacherTests,
  type QuestionAnalyticsItem,
  type TeacherOverview,
  type TeacherStudent,
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
  const [target, setTarget] = useState<"groups" | "students">("groups");
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [questionCount, setQuestionCount] = useState("");
  const [instructions, setInstructions] = useState("");
  const [analytics, setAnalytics] = useState<{ id: string; items: QuestionAnalyticsItem[]; unique_students: number } | null>(null);
  const [exporting, setExporting] = useState("");

  async function toggleAnalytics(id: string) {
    if (analytics?.id === id) {
      setAnalytics(null);
      return;
    }
    setBusy("analytics-" + id);
    const result = await testAssignmentAnalytics(id);
    setBusy("");
    if (result.ok) {
      setAnalytics({ id, items: result.data.items, unique_students: result.data.unique_students });
    } else {
      setNote(describeApiError(result.error));
    }
  }

  async function exportCsv(item: TeacherTestAssignment) {
    setExporting(item.id);
    try {
      await downloadAssignmentCsv(
        item.id,
        "vedomost-" + (item.test_title || item.id).slice(0, 40).replace(/[^a-zA-Zа-яА-Я0-9 -]/g, "") + ".csv",
      );
    } catch {
      setNote("Не удалось скачать ведомость");
    }
    setExporting("");
  }

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
    if (summary.ok) {
      const roster = await teacherStudents();
      if (roster.ok) setStudents(roster.data.items);
    }
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
    const targets = target === "groups" ? groupIds : studentIds;
    if (!testId || !targets.length) {
      setNote(target === "groups" ? "Выберите тест и хотя бы одну группу" : "Выберите тест и хотя бы одного студента");
      return;
    }
    setBusy("create");
    setNote("");
    const result = await createTestAssignment({
      test_id: testId,
      group_ids: target === "groups" ? groupIds : undefined,
      student_ids: target === "students" ? studentIds : undefined,
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
      setStudentIds([]);
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
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/teacher/preview/${item.test_id}`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  >
                    Пройти как автор
                  </Link>
                  <button
                    type="button"
                    disabled={busy === "analytics-" + item.id}
                    onClick={() => void toggleAnalytics(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Аналитика
                  </button>
                  <button
                    type="button"
                    disabled={exporting === item.id}
                    onClick={() => void exportCsv(item)}
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" /> {exporting === item.id ? "…" : "CSV"}
                  </button>
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
{analytics?.id === item.id && (
              <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-3 text-sm">
                <div className="mb-1.5 text-xs font-semibold text-slate-600">
                  Вопросы от худшего к лучшему · отвечали {analytics.unique_students} чел.
                </div>
                {analytics.items.length === 0 ? (
                  <div className="text-[var(--muted)]">Попыток с ответами пока нет.</div>
                ) : (
                  <ul className="space-y-1">
                    {analytics.items.map((question) => (
                      <li key={question.question_id} className="flex items-center gap-2">
                        <span className="w-6 text-xs text-slate-400">{question.order}.</span>
                        <span className="min-w-0 flex-1 truncate">{question.text || "—"}</span>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-bold " +
                            (question.correct_percent == null
                              ? "bg-slate-100 text-slate-500"
                              : question.correct_percent >= 70
                                ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                                : question.correct_percent >= 40
                                  ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
                                  : "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")
                          }
                        >
                          {question.correct_percent == null ? "нет данных" : `${question.correct_percent}%`}
                        </span>
                        <span className="w-16 text-right text-xs text-[var(--muted)]">{question.correct}/{question.answered}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>)}
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
          <div className="flex gap-2">
            {(["groups", "students"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTarget(value)}
                className={
                  "rounded-xl px-3 py-1.5 text-sm font-semibold " +
                  (target === value ? "btn-primary" : "rounded-xl border")
                }
              >
                {value === "groups" ? "Группам" : "Отдельным студентам"}
              </button>
            ))}
          </div>
          {target === "students" ? (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">Студенты вашей области</div>
              {students.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-[var(--muted)]">Студентов пока нет.</div>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2">
                  {students.map((student) => (
                    <label key={student.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={studentIds.includes(student.id)}
                        onChange={() =>
                          setStudentIds((current) =>
                            current.includes(student.id)
                              ? current.filter((x) => x !== student.id)
                              : [...current, student.id],
                          )
                        }
                      />
                      <span className="flex-1">{student.name}</span>
                      {student.group && <span className="text-xs text-[var(--muted)]">{student.group}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
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
          )}
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
              disabled={busy === "create" || (target === "groups" ? !overview?.groups?.length : !students.length)}
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
