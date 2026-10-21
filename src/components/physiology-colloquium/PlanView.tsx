"use client";

import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Layers,
  Lightbulb,
  ListChecks,
  RotateCcw,
  Target,
  Trophy,
} from "lucide-react";
import { type PlanStage } from "@/lib/physiology-colloquium/content";
import {
  type ColloquiumProgress,
  type CoverageStats,
  type ExamAttempt,
  isStageComplete,
  nextStep,
  stageStats,
} from "@/lib/physiology-colloquium/progress";
import {
  totalMinutesFor,
  type ColloquiumContentSnapshot,
  type ColloquiumSettings,
} from "@/lib/physiology-colloquium/settings";
import type { Navigate } from "./types";
import { ProgressBar, ReadinessRing, StatTile } from "./ui";

function StageMetrics({ stats }: { stats: CoverageStats }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
      <div className="rounded-lg bg-slate-50 p-2">
        <div className="font-bold text-slate-900">
          {stats.theoryDone}/{stats.theoryTotal}
        </div>
        <div className="text-slate-500">теория</div>
      </div>
      <div className="rounded-lg bg-slate-50 p-2">
        <div className="font-bold text-slate-900">
          {stats.testTotal ? `${stats.testAttempted}/${stats.testTotal}` : "—"}
        </div>
        <div className="text-slate-500">тесты</div>
      </div>
      <div className="rounded-lg bg-slate-50 p-2">
        <div className="font-bold text-slate-900">
          {stats.tasksTotal ? `${stats.tasksDone}/${stats.tasksTotal}` : "—"}
        </div>
        <div className="text-slate-500">задачи</div>
      </div>
    </div>
  );
}

function stageTarget(stage: PlanStage, stageStat: CoverageStats) {
  if (stageStat.theoryDone < stageStat.theoryTotal) {
    return { view: "theory" as const, options: { topic: stage.theoryTopics[0] } };
  }
  if (stageStat.testAttempted < stageStat.testTotal) {
    return { view: "tests" as const, options: { module: stage.testModules[0] } };
  }
  return { view: "tasks" as const, options: {} };
}

export function PlanView({
  progress,
  stats,
  bestExam,
  settings,
  content,
  onNavigate,
  onReset,
}: {
  progress: ColloquiumProgress;
  stats: CoverageStats;
  bestExam: ExamAttempt | null;
  settings: ColloquiumSettings;
  content: ColloquiumContentSnapshot;
  onNavigate: Navigate;
  onReset: () => void;
}) {
  const next = nextStep(progress, content);
  const totalMinutes = totalMinutesFor(settings, content);
  const stageList = content.plan_stages.map((stage) => ({
    stage,
    stats: stageStats(stage, progress, content),
    complete: isStageComplete(stage, progress, content),
  }));
  const lastExam = progress.exams[0] ?? null;
  const passPercent = settings.exam.pass_percent;
  const examHint =
    settings.exam.default_question_count > 0
      ? `${settings.exam.default_question_count} вопросов по умолчанию`
      : "количество вопросов выбирается перед стартом";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-sm">
        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
              <Target className="h-4 w-4" />
              Подготовка к коллоквиуму
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{settings.title}</h1>
            {settings.subtitle && (
              <p className="mt-1 text-sm font-semibold text-slate-700">{settings.subtitle}</p>
            )}
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {settings.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />≈{Math.max(1, Math.round(totalMinutes / 60))} ч
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-indigo-600" />
                {stats.total} учебных единиц
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5">
                <ListChecks className="h-3.5 w-3.5 text-indigo-600" />{stats.testTotal} тестов
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate(next.view, { topic: next.topic, module: next.module })}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                {next.label}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate("exam")}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50"
              >
                <Trophy className="h-4 w-4" />
                Пробный экзамен
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{next.hint}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-3">
            <ReadinessRing percent={stats.percent} label="покрыто" />
            <p className="max-w-44 text-center text-xs leading-5 text-slate-500">
              {stats.done} из {stats.total} единиц материала пройдено
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t border-indigo-100 bg-white/60 p-4 sm:grid-cols-3 sm:p-5">
          <StatTile
            value={`${stats.theoryDone}/${stats.theoryTotal}`}
            label="Теория"
            hint="вопросов-конспектов разобрано"
          />
          <StatTile
            value={`${stats.testAttempted}/${stats.testTotal}`}
            label="Тесты"
            hint={stats.accuracy === null ? "пока нет попыток" : `верно ${stats.accuracy}% попыток`}
            tone="violet"
          />
          <StatTile
            value={`${stats.tasksDone}/${stats.tasksTotal}`}
            label="Ситуационные задачи"
            hint="разобрано самостоятельно"
            tone="emerald"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">План подготовки</h2>
            <p className="mt-1 text-sm text-slate-500">Иди по этапам сверху вниз — прогресс сохраняется в браузере.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {stageList.filter((item) => item.complete).length} из {stageList.length} этапов
          </span>
        </div>

        <div className="space-y-3">
          {stageList.map(({ stage, stats: stageStat, complete }, index) => {
            const target = stageTarget(stage, stageStat);
            const started = stageStat.done > 0;
            return (
              <article
                key={stage.id}
                className={
                  "card p-4 sm:p-5 " +
                  (complete ? "border-emerald-200 bg-emerald-50/30" : started ? "border-indigo-100" : "")
                }
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div
                    className={
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black " +
                      (complete
                        ? "bg-emerald-100 text-emerald-700"
                        : started
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-500")
                    }
                  >
                    {complete ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">{stage.title}</h3>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide " +
                          (complete
                            ? "bg-emerald-100 text-emerald-700"
                            : started
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-slate-100 text-slate-500")
                        }
                      >
                        {complete ? "Готово" : started ? "В работе" : "Не начато"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <Clock className="h-3 w-3" />
                        ≈{stage.minutes} мин
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{stage.subtitle}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{stage.goal}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar
                        value={stageStat.done}
                        total={stageStat.total}
                        tone={complete ? "emerald" : "indigo"}
                        className="max-w-md"
                      />
                      <span className="shrink-0 text-xs font-bold text-slate-600">
                        {stageStat.percent}%
                      </span>
                    </div>
                    <StageMetrics stats={stageStat} />
                    {stageStat.testTotal > 0 && stageStat.testAttempted > 0 && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Верно решено тестов: {stageStat.testCorrect} из {stageStat.testTotal}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    <button
                      type="button"
                      onClick={() => onNavigate(target.view, target.options)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50"
                    >
                      {complete ? "Повторить" : started ? "Продолжить" : "Открыть этап"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onNavigate("theory", { topic: stage.theoryTopics[0] })}
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        теория
                      </button>
                      {stage.testModules.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onNavigate("tests", { module: stage.testModules[0] })}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          тесты
                        </button>
                      )}
                      {stage.taskTopics.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onNavigate("tasks")}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          задачи
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-violet-50 p-2 text-violet-700">
              <Layers className="h-5 w-5" />
            </span>
            <h2 className="font-bold text-slate-900">Как готовиться</h2>
          </div>
          <ol className="mt-4 space-y-3">
            {[
              ["Прочитай теорию этапа", "Ответ + объяснение простыми словами. Отмечай разобранные вопросы."],
              ["Пройди тесты этапа", "Сначала отвечай сам, потом проверяй. Ошибки попадут в отдельный список."],
              ["Разбери ошибки", "Вернись к теории по теме ошибки и пройди тест повторно."],
              ["Реши ситуационные задачи", "Учись применять механизм к опыту, яду или клинической ситуации."],
              ["Сдай пробный экзамен", `${examHint} с таймером. Цель — не ниже ${passPercent}%.`],
            ].map(([title, text], index) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-extrabold text-indigo-700">
                  {index + 1}
                </span>
                <div>
                  <div className="text-sm font-bold text-slate-900">{title}</div>
                  <p className="text-xs leading-5 text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>

        <div className="space-y-4">
          <article className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
                  <Trophy className="h-5 w-5" />
                </span>
                <h2 className="font-bold text-slate-900">Пробный экзамен</h2>
              </div>
              {bestExam && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                  лучший {Math.round((bestExam.score / bestExam.total) * 100)}%
                </span>
              )}
            </div>
            {lastExam ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Последняя попытка: {lastExam.score} из {lastExam.total} (
                {Math.round((lastExam.score / lastExam.total) * 100)}%),{" "}
                {new Date(lastExam.date).toLocaleDateString("ru-RU")}.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Экзамен соберёт случайные вопросы из выбранных разделов и ограничит время. Проходной порог — {passPercent}%.
              </p>
            )}
            <button
              type="button"
              onClick={() => onNavigate("exam")}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
            >
              <Target className="h-4 w-4" />
              {lastExam ? "Пройти ещё раз" : "Начать экзамен"}
            </button>
          </article>

          <article className="card p-5">
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                <BookOpen className="h-5 w-5" />
              </span>
              <h2 className="font-bold text-slate-900">Разделы и объём</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {content.topics.map((topic) => (
                <li key={topic.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-slate-700">{topic.title}</span>
                  <span className="shrink-0 text-xs font-semibold text-slate-400">{topic.range}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-2 text-xs leading-5 text-slate-500">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Прогресс хранится только в этом браузере. Если занимаешься с другого устройства, отметки не переносятся.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Сбросить весь прогресс подготовки? Это действие нельзя отменить.")) onReset();
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить прогресс
        </button>
      </div>
    </div>
  );
}
