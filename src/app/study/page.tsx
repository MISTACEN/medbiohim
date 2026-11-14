"use client";

/**
 * «Учёба» — центральный учебный хаб.
 *
 *  1. сводка — прогресс, ДЗ, тесты, долги, дни до КР;
 *  2. план на сегодня — ИИ-план (context_scope=study) с фолбэком по срокам;
 *  3. лента «Ближайшее» — аттестации, ДЗ, отработки одним таймлайном
 *     (общий buildAgenda с /schedule), у аттестаций — ИИ-чеклист «Готовиться»;
 *  4. слабые места и очередь карточек SRS;
 *  5. ИИ-ассистент с учебным контекстом;
 *  6. подробные разделы: план, прогресс, отработки, подготовка к КР.
 *
 * Старые адреса /academic, /assignments и /progress ведут сюда якорями.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GraduationCap, Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getProgress, hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { HISTOLOGY_PROGRAM, KR_DATE_DEFAULT, progressOf } from "@/lib/study/program";
import { useStudentAgenda } from "@/lib/study/agenda";
import { fmtDate } from "@/lib/study/agenda-fmt";
import { AcademicSection } from "@/components/learning/AcademicSection";
import { AssignmentsSection } from "@/components/learning/AssignmentsSection";
import { ProgressSection } from "@/components/learning/ProgressSection";
import { StudySection } from "@/components/learning/StudySection";
import { AgendaTimeline } from "@/components/study/AgendaTimeline";
import { PrepChecklist } from "@/components/study/PrepChecklist";
import { PrepPlan } from "@/components/study/PrepPlan";
import { RecentActivity } from "@/components/study/RecentActivity";
import { SrsDueCard } from "@/components/study/SrsDueCard";
import { StudyAssistant } from "@/components/study/StudyAssistant";
import { TodayPlan } from "@/components/study/TodayPlan";
import { WeakTopics } from "@/components/study/WeakTopics";
import type { AgendaItem } from "@/lib/study/agenda";

const DONE_KEY = "study.program.done.v2";
const KR_KEY = "study.program.krDate.v2";

type ProgressPayload = {
  overall_pct?: number | null;
  homework?: { total: number; done: number };
  tests?: { attempts: number; finished?: number; avg_score?: number | null };
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isoTodayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

export default function StudyPage() {
  const { loading: authLoading } = useAuth();
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [krDate, setKrDate] = useState(KR_DATE_DEFAULT);
  const [today, setToday] = useState("");
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [prepTarget, setPrepTarget] = useState<AgendaItem | null>(null);
  const [planTarget, setPlanTarget] = useState<AgendaItem | null>(null);

  const { agenda, academic, assignments, loading: agendaLoading } = useStudentAgenda();

  useEffect(() => {
    setDone(readJson<Record<string, boolean>>(DONE_KEY, {}));
    const saved = readJson<string>(KR_KEY, KR_DATE_DEFAULT);
    setKrDate(/^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : KR_DATE_DEFAULT);
    setToday(isoTodayLocal());
    setLoggedIn(hasToken());
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setProgressLoading(true);
    setProgressError("");
    void getProgress().then((result) => {
      if (cancelled) return;
      if (result.ok) setProgress(result.data as ProgressPayload);
      else setProgressError(describeApiError(result.error));
      setProgressLoading(false);
    });
    return () => { cancelled = true; };
  }, [authLoading]);

  const studyProgress = useMemo(() => progressOf(HISTOLOGY_PROGRAM, done), [done]);
  const academicDebts = academic?.debts?.length ?? 0;
  const totalDebts = assignments.filter((item) => item.status !== "passed").length + academicDebts;
  const overall = progress?.overall_pct ?? null;
  const homework = progress?.homework;
  const tests = progress?.tests;
  const daysLeft = krDate && today ? daysBetween(krDate, today) : 0;
  const loading = agendaLoading || progressLoading;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-transparent dark:to-violet-500/10">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-600">
          <GraduationCap className="h-3.5 w-3.5" /> Учёба
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">План, отработки и прогресс в одном месте</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Сводка считается по расписанию, официальному плану, тестам и вашим отметкам. ИИ-ассистент помогает собрать план дня и подготовиться к контрольным.
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
          <span>Подготовка к КР: {fmtDate(krDate)}{daysLeft > 0 ? ` · осталось ${daysLeft} дн.` : ""}</span>
          <span>Задачи подготовки: {studyProgress.done} из {studyProgress.total}</span>
          {authLoading || loading ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> обновляем</span> : null}
          {!loggedIn && !authLoading ? <Link href="/login" className="font-semibold text-indigo-600">Войти, чтобы вести отработки</Link> : null}
        </div>
        {progressError ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--status-critical-fg)]">
            <TriangleAlert className="h-4 w-4" /> {progressError}
          </p>
        ) : null}
      </header>

      <TodayPlan agenda={agenda} />

      <AgendaTimeline agenda={agenda} loading={agendaLoading} onPrep={setPrepTarget} onPlan={setPlanTarget} />

      <div className="grid gap-5 lg:grid-cols-2">
        <WeakTopics academic={academic} />
        <SrsDueCard />
      </div>

      <RecentActivity />

      <StudyAssistant />

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

      {prepTarget ? <PrepChecklist item={prepTarget} onClose={() => setPrepTarget(null)} /> : null}
      {planTarget ? <PrepPlan item={planTarget} onClose={() => setPlanTarget(null)} /> : null}
    </div>
  );
}
