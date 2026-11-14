"use client";

/**
 * «Учёба» — центральный учебный хаб.
 *
 * Раскладка (по референсам Stitch, тема Clinical Precision): сверху компактная
 * сводка с цифрами и полосками прогресса, дальше две колонки — слева то, что
 * делаем сегодня (ИИ-план дня, лента «Ближайшее», план подготовки), справа
 * вспомогательное (слабые места, карточки, недавнее). Ниже — тяжёлые разделы
 * академического состояния, прогресса и отработок; к ним ведут якоря в шапке,
 * чтобы страница не читалась одной сплошной простынёй.
 *
 * Смысловые блоки страницы:
 *  1. сводка — прогресс, ДЗ, тесты, долги, дни до КР;
 *  2. план на сегодня — ИИ-план (context_scope=study) с фолбэком по срокам;
 *  3. лента «Ближайшее» — аттестации, ДЗ, отработки одним таймлайном
 *     (общий buildAgenda с /schedule), у аттестаций — ИИ-чеклист и план;
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
import ExamAgent from "@/components/study/ExamAgent";
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

/** Плитка сводки: цифра, пояснение и полоска прогресса. */
function StatTile({
  label,
  value,
  hint,
  barPct,
  barTone,
}: {
  label: string;
  value: string;
  hint?: string;
  barPct?: number;
  barTone?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-extrabold leading-none tabular-nums tracking-tight">{value}</span>
        {hint ? <span className="text-[11px] font-semibold text-[var(--muted)]">{hint}</span> : null}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--primary-soft)]">
        <div
          className={"h-full rounded-full transition-[width] duration-500 " + (barTone || "bg-[var(--primary)]")}
          style={{ width: `${Math.max(0, Math.min(100, Number(barPct ?? 0)))}%` }}
        />
      </div>
    </div>
  );
}

const ANCHORS = [
  { href: "#today", label: "Сегодня" },
  { href: "#timeline", label: "Ближайшее" },
  { href: "#prep", label: "Подготовка" },
  { href: "#plan", label: "Учебный план" },
  { href: "#progress", label: "Прогресс" },
  { href: "#assignments", label: "Отработки" },
];

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
  const homeworkPct = homework && homework.total > 0 ? Math.round((homework.done / homework.total) * 100) : 0;
  const testsPct = tests && tests.attempts > 0 ? Math.round(((tests.finished ?? 0) / tests.attempts) * 100) : 0;
  const daysLeft = krDate && today ? daysBetween(krDate, today) : 0;
  const loading = agendaLoading || progressLoading;

  return (
    <div className="mx-auto max-w-[1320px] space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-200/50 via-violet-200/40 to-transparent blur-2xl dark:from-indigo-500/15 dark:via-violet-500/10"
        />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
            <GraduationCap className="h-3.5 w-3.5" /> Учёба
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]">План, отработки и прогресс в одном месте</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Сводка считается по расписанию, официальному плану, тестам и вашим отметкам. ИИ-ассистент помогает собрать план дня и подготовиться к контрольным.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              label="Общий прогресс"
              value={overall != null ? `${Math.round(Number(overall))}%` : "—"}
              hint={studyProgress.total ? `${studyProgress.done} из ${studyProgress.total} задач` : undefined}
              barPct={overall != null ? Number(overall) : 0}
            />
            <StatTile
              label="ДЗ"
              value={homework && homework.total > 0 ? `${homework.done}/${homework.total}` : "—"}
              hint={homework && homework.total > 0 ? `${homeworkPct}%` : undefined}
              barPct={homeworkPct}
              barTone="bg-[var(--status-ok-fg)]"
            />
            <StatTile
              label="Тесты"
              value={tests && tests.attempts > 0 ? `${tests.finished ?? 0}/${tests.attempts}` : "—"}
              hint={tests?.avg_score != null ? `ср. ${Math.round(Number(tests.avg_score))}` : undefined}
              barPct={testsPct}
              barTone="bg-[var(--status-info-fg)]"
            />
            <StatTile
              label="Долги"
              value={String(totalDebts)}
              hint={totalDebts ? "закрыть в отработках" : "нет"}
              barPct={totalDebts ? 100 : 0}
              barTone={totalDebts ? "bg-[var(--status-critical-fg)]" : "bg-[var(--status-ok-fg)]"}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted)]">
            <span>
              Подготовка к КР: <b className="font-semibold text-[var(--text)]">{fmtDate(krDate)}</b>
              {daysLeft > 0 ? ` · осталось ${daysLeft} дн.` : ""}
            </span>
            <span>Задачи подготовки: {studyProgress.done} из {studyProgress.total}</span>
            {authLoading || loading ? (
              <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> обновляем</span>
            ) : null}
            {!loggedIn && !authLoading ? (
              <Link href="/login" className="font-semibold text-[var(--primary)]">Войти, чтобы вести отработки</Link>
            ) : null}
          </div>
          {progressError ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--status-critical-fg)]">
              <TriangleAlert className="h-4 w-4" /> {progressError}
            </p>
          ) : null}

          <nav aria-label="Разделы страницы" className="mt-4 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
            {ANCHORS.map((anchor) => (
              <a
                key={anchor.href}
                href={anchor.href}
                className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
              >
                {anchor.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="space-y-5 lg:col-span-2">
          <section id="today" className="scroll-mt-24">
            <TodayPlan agenda={agenda} />
          </section>
          <section id="timeline" className="scroll-mt-24">
            <AgendaTimeline agenda={agenda} loading={agendaLoading} onPrep={setPrepTarget} onPlan={setPlanTarget} />
          </section>
        </div>

        <aside className="space-y-5">
          <WeakTopics academic={academic} />
          <SrsDueCard />
          <RecentActivity />
        </aside>
      </div>

      <section id="prep" className="scroll-mt-24">
        <StudySection />
      </section>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <ExamAgent />
        <StudyAssistant />
      </div>

      <section id="plan" className="scroll-mt-24">
        <AcademicSection />
      </section>

      <section id="progress" className="scroll-mt-24">
        <ProgressSection />
      </section>

      <section id="assignments" className="scroll-mt-24">
        <AssignmentsSection />
      </section>

      {prepTarget ? <PrepChecklist item={prepTarget} onClose={() => setPrepTarget(null)} /> : null}
      {planTarget ? <PrepPlan item={planTarget} onClose={() => setPlanTarget(null)} /> : null}
    </div>
  );
}
