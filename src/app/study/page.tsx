"use client";

/**
 * «Учёба» — одна страница вместо четырёх.
 *
 * Раньше /study, /academic, /assignments и /progress показывали разные срезы
 * одного и того же: что задано, что просрочено, что сдано и сколько осталось.
 * Студент ходил между вкладками, чтобы собрать картину. Теперь это один экран:
 *
 *  1. сводка — прогресс, ДЗ, тесты, долги, дни до КР;
 *  2. «что делать сейчас» — общий список из отработок, занятий и плана
 *     подготовки, отсортированный по сроку;
 *  3. подробные разделы: учебный план, прогресс по предметам, отработки
 *     и подготовка к КР — без переключения страниц.
 *
 * Старые адреса /academic, /assignments и /progress ведут сюда якорями.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, GraduationCap, Loader2, Target, TriangleAlert } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getAcademicState,
  getProgress,
  hasToken,
  listMyAssignments,
  type AcademicState,
  type MyAssignment,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { HISTOLOGY_PROGRAM, KR_DATE_DEFAULT, progressOf } from "@/lib/study/program";
import { AcademicSection } from "@/components/learning/AcademicSection";
import { AssignmentsSection } from "@/components/learning/AssignmentsSection";
import { ProgressSection } from "@/components/learning/ProgressSection";
import { StudySection } from "@/components/learning/StudySection";

const DONE_KEY = "study.program.done.v2";
const KR_KEY = "study.program.krDate.v2";

type ProgressPayload = {
  overall_pct?: number | null;
  homework?: { total: number; done: number };
  tests?: { attempts: number; finished?: number; avg_score?: number | null };
};

const EVENT_LABEL: Record<string, string> = {
  retake: "пересдача",
  makeup: "досдача",
  exam: "экзамен",
  credit: "зачёт",
  colloquium: "коллоквиум",
  control_work: "контрольная",
  assessment: "аттестация",
};

const ASSIGNMENT_LABEL: Record<string, string> = {
  pending: "ожидает",
  retake_needed: "на отработку",
  passed: "сдано",
  failed: "не сдано",
};

type Action = {
  id: string;
  title: string;
  meta: string;
  date: string | null;
  source: "Отработка" | "Занятие" | "Подготовка";
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isoToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function fmt(value?: string | null): string {
  if (!value) return "без срока";
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : value;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

export default function StudyPage() {
  const { loading: authLoading } = useAuth();
  const [academic, setAcademic] = useState<AcademicState | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [krDate, setKrDate] = useState(KR_DATE_DEFAULT);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setDone(readJson<Record<string, boolean>>(DONE_KEY, {}));
    const saved = readJson<string>(KR_KEY, KR_DATE_DEFAULT);
    setKrDate(/^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : KR_DATE_DEFAULT);
    setToday(isoToday());
    setLoggedIn(hasToken());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [academicResult, progressResult] = await Promise.allSettled([
      getAcademicState(),
      getProgress(),
    ]);

    if (academicResult.status === "fulfilled" && academicResult.value.ok) {
      const data = academicResult.value.data as AcademicState;
      setAcademic({
        ...data,
        debts: Array.isArray(data.debts) ? data.debts : [],
        upcoming: Array.isArray(data.upcoming) ? data.upcoming : [],
        weak_topics: Array.isArray(data.weak_topics) ? data.weak_topics : [],
      });
    } else if (academicResult.status === "fulfilled" && !academicResult.value.ok) {
      setError(describeApiError(academicResult.value.error));
    }

    if (progressResult.status === "fulfilled" && progressResult.value.ok) {
      setProgress(progressResult.value.data as ProgressPayload);
    }

    if (hasToken()) {
      const listed = await listMyAssignments();
      if (listed.ok && Array.isArray(listed.data?.items)) setAssignments(listed.data.items as MyAssignment[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const studyProgress = useMemo(() => progressOf(HISTOLOGY_PROGRAM, done), [done]);
  const openAssignments = useMemo(() => assignments.filter((item) => item.status !== "passed"), [assignments]);
  const academicDebts = academic?.debts?.length ?? 0;
  const totalDebts = openAssignments.length + academicDebts;
  const overall = progress?.overall_pct ?? null;
  const homework = progress?.homework;
  const tests = progress?.tests;
  const daysLeft = krDate && today ? daysBetween(krDate, today) : 0;

  // Один список дел из трёх источников: отработки, занятия и план подготовки.
  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    for (const item of openAssignments) {
      list.push({
        id: `assignment-${item.id}`,
        title: item.topic,
        meta: `${item.subject} · ${ASSIGNMENT_LABEL[item.status] ?? item.status}`,
        date: item.due_date,
        source: "Отработка",
      });
    }
    for (const event of academic?.upcoming ?? []) {
      list.push({
        id: `event-${event.id ?? `${event.date}-${event.start_time}`}`,
        title: `${event.subject_name || "Предмет"} — ${EVENT_LABEL[event.event_kind || ""] || event.event_kind || "занятие"}`,
        meta: [event.start_time ? String(event.start_time).slice(0, 5) : null, event.room ? `ауд. ${event.room}` : null].filter(Boolean).join(" · ") || "по расписанию",
        date: event.date ?? null,
        source: "Занятие",
      });
    }
    for (const block of HISTOLOGY_PROGRAM.blocks) {
      const left = block.tasks.filter((task) => !done[task.id]);
      if (!left.length) continue;
      list.push({
        id: `block-${block.id}`,
        title: block.short,
        meta: `${block.theme} · осталось ${left.length} из ${block.tasks.length}`,
        date: block.due ?? null,
        source: "Подготовка",
      });
    }
    return list.sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [openAssignments, academic, done]);

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-transparent dark:to-violet-500/10">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-600">
          <GraduationCap className="h-3.5 w-3.5" /> Учёба
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">План, отработки и прогресс в одном месте</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Сводка считается по расписанию, официальному плану, тестам и вашим отметкам. Ниже — что делать сейчас и где это отметить.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Общий прогресс", value: overall != null ? `${Math.round(Number(overall))}%` : "—", tone: "text-indigo-700" },
            { label: "ДЗ", value: homework && homework.total > 0 ? `${homework.done}/${homework.total}` : "—", tone: "text-slate-800" },
            { label: "Тесты", value: tests && tests.attempts > 0 ? `${tests.finished ?? 0}/${tests.attempts}` : "—", tone: "text-slate-800" },
            { label: "Долги", value: String(totalDebts), tone: totalDebts ? "text-[var(--status-critical-fg)]" : "text-[var(--status-ok-fg)]" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <div className={`text-xl font-extrabold tabular-nums ${card.tone}`}>{card.value}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          <span>Подготовка к КР: {fmt(krDate)}{daysLeft > 0 ? ` · осталось ${daysLeft} дн.` : ""}</span>
          <span>Задачи подготовки: {studyProgress.done} из {studyProgress.total}</span>
          {authLoading || loading ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> обновляем</span> : null}
          {!loggedIn && !authLoading ? <Link href="/login" className="font-semibold text-indigo-600">Войти, чтобы вести отработки</Link> : null}
        </div>
        {error ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--status-critical-fg)]">
            <TriangleAlert className="h-4 w-4" /> {error}
          </p>
        ) : null}
      </header>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Target className="h-4 w-4" /> Что делать сейчас
          </h2>
          <span className="text-xs text-[var(--muted)]">отработки, занятия и подготовка — одним списком</span>
        </div>
        {loading && !actions.length ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Собираем список…</p>
        ) : actions.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--status-ok-fg)]">Открытых дел нет: отработки закрыты, события не назначены.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {actions.slice(0, 8).map((action) => (
              <li key={action.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{action.title}</div>
                  <div className="text-xs text-[var(--muted)]">{action.meta}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{action.source}</span>
                  <span className="inline-flex items-center gap-1 text-[var(--muted)]"><CalendarDays className="h-3.5 w-3.5" /> {fmt(action.date)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section id="plan" className="scroll-mt-24">
        <AcademicSection />
      </section>

      <section id="progress" className="scroll-mt-24">
        <ProgressSection />
      </section>

      <section id="assignments" className="scroll-mt-24">
        <AssignmentsSection />
      </section>

      <section id="prep" className="scroll-mt-24">
        <StudySection />
      </section>
    </div>
  );
}
