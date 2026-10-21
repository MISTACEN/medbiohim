"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  GraduationCap,
  ListChecks,
  Lock,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { getColloquium } from "@/lib/api";
import type { TopicId } from "@/lib/physiology-colloquium/content";
import {
  DEFAULT_COLLOQUIUM_CONTENT,
  DEFAULT_COLLOQUIUM_SETTINGS,
  colloquiumAvailability,
  normalizeColloquiumContent,
  normalizeColloquiumSettings,
  type ColloquiumContentSnapshot,
  type ColloquiumSettings,
} from "@/lib/physiology-colloquium/settings";
import {
  overallStats,
  useColloquiumProgress,
} from "@/lib/physiology-colloquium/progress";
import { resolveSubjectSlug } from "@/lib/subjectSlug";
import { ExamView } from "./ExamView";
import { PlanView } from "./PlanView";
import { TasksView } from "./TasksView";
import { TestBankView } from "./TestBankView";
import { TheoryView } from "./TheoryView";
import type { ColloquiumView, Navigate, NavigateOptions } from "./types";

const navItems: { id: ColloquiumView; label: string; icon: LucideIcon }[] = [
  { id: "plan", label: "План", icon: GraduationCap },
  { id: "theory", label: "Теория", icon: BookOpen },
  { id: "tests", label: "Тесты", icon: ListChecks },
  { id: "tasks", label: "Задачи", icon: ClipboardList },
  { id: "exam", label: "Экзамен", icon: Target },
];

export function ColloquiumApp({ subjectId }: { subjectId: string }) {
  const {
    progress,
    ready,
    bestExam,
    toggleTheory,
    markTest,
    toggleTask,
    addExam,
    reset,
  } = useColloquiumProgress();

  const [settings, setSettings] = useState<ColloquiumSettings>(DEFAULT_COLLOQUIUM_SETTINGS);
  const [content, setContent] = useState<ColloquiumContentSnapshot>(DEFAULT_COLLOQUIUM_CONTENT);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const [view, setView] = useState<ColloquiumView>("plan");
  const [theoryTopic, setTheoryTopic] = useState<TopicId | undefined>();
  const [testModule, setTestModule] = useState<string | undefined>();
  const [testOnlyErrors, setTestOnlyErrors] = useState(false);
  const [examActive, setExamActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const subject = resolveSubjectSlug(subjectId) || "physiology";

    getColloquium(subject)
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setSettings(normalizeColloquiumSettings(response.data.settings));
          if (response.data.content) {
            setContent(normalizeColloquiumContent(response.data.content));
          }
          setSettingsError(
            response.data.degraded
              ? "Сервер вернул настройки по умолчанию: сохранённая конфигурация временно недоступна."
              : "",
          );
        } else {
          setSettingsError("Не удалось загрузить настройки коллоквиума. Показаны значения по умолчанию.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsError("Не удалось загрузить настройки коллоквиума. Показаны значения по умолчанию.");
        }
      })
      .finally(() => {
        if (!cancelled) setSettingsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const stats = useMemo(() => overallStats(progress, content), [content, progress]);
  const availability = useMemo(() => colloquiumAvailability(settings), [settings]);

  const availableNav = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.id === "plan") return settings.features.plan;
        if (item.id === "theory") return settings.features.theory;
        if (item.id === "tests") return settings.features.tests;
        if (item.id === "tasks") return settings.features.tasks;
        return settings.features.exam;
      }),
    [settings.features],
  );
  const activeView = availableNav.some((item) => item.id === view)
    ? view
    : availableNav[0]?.id ?? "plan";

  const navigate: Navigate = (nextView, options?: NavigateOptions) => {
    if (examActive && nextView !== "exam") {
      const leave = window.confirm(
        "Экзамен ещё не завершён. Если уйти сейчас, попытка не сохранится. Выйти?",
      );
      if (!leave) return;
      setExamActive(false);
    }

    if (nextView === "theory") {
      setTheoryTopic(options?.topic);
    }
    if (nextView === "tests") {
      setTestModule(options?.module);
      setTestOnlyErrors(Boolean(options?.onlyErrors));
    }
    setView(nextView);
  };

  const counters: Record<ColloquiumView, string> = {
    plan: `${stats.percent}%`,
    theory: `${stats.theoryDone}/${content.theory.length}`,
    tests: `${stats.testAttempted}/${content.tests.length}`,
    tasks: `${stats.tasksDone}/${content.tasks.length}`,
    exam: bestExam ? `${Math.round((bestExam.score / bestExam.total) * 100)}%` : "—",
  };

  if (!ready || !settingsReady) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="card p-8">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-8 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-40 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={"/subjects/" + encodeURIComponent(subjectId)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          К предмету
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <GraduationCap className="h-4 w-4 text-indigo-600" />
          {settings.subject_name}
          {settings.course_number ? ` · ${settings.course_number} курс` : ""}
          {settings.semester ? ` · ${settings.semester} семестр` : ""}
          {bestExam && bestExam.score > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
              <Trophy className="h-3 w-3" />
              лучший экзамен {Math.round((bestExam.score / bestExam.total) * 100)}%
            </span>
          )}
        </div>
      </div>

      {settingsError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {settingsError}
        </div>
      )}

      {!availability.open ? (
        <section className="card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <Lock className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-black text-slate-900">{settings.title}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{availability.reason}</p>
          <Link
            href={"/subjects/" + encodeURIComponent(subjectId)}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Вернуться к предмету
          </Link>
        </section>
      ) : (
        <>
          {!availableNav.length ? (
            <section className="card p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                <Lock className="h-6 w-6" />
              </span>
              <h1 className="mt-4 text-2xl font-black text-slate-900">{settings.title}</h1>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Администратор временно отключил все разделы подготовки. Загляните позже.
              </p>
            </section>
          ) : (
            <>
          <nav className="mobile-scroll-x flex gap-2 overflow-x-auto pb-1" aria-label="Режимы подготовки">
            {availableNav.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition " +
                    (active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-extrabold " +
                      (active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {counters[item.id]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div>
            {activeView === "plan" && (
              <PlanView
                progress={progress}
                stats={stats}
                bestExam={bestExam}
                settings={settings}
                content={content}
                onNavigate={navigate}
                onReset={reset}
              />
            )}
            {activeView === "theory" && (
              <TheoryView
                key={`theory-${theoryTopic ?? "all"}`}
                progress={progress}
                toggleTheory={toggleTheory}
                initialTopic={theoryTopic}
                content={content}
              />
            )}
            {activeView === "tests" && (
              <TestBankView
                key={`tests-${testModule ?? "default"}-${testOnlyErrors ? "errors" : "all"}`}
                progress={progress}
                markTest={markTest}
                initialModule={testModule}
                initialOnlyErrors={testOnlyErrors}
                content={content}
              />
            )}
            {activeView === "tasks" && (
              <TasksView progress={progress} toggleTask={toggleTask} content={content} />
            )}
            {activeView === "exam" && (
              <ExamView
                addExam={addExam}
                onActiveChange={setExamActive}
                settings={settings}
                content={content}
                attemptsUsed={progress.exams.length}
              />
            )}
          </div>

          <p className="px-1 pb-4 text-xs leading-5 text-slate-500">
            Примечание: формулировки и объяснения структурированы для подготовки по предоставленному материалу.
            Для спорных деталей ориентируйся на графики и терминологию преподавателя; в частности, фазы ПД и
            возбудимость ткани могут зависеть от принятой в пособии схемы.
          </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
