"use client";

/**
 * Сводка: сколько дней до КР, что сдавать первым, «сегодня» и правила КР.
 * Всё, что можно посчитать, считается из отметок; AI только добавляет акценты.
 */
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  Circle,
  Clock,
  Loader2,
  Printer,
  Sparkles,
  Target,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import {
  KR_GRADES,
  KR_RULES,
  TEACHER_TEXT,
  nextAction,
  progressOf,
  type AiPlanPatch,
  type Program,
  type RoadmapStep,
  type StudyPlanV2,
} from "@/lib/study/program";

type Props = {
  program: Program;
  roadmap: RoadmapStep[];
  plan: StudyPlanV2;
  done: Record<string, boolean>;
  krDate: string;
  todayIso: string;
  daysLeft: number;
  patch: AiPlanPatch | null;
  aiState: "idle" | "loading" | "done" | "unavailable";
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], value: boolean) => void;
  onKrDate: (value: string) => void;
  onRebuild: () => void;
  onPrint: () => void;
};

const URGENCY_CLASS: Record<string, string> = {
  overdue: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
  today: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  tomorrow: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  soon: "bg-[var(--primary-soft)] text-[var(--primary)]",
  later: "bg-[var(--primary-soft)] text-[var(--primary)]",
  done: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
};

export function ProgramOverview({
  program,
  roadmap,
  plan,
  done,
  krDate,
  todayIso,
  daysLeft,
  patch,
  aiState,
  onToggle,
  onToggleAll,
  onKrDate,
  onRebuild,
  onPrint,
}: Props) {
  const overall = progressOf(program, done);
  const action = nextAction(roadmap);
  const tonight = plan.tonight;
  const tonightMinutes = tonight.reduce((sum, item) => sum + item.minutes, 0);
  let fitMinutes = 0;
  const fits = new Set<string>();
  for (const item of tonight) {
    if (fitMinutes + item.minutes <= 110) {
      fitMinutes += item.minutes;
      fits.add(item.id);
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Target className="h-3.5 w-3.5" /> До КР
          </p>
          <p className="mt-1 text-3xl font-extrabold">
            {daysLeft > 0 ? `${daysLeft} дн.` : daysLeft === 0 ? "сегодня" : "прошла"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {krDate.split("-").reverse().join(".")} · {program.kr.minutes} минут · {program.kr.variants} варианта
          </p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Отработано</p>
          <p className="mt-1 text-3xl font-extrabold">{overall.done}<span className="text-base font-semibold text-[var(--muted)]"> / {overall.total}</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full bg-indigo-600" style={{ width: `${overall.percent}%` }} />
          </div>
        </article>
        <article className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Готовность к КР</p>
          <p className="mt-1 text-3xl font-extrabold">{plan.readiness}%</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Цитология: файлик, схема ЖЦК, ЭМ 10/11</p>
        </article>
      </section>

      <section className="rounded-2xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--status-critical-fg)]">
          <TriangleAlert className="h-4 w-4" /> Главный риск
        </div>
        <p className="mt-1.5 text-sm font-semibold">{program.kr.risk}</p>
      </section>

      {plan.risks.length > 1 ? (
        <section className="card p-4">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4 text-[var(--status-warn-fg)]" /> Что учесть по срокам
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {plan.risks.slice(1).map((risk) => (
              <li key={risk} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-warn-fg)]" />
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {action ? (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">Следующее действие</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{action.text}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-white/10 dark:text-indigo-200">
              <Clock className="h-3.5 w-3.5" /> {action.minutes} мин
            </span>
          </div>
        </section>
      ) : null}

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Сегодня · {todayIso.split("-").reverse().slice(0, 2).join(".")}</h2>
          <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (tonightMinutes > 110 ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]" : "bg-[var(--primary-soft)] text-[var(--primary)]")}>
            {tonightMinutes} мин
          </span>
        </div>
        {tonight.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">На сегодня задач нет. План чист — можно повторить электронограммы.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Вечером реально около 110 минут. Что не влезает — лучше перенести на завтра: план не теряет пункты, но и не делает вид, что вечер резиновый.
            </p>
            <ul className="mt-2 space-y-1">
              {tonight.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(item.id)}
                    aria-pressed={Boolean(done[item.id])}
                    className="flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-[var(--background)]"
                  >
                    {done[item.id] ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
                    )}
                    <span className={done[item.id] ? "line-through opacity-60" : ""}>{item.text}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-[var(--muted)]">
                      {item.minutes} мин
                      {!fits.has(item.id) && !done[item.id] ? <span className="rounded-full bg-[var(--status-warn-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--status-warn-fg)]">не влезет</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Ход сдачи отработок</h2>
          <span className="text-xs text-[var(--muted)]">отметь сданное — план пересоберётся</span>
        </div>
        {roadmap.map((step, index) => (
          <article key={step.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold">{step.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">{step.why}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (URGENCY_CLASS[step.urgency] ?? "")}>
                  {step.deadlineLabel}
                </span>
                <span className="text-xs font-semibold text-[var(--muted)]">{step.doneCount}/{step.total}</span>
                <button
                  type="button"
                  onClick={() => onToggleAll(step.pending.length ? step.pending.map((task) => task.id) : step.tasks.map((task) => task.id), step.pending.length > 0)}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  {step.pending.length ? "Сдать шаг" : "Вернуть"}
                </button>
              </div>
            </div>
            <div className="h-1 bg-[var(--border)]">
              <div className="h-full bg-[var(--status-ok-fg)]" style={{ width: `${step.total ? (step.doneCount / step.total) * 100 : 0}%` }} />
            </div>

            {step.pending.length === 0 ? (
              <p className="px-4 py-3 text-sm text-[var(--status-ok-fg)]">Шаг закрыт. Ничего не осталось.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {step.pending.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(task.id)}
                      className="flex w-full items-start gap-2.5 px-4 py-2 text-left text-sm hover:bg-[var(--background)]"
                    >
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
                      <span className="min-w-0">
                        <span className="block">{task.text}</span>
                        {task.hint ? <span className="mt-0.5 block text-xs text-[var(--muted)]">{task.hint}</span> : null}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-[var(--muted)]">{task.minutes} мин</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {step.blockIds.length > 0 && (
              <div className="flex flex-wrap gap-3 border-t border-[var(--border)] px-4 py-2 text-xs">
                {step.blockIds.map((blockId) => {
                  const block = program.blocks.find((entry) => entry.id === blockId);
                  if (!block) return null;
                  return (
                    <span key={blockId} className="inline-flex items-center gap-1.5 text-[var(--muted)]">
                      <BookOpen className="h-3.5 w-3.5" />
                      {block.lectureId ? (
                        <Link href={`/lectures/${block.lectureId}`} className="font-semibold text-indigo-600 hover:underline">
                          {block.short}
                        </Link>
                      ) : (
                        block.short
                      )}
                      <span>· {block.dateText}</span>
                    </span>
                  );
                })}
              </div>
            )}
            {step.id === "nerve" && step.blockIds.map((blockId) => {
              const block = program.blocks.find((entry) => entry.id === blockId);
              return block?.lectureNote ? (
                <p key={blockId} className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
                  {block.lectureNote}
                </p>
              ) : null;
            })}
          </article>
        ))}
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Target className="h-4 w-4" /> Правила КР
          </h2>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
            Дата КР
            <input
              type="date"
              value={krDate}
              onChange={(event) => onKrDate(event.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs font-semibold"
            />
          </label>
        </div>
        <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
          {KR_RULES.map((rule) => <li key={rule}>— {rule}</li>)}
        </ul>
        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--background)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Оценка</th>
                <th className="px-3 py-1.5 font-semibold">Ошибки в тесте</th>
                <th className="px-3 py-1.5 font-semibold">Электронограмма</th>
              </tr>
            </thead>
            <tbody>
              {KR_GRADES.map((row) => (
                <tr key={row.grade} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-bold">{row.grade}</td>
                  <td className="px-3 py-1.5">{row.errors}</td>
                  <td className="px-3 py-1.5">{row.electronogram}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/tests" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold">
            <ArrowRight className="h-4 w-4" /> Тренировать тесты
          </Link>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            <Printer className="h-4 w-4" /> Печать электронограмм
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-indigo-500" /> ИИ-пересборка
          </h2>
          <button
            type="button"
            onClick={onRebuild}
            disabled={aiState === "loading"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {aiState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {aiState === "loading" ? "Собирает…" : "Пересобрать"}
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Отмечаешь сданное — план по дням пересобирается сам. ИИ расставляет акценты и порядок блоков, но не двигает сроки.
        </p>
        <p className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
          {aiState === "done"
            ? "Акценты обновлены по твоим отметкам."
            : aiState === "unavailable"
              ? "ИИ недоступен — план собран по правилам, это рабочий вариант."
              : aiState === "loading"
                ? "Отправляем отметки на сайтовый ИИ…"
                : "Показываем базовый план; нажми «Пересобрать», чтобы подключить ИИ."}
        </p>
        {patch?.advice.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {patch.advice.map((advice) => <li key={advice}>— {advice}</li>)}
          </ul>
        ) : null}
        {patch?.cut.length ? (
          <div className="mt-3 rounded-xl bg-[var(--status-warn-bg)] p-2.5 text-sm text-[var(--status-warn-fg)]">
            <p className="font-semibold">Честно: не успеть, если ничего не менять</p>
            <ul className="mt-1 space-y-1">
              {patch.cut.map((item) => <li key={item}>— {item}</li>)}
            </ul>
          </div>
        ) : null}
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Текст преподавателя — источник сроков</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--background)] p-3 font-mono text-xs leading-relaxed">
          {TEACHER_TEXT}
        </pre>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Даты и темы на странице взяты отсюда. «На следующую неделю» не превращается в выдуманное число: блок идёт до КР.
        </p>
      </details>
    </div>
  );
}