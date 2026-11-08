"use client";

/**
 * Кабинет преподавателя (этап H плана).
 *
 * Один экран-дашборд: шапка области, четыре KPI по реальным данным API и вкладки
 * — состав групп, работы на проверку, тесты с назначениями, публикации в научном
 * редакторе. Показывает только свою область: назначенные группы, студентов,
 * авторские задания и работы по ним. Оценка и возврат на доработку идут через
 * те же серверные маршруты, что и раньше, — сервер заново проверяет область.
 * Пустой кабинет без назначений — нормальное состояние, а не ошибка.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileUp,
  FlaskConical,
  Loader2,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { canUseTeacherWorkspace } from "@/shared/permissions";
import { hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ImportTest } from "@/components/teacher/ImportTest";
import { MyLectures } from "@/components/teacher/MyLectures";
import { MyQuestionBank } from "@/components/teacher/MyQuestionBank";
import { MyTests } from "@/components/teacher/MyTests";
import { MyStudents } from "@/components/teacher/MyStudents";
import { OpenAnswersReview } from "@/components/teacher/OpenAnswersReview";
import { TestAssignments } from "@/components/teacher/TestAssignments";
import {
  gradeSubmission,
  returnSubmission,
  teacherOverview,
  teacherStudents,
  teacherSubmissions,
  teacherTestAssignments,
  type TeacherOverview,
  type TeacherStudent,
  type TeacherSubmission,
  type TeacherTestAssignment,
} from "@/lib/api/teacher";

type Draft = { grade: string; comment: string };
type Tab = "roster" | "queue" | "tests" | "create" | "publications";

const TABS: Array<{ id: Tab; label: string; icon: typeof UsersRound }> = [
  { id: "roster", label: "Группы и студенты", icon: UsersRound },
  { id: "queue", label: "Работы на проверку", icon: ClipboardList },
  { id: "tests", label: "Тесты и назначения", icon: FlaskConical },
  { id: "create", label: "Создать тест", icon: FileUp },
  { id: "publications", label: "Публикации и редактор", icon: BookOpen },
];

function chipStyle(kind: "ok" | "warn" | "info" | "neutral") {
  if (kind === "ok")
    return { background: "var(--status-ok-bg)", color: "var(--status-ok-fg)", borderColor: "var(--status-ok-border)" };
  if (kind === "warn")
    return { background: "var(--status-warn-bg)", color: "var(--status-warn-fg)", borderColor: "var(--status-warn-border)" };
  if (kind === "info")
    return { background: "var(--status-info-bg)", color: "var(--status-info-fg)", borderColor: "var(--status-info-border)" };
  return { background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)", borderColor: "var(--status-neutral-border)" };
}

export default function TeacherPage() {
  const { user, loading: authLoading } = useAuth();
  const roles = user?.roles?.length ? user.roles : [user?.role];
  const allowed = canUseTeacherWorkspace(roles);

  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [items, setItems] = useState<TeacherSubmission[]>([]);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [assignments, setAssignments] = useState<TeacherTestAssignment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<Tab>("roster");

  const load = useCallback(async () => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [summary, pending, roster, assignmentsResult] = await Promise.all([
      teacherOverview(),
      teacherSubmissions("status=submitted"),
      teacherStudents(),
      teacherTestAssignments(),
    ]);
    if (summary.ok) setOverview(summary.data);
    else setError(describeApiError(summary.error));
    if (pending.ok) setItems(pending.data.items);
    if (roster.ok) setStudents(roster.data.items);
    if (assignmentsResult.ok) setAssignments(assignmentsResult.data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && allowed) void load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, allowed, load]);

  function draftFor(id: string): Draft {
    return drafts[id] || { grade: "", comment: "" };
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), ...patch } }));
  }

  async function submit(id: string, mode: "grade" | "return") {
    const draft = draftFor(id);
    const grade = Number(draft.grade);
    if (mode === "grade" && (!Number.isFinite(grade) || grade < 0 || grade > 100)) {
      setNote("Оценка — число от 0 до 100");
      return;
    }
    if (mode === "return" && !draft.comment.trim()) {
      setNote("Опишите, что нужно исправить");
      return;
    }
    setBusy(id);
    setNote("");
    const result =
      mode === "grade"
        ? await gradeSubmission(id, grade, draft.comment)
        : await returnSubmission(id, draft.comment);
    setBusy("");
    if (!result.ok) {
      setError(describeApiError(result.error));
      return;
    }
    setItems((rows) => rows.filter((row) => row.id !== id));
    setNote(mode === "grade" ? "Оценка сохранена" : "Работа возвращена на доработку");
    void load();
  }

  const kpi = useMemo(() => {
    const scored = students.filter((student) => student.avg_percent != null);
    const average =
      scored.length > 0
        ? Math.round((scored.reduce((sum, student) => sum + (student.avg_percent || 0), 0) / scored.length) * 10) / 10
        : null;
    const targeted = assignments.reduce((sum, item) => sum + (item.students_targeted || 0), 0);
    const completed = assignments.reduce((sum, item) => sum + (item.completed || 0), 0);
    const coverage = targeted > 0 ? Math.round((completed / targeted) * 100) : null;
    return { average, scored: scored.length, targeted, completed, coverage };
  }, [students, assignments]);

  if (authLoading || (loading && allowed && hasToken())) {
    return (
      <div className="flex items-center gap-2 text-sm" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загружаем кабинет преподавателя…
      </div>
    );
  }

  if (!hasToken()) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="page-title">Кабинет преподавателя</h1>
        <p className="page-subtitle">Сначала войдите в аккаунт.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="page-title">Только для преподавателей</h1>
        <p className="page-subtitle">
          Раздел доступен роли «преподаватель» и администратору. Роль выдаёт
          администратор в разделе «Пользователи и роли».
        </p>
        <Link href="/" className="btn-secondary mt-4 inline-flex">
          На главную
        </Link>
      </div>
    );
  }

  const counts = overview?.counts;
  const scope = overview?.scope;
  const groupNames = (overview?.groups || [])
    .map((group) => group.name || group.code || "Группа")
    .slice(0, 4);

  const metrics = [
    {
      id: "groups",
      label: "Назначенные группы",
      value: String(counts?.groups ?? scope?.groups ?? 0),
      hint: `${counts?.students ?? scope?.students ?? 0} студ.`,
      footer: groupNames.length ? groupNames.join(" · ") : "Назначение выдаёт администратор",
      chip: "адм.",
      chipKind: "neutral" as const,
      icon: UsersRound,
      tone: "var(--primary)",
      toneBg: "var(--status-info-bg)",
    },
    {
      id: "tests",
      label: "Активные тестирования",
      value: String(assignments.length),
      hint: "назначено",
      footer:
        kpi.coverage == null
          ? "Назначений пока нет"
          : `Сдали ${kpi.completed} из ${kpi.targeted} · ${kpi.coverage}% охват`,
      chip: kpi.coverage == null ? "" : `${kpi.coverage}%`,
      chipKind: "info" as const,
      icon: FlaskConical,
      tone: "var(--primary)",
      toneBg: "var(--status-info-bg)",
    },
    {
      id: "average",
      label: "Средний балл по тестам",
      value: kpi.average == null ? "—" : `${kpi.average}%`,
      hint: kpi.average == null ? "" : "по вашим тестам",
      footer:
        kpi.average == null
          ? "Пока нет завершённых попыток"
          : `${kpi.scored} студ. с результатами`,
      chip: kpi.average != null && kpi.average >= 80 ? "выше порога" : "",
      chipKind: "ok" as const,
      icon: CheckCircle2,
      tone: "var(--status-ok-fg)",
      toneBg: "var(--status-ok-bg)",
    },
    {
      id: "pending",
      label: "Ожидают проверки",
      value: String(counts?.pending ?? items.length),
      hint: "работ",
      footer: `Проверено ${counts?.graded ?? 0} · возвращено ${counts?.returned ?? 0}`,
      chip: (counts?.pending ?? items.length) > 0 ? "требует внимания" : "очередь пуста",
      chipKind: (counts?.pending ?? items.length) > 0 ? ("warn" as const) : ("ok" as const),
      icon: ClipboardList,
      tone: "var(--status-critical-fg)",
      toneBg: "var(--status-critical-bg)",
    },
  ];

  const tabCounts: Record<Tab, string> = {
    roster: counts?.students ? String(counts.students) : "",
    queue: String(counts?.pending ?? items.length),
    tests: String(assignments.length),
    create: "",
    publications: "",
  };

  return (
    <div className="space-y-5">
      {/* Шапка области: статус модуля, кто преподаватель и что именно ему разрешено. */}
      <header className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
            style={chipStyle("ok")}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-ok-fg)" }} />
            Кабинет преподавателя · подключён к ядру MEDBIOHIM
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
            style={chipStyle(scope && !scope.active ? "warn" : "info")}
          >
            {scope && !scope.active
              ? "Область не назначена — видны только свои задания"
              : "Полномочия выданы администратором"}
          </span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="page-title">Кабинет преподавателя</h1>
            <p className="page-subtitle">
              {user?.name ? <strong>{user.name}</strong> : "Преподаватель"} · только назначенные группы
              {groupNames.length ? ` (${groupNames.join(", ")})` : ""}. Режим аудита и рецензирования.
            </p>
            {overview?.subjects?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {overview.subjects.map((subject) => (
                  <span
                    key={subject.id}
                    className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                    style={chipStyle("neutral")}
                  >
                    {subject.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => setTab("roster")}>
              <UsersRound className="h-4 w-4" /> Ведомость успеваемости
            </button>
            <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-sm" onClick={() => setTab("publications")}>
              <BookOpen className="h-4 w-4" /> Опубликовать материал
            </button>
            <button type="button" className="btn-primary inline-flex items-center gap-1.5 text-sm" onClick={() => setTab("create")}>
              <FileUp className="h-4 w-4" /> Создать тест
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div
          className="card p-4 text-sm"
          role="alert"
          style={{ borderLeft: "4px solid var(--status-critical-fg)", color: "var(--status-critical-fg)" }}
        >
          {error}
        </div>
      ) : null}
      {note ? (
        <div className="card p-3 text-sm" role="status">{note}</div>
      ) : null}

      {scope && !scope.active ? (
        <div className="card p-4 text-sm">
          <strong>Область пока не назначена.</strong>{" "}
          {scope.available
            ? "Авторские задания доступны, но чужие группы и студенты — нет. Попросите администратора назначить группы в разделе «Преподаватели»."
            : "Таблица назначений ещё не применена на этом окружении: кабинет работает только с вашими заданиями."}
        </div>
      ) : null}

      {/* KPI: только реальные значения из /teacher/overview, /teacher/students и /teacher/test-assignments. */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ id, label, value, hint, footer, chip, chipKind, icon: Icon, tone, toneBg }) => (
          <div key={id} className="card flex flex-col justify-between gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--text)" }}>{value}</span>
                  <span className="text-xs text-[var(--muted)]">{hint}</span>
                </div>
              </div>
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: toneBg, color: tone }}
              >
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--muted)]">
              <span className="min-w-0 truncate">{footer}</span>
              {chip ? (
                <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={chipStyle(chipKind)}>
                  {chip}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      {/* Вкладки: одна область работы за раз вместо длинной ленты блоков. */}
      <div
        className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[var(--border)] p-1.5"
        role="tablist"
        aria-label="Разделы кабинета преподавателя"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className="flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition"
              style={active ? { background: "var(--primary)", color: "#fff" } : { color: "var(--muted)" }}
            >
              <Icon className="h-4 w-4" />
              {label}
              {tabCounts[id] ? (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[11px] font-bold"
                  style={
                    active
                      ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                      : { background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)" }
                  }
                >
                  {tabCounts[id]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "roster" ? <MyStudents /> : null}

      {tab === "queue" ? (
        <section className="space-y-3" role="tabpanel">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Работы на проверку</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Открытые ответы по вашим заданиям. Комментарий обязателен только при возврате.
              </p>
            </div>
            <button type="button" className="btn-secondary text-xs" onClick={() => void load()}>
              Обновить
            </button>
          </div>

          {items.length === 0 ? (
            <div className="card flex items-center gap-2 p-4 text-sm" style={{ color: "var(--muted)" }}>
              <CheckCircle2 className="h-4 w-4" />
              Новых работ нет — всё проверено.
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const draft = draftFor(item.id);
                return (
                  <li key={item.id} className="card space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {item.homework_title || "Задание"}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {item.student_name || "Студент"}
                          {item.submitted_at ? ` · ${new Date(item.submitted_at).toLocaleString("ru-RU")}` : ""}
                        </div>
                      </div>
                      <span className="rounded-full px-2 py-0.5 text-[11px]" style={chipStyle("info")}>
                        {item.status === "submitted" ? "На проверке" : item.status || "—"}
                      </span>
                    </div>

                    {item.text_answer ? (
                      <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>
                        {item.text_answer}
                      </p>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        Текстового ответа нет — откройте работу в разделе ДЗ.
                      </p>
                    )}

                    <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)]">
                      <input
                        value={draft.grade}
                        onChange={(event) => patchDraft(item.id, { grade: event.target.value })}
                        inputMode="numeric"
                        placeholder="0…100"
                        aria-label="Оценка"
                        className="rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                        style={{ borderColor: "var(--border)" }}
                      />
                      <input
                        value={draft.comment}
                        onChange={(event) => patchDraft(item.id, { comment: event.target.value })}
                        placeholder="Комментарий (обязателен для возврата)"
                        aria-label="Комментарий"
                        className="min-w-0 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                        style={{ borderColor: "var(--border)" }}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        disabled={busy === item.id}
                        onClick={() => void submit(item.id, "grade")}
                      >
                        {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Оценить
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        disabled={busy === item.id}
                        onClick={() => void submit(item.id, "return")}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Вернуть на доработку
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {overview?.homeworks?.length ? (
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Мои задания
              </h3>
              <ul className="space-y-2">
                {overview.homeworks.map((homework) => (
                  <li key={homework.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span className="font-medium">{homework.title}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {homework.due_at ? `до ${new Date(homework.due_at).toLocaleDateString("ru-RU")}` : "без срока"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 8.39–8.42: очередь открытых ответов тестов (попытки + сессии подготовки). */}
          <OpenAnswersReview />
        </section>
      ) : null}

      {tab === "create" ? (
        <div className="space-y-6" role="tabpanel">
          <ImportTest onCreated={() => void load()} />
        </div>
      ) : null}

      {tab === "tests" ? (
        <div className="space-y-6" role="tabpanel">
          <MyTests />
          <TestAssignments />
        </div>
      ) : null}

      {tab === "publications" ? (
        <div className="space-y-6" role="tabpanel">
          <MyLectures />
          <MyQuestionBank />
        </div>
      ) : null}
    </div>
  );
}
