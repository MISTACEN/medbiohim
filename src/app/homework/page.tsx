"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Clock, Loader2, Send } from "lucide-react";
import { listHomeworks, listHomeworkSubmissions, setHomeworkDone, submitHomework, hasToken } from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { describeApiError } from "@/lib/errors";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Настоящий раздел «Задания». Раньше /homework делал redirect на /schedule —
 * таб «ДЗ» в мобильной навигации вёл в расписание, хотя у API есть
 * полноценный роутер заданий. Здесь список ДЗ группы, сдача ответа,
 * отметка о выполнении и оценка с комментарием преподавателя.
 */

type Homework = {
  id: string;
  title: string;
  description?: string | null;
  due_at?: string | null;
  due_date?: string | null;
  status?: string | null;
  my_status?: string | null;
  subjects?: { name?: string | null; slug?: string | null } | null;
};

type Submission = {
  id: string;
  status?: string | null;
  grade?: number | string | null;
  teacher_comment?: string | null;
  text_answer?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
};

type Filter = "active" | "overdue" | "done" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Активные" },
  { id: "overdue", label: "Просроченные" },
  { id: "done", label: "Выполненные" },
  { id: "all", label: "Все" },
];

const SUBMISSION_LABELS: Record<string, string> = {
  submitted: "Сдано, ждёт проверки",
  pending: "На проверке",
  awaiting_review: "На проверке",
  on_review: "На проверке",
  graded: "Проверено",
  returned: "Возвращено на доработку",
};

function fmtDate(value?: string | null): string {
  if (!value) return "";
  const date = value.slice(0, 10).split("-").reverse().join(".");
  const time = value.includes("T") ? value.slice(11, 16) : "";
  return time ? `${date}, ${time}` : date;
}

function isOverdue(h: Homework): boolean {
  const deadline = h.due_at || (h.due_date ? `${h.due_date}T23:59` : "");
  return Boolean(deadline) && new Date(deadline).getTime() < Date.now();
}

function isDone(h: Homework): boolean {
  return String(h.my_status || h.status || "").toLowerCase() === "done";
}

export default function HomeworkPage() {
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [items, setItems] = useState<Homework[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listHomeworks();
    if (result.ok) {
      setItems(Array.isArray(result.data?.items) ? (result.data.items as Homework[]) : []);
    } else {
      setError({ message: describeApiError(result.error), requestId: (result.error as { requestId?: string })?.requestId });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || !hasToken()) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, load]);

  const openCard = async (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    setActionError("");
    setAnswer("");
    if (next && !submissions[id]) {
      setSubmissionsLoading(true);
      const result = await listHomeworkSubmissions(id);
      if (result.ok) {
        setSubmissions((prev) => ({ ...prev, [id]: Array.isArray(result.data?.items) ? result.data.items : [] }));
      } else {
        setActionError(describeApiError(result.error));
      }
      setSubmissionsLoading(false);
    }
  };

  const toggleDone = async (h: Homework) => {
    setBusyId(h.id);
    setActionError("");
    const result = await setHomeworkDone(h.id, !isDone(h));
    if (result.ok) {
      setItems((prev) => prev.map((row) => (row.id === h.id ? { ...row, my_status: !isDone(h) ? "done" : "assigned" } : row)));
    } else {
      setActionError(describeApiError(result.error));
    }
    setBusyId(null);
  };

  const submit = async (h: Homework) => {
    if (!answer.trim()) {
      setActionError("Напишите ответ перед отправкой.");
      return;
    }
    setBusyId(h.id);
    setActionError("");
    const result = await submitHomework(h.id, answer.trim());
    if (result.ok) {
      setAnswer("");
      const refreshed = await listHomeworkSubmissions(h.id);
      if (refreshed.ok) {
        setSubmissions((prev) => ({ ...prev, [h.id]: Array.isArray(refreshed.data?.items) ? refreshed.data.items : [] }));
      }
    } else {
      setActionError(describeApiError(result.error));
    }
    setBusyId(null);
  };

  const filtered = useMemo(() => {
    return items.filter((h) => {
      const done = isDone(h);
      if (filter === "done") return done;
      if (filter === "active") return !done && !isOverdue(h);
      if (filter === "overdue") return !done && isOverdue(h);
      return true;
    });
  }, [items, filter]);

  const counts = useMemo(() => ({
    all: items.length,
    done: items.filter(isDone).length,
    overdue: items.filter((h) => !isDone(h) && isOverdue(h)).length,
    active: items.filter((h) => !isDone(h) && !isOverdue(h)).length,
  }), [items]);

  if (authLoading) return <SkeletonCards count={3} />;

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10" style={{ color: "var(--muted)" }} />
        <h1 className="mt-3 text-xl font-bold">Задания</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Войдите, чтобы видеть домашние задания вашей группы.</p>
        <Link href="/login" className="btn-primary mt-4 inline-block">Войти</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Задания</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Домашние задания группы: сроки, сдача ответов и оценки преподавателя.
          </p>
        </div>
        <Link href="/schedule" className="text-sm font-semibold text-indigo-600 hover:underline">
          Открыть в расписании →
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Фильтры заданий">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
              (filter === id
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] hover:border-indigo-300")
            }
          >
            {label}
            <span className={"ml-1.5 text-xs " + (filter === id ? "text-white/80" : "text-[var(--muted)]")}>
              {counts[id]}
            </span>
          </button>
        ))}
      </nav>

      {error && (
        <ErrorState message={error.message} requestId={error.requestId} retry={() => void load()} />
      )}

      {loading ? (
        <SkeletonCards count={4} />
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 font-semibold">
            {filter === "active" ? "Активных заданий нет" : filter === "overdue" ? "Просроченных заданий нет" : "Заданий пока нет"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Новые задания появятся здесь, когда преподаватель или староста их опубликуют.
          </p>
          <Link href="/schedule" className="btn-primary mt-4 inline-block">Перейти к расписанию</Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((h) => {
            const open = openId === h.id;
            const done = isDone(h);
            const overdue = !done && isOverdue(h);
            const mine = submissions[h.id] || [];
            const graded = mine.find((s) => s.grade != null || s.teacher_comment);
            return (
              <li key={h.id} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => void openCard(h.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{h.title || "Без названия"}</span>
                      {done && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Выполнено</span>}
                      {overdue && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Просрочено</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                      {h.subjects?.name && <span>{h.subjects.name}</span>}
                      {(h.due_at || h.due_date) && (
                        <span className={"inline-flex items-center gap-1 " + (overdue ? "font-semibold text-rose-600" : "")}>
                          <CalendarDays className="h-3.5 w-3.5" /> до {fmtDate(h.due_at || h.due_date)}
                        </span>
                      )}
                      {graded?.grade != null && (
                        <span className="font-semibold text-indigo-600">Оценка: {String(graded.grade)}</span>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={"mt-1 h-4 w-4 shrink-0 transition-transform " + (open ? "rotate-180" : "")} />
                </button>

                {open && (
                  <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    {h.description && <p className="whitespace-pre-line text-sm">{h.description}</p>}

                    {graded?.grade != null && (
                      <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                        <div className="text-sm font-semibold text-indigo-700">Оценка: {String(graded.grade)}</div>
                        {graded.teacher_comment && (
                          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">Комментарий преподавателя: {graded.teacher_comment}</p>
                        )}
                      </div>
                    )}

                    {mine.length > 0 && (
                      <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                        {mine.slice(0, 3).map((s) => (
                          <div key={s.id} className="inline-flex items-center gap-1 rounded-full border bg-[var(--card)] px-2 py-1">
                            <Clock className="h-3 w-3" />
                            {SUBMISSION_LABELS[String(s.status || "").toLowerCase()] || "Сдано"}
                            {s.submitted_at ? ` · ${fmtDate(s.submitted_at)}` : ""}
                          </div>
                        ))}
                      </div>
                    )}

                    {!done && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          rows={3}
                          placeholder="Ваш ответ на задание…"
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyId === h.id}
                            onClick={() => void submit(h)}
                            className="btn-primary inline-flex items-center gap-2 text-sm"
                          >
                            {busyId === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Сдать задание
                          </button>
                          <button
                            type="button"
                            disabled={busyId === h.id}
                            onClick={() => void toggleDone(h)}
                            className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                          >
                            Отметить выполненным
                          </button>
                        </div>
                      </div>
                    )}
                    {done && (
                      <button
                        type="button"
                        disabled={busyId === h.id}
                        onClick={() => void toggleDone(h)}
                        className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                      >
                        Вернуть в работу
                      </button>
                    )}
                    {submissionsLoading && openId === h.id && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
                        <Loader2 className="h-4 w-4 animate-spin" /> Загружаю сдачи…
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {actionError}
        </div>
      )}
    </div>
  );
}
