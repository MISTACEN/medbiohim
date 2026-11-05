"use client";

/**
 * Кабинет преподавателя (этап H плана).
 *
 * Показывает только то, что входит в область: назначенные группы и студентов,
 * авторские задания и работы по ним. Оценка и возврат на доработку идут через
 * те же серверные маршруты, что и раньше, — сервер заново проверяет область.
 * Пустой кабинет без назначений — нормальное состояние, а не ошибка.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RotateCcw,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { canUseTeacherWorkspace } from "@/shared/permissions";
import { hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  gradeSubmission,
  returnSubmission,
  teacherOverview,
  teacherSubmissions,
  type TeacherOverview,
  type TeacherSubmission,
} from "@/lib/api/teacher";

type Draft = { grade: string; comment: string };

export default function TeacherPage() {
  const { user, loading: authLoading } = useAuth();
  const roles = user?.roles?.length ? user.roles : [user?.role];
  const allowed = canUseTeacherWorkspace(roles);

  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [items, setItems] = useState<TeacherSubmission[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [summary, pending] = await Promise.all([
      teacherOverview(),
      teacherSubmissions("status=submitted"),
    ]);
    if (summary.ok) setOverview(summary.data);
    else setError(describeApiError(summary.error));
    if (pending.ok) setItems(pending.data.items);
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Кабинет преподавателя</h1>
        <p className="page-subtitle">
          Свои задания, назначенные группы и работы на проверку. Всё остальное
          платформа не показывает.
        </p>
      </header>

      {error ? (
        <div className="card border-l-4 p-4 text-sm" role="alert" style={{ borderColor: "var(--status-critical-fg)" }}>
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Группы", value: counts?.groups ?? scope?.groups ?? 0, icon: Users },
          { label: "Студенты", value: counts?.students ?? scope?.students ?? 0, icon: Users },
          { label: "Мои задания", value: counts?.homeworks ?? 0, icon: BookOpen },
          { label: "На проверку", value: counts?.pending ?? 0, icon: ClipboardList },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="card flex items-center gap-3 p-4">
            <Icon className="h-5 w-5" style={{ color: "var(--primary)" }} />
            <div>
              <div className="text-xl font-bold">{value}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
            </div>
          </div>
        ))}
      </section>

      {overview?.groups?.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Назначенные группы
          </h2>
          <div className="flex flex-wrap gap-2">
            {overview.groups.map((group) => (
              <span key={group.id} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)" }}>
                {group.name || group.code || "Группа"}
                {group.course_number ? ` · ${group.course_number} курс` : ""}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Работы на проверку
          </h2>
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
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {item.student_name || "Студент"}
                        {item.submitted_at ? ` · ${new Date(item.submitted_at).toLocaleString("ru-RU")}` : ""}
                      </div>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
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
      </section>

      {overview?.homeworks?.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Мои задания
          </h2>
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
        </section>
      ) : null}
    </div>
  );
}
