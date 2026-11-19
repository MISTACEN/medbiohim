"use client";

/** Виджеты главной: каждая карточка знает только свои данные. */
import Link from "next/link";
import { AlertTriangle, BookOpen, ChevronRight, ClipboardList, FlaskConical, GraduationCap, Microscope, Sparkles } from "lucide-react";
import { TodaySummary } from "@/components/home/TodaySummary";
import { DailyChemistryTask } from "@/components/home/DailyChemistryTask";
import { homeworkStatusLabel, str } from "@/components/home/dashboard-model";
import type { HomeDashboardState } from "@/components/home/useHomeDashboard";

type WidgetProps = { page: HomeDashboardState };

function AcademicWidget({ page }: WidgetProps) {
  const { academic, academicError, metrics, planNotice, academicLoading, generatePlan } = page;
  return (
    <section className="h-full rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Академическое состояние</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Текущий прогресс и подготовка</h2>
          {academic?.session ? (
            <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{String(academic.session.title || "Текущая сессия")}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/study#plan" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            Открыть план
          </Link>
          <button
            type="button"
            onClick={generatePlan}
            disabled={academicLoading}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {academicLoading ? "Анализирую…" : "Сформировать план подготовки"}
          </button>
        </div>
      </div>
      {academicError ? (
        <p className="mt-4 text-sm text-[var(--status-critical-fg)]">{academicError}</p>
      ) : metrics ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Закрыто", metrics?.closed ?? 0],
            ["В процессе", metrics?.in_progress ?? 0],
            ["Не начато", metrics?.not_started ?? 0],
            ["Долги", metrics?.debts ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{String(value)}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{String(label)}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Метрики появятся после загрузки академического состояния. Нули не подставляются.</p>
      )}
      {academic && !academic.plan?.available ? (
        <p className="mt-4 text-sm text-[var(--status-warn-fg)]">{academic.plan?.message || "Учебный план ещё не загружен."}</p>
      ) : null}
      {planNotice ? <p className="mt-3 text-sm text-[var(--status-ok-fg)]">{planNotice}</p> : null}
    </section>
  );
}

function TestsWidget({ page }: WidgetProps) {
  const { data, testsPreview } = page;
  return (
    <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
        <BookOpen className="h-4 w-4" /> Тесты
      </div>
      <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{(data?.tests || []).length}</div>
      <p className="text-sm text-slate-500 dark:text-slate-400">доступно</p>
      <ul className="mt-3 space-y-2">
        {testsPreview.map((test, i) => (
          <li key={str(test, "id") || String(i)}>
            <Link
              href={str(test, "id") ? `/tests?open=${encodeURIComponent(str(test, "id"))}` : "/tests"}
              className="text-sm font-medium text-slate-800 hover:text-indigo-700 dark:text-slate-200 dark:hover:text-indigo-400"
            >
              {str(test, "title", "name") || "Тест"}
              {str(test, "subject_name") ? <span className="font-normal text-slate-400 dark:text-slate-500"> · {str(test, "subject_name")}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/tests" className="mt-3 inline-flex min-h-[40px] items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
        К тестам <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function SubjectsWidget({ page }: WidgetProps) {
  const { subjects, subjectsError, subjectsView } = page;
  return (
    <section className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200">Мои предметы</h3>
        <Link href="/subjects" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          Все предметы <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {subjectsError ? (
        <p className="text-sm text-[var(--status-critical-fg)]">{subjectsError}</p>
      ) : subjects.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Предметы курса появятся после загрузки каталога. Демо-список не подставляется.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {subjectsView.slice(0, 8).map(({ subject, control, examDate }) => {
            const dateLabel = examDate
              ? examDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
              : "";
            return (
              <Link
                key={subject.id}
                href={`/subjects/${encodeURIComponent(subject.id)}`}
                className="flex min-w-0 flex-col rounded-xl border border-slate-100 bg-slate-50/80 p-3 hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
              >
                <div className="line-clamp-2 break-words text-sm font-medium leading-snug text-slate-900 dark:text-slate-100" title={subject.name}>{subject.name}</div>
                {control ? (
                  <span
                    className={`mt-1.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      control.isExam
                        ? "bg-[var(--status-critical-fg)] text-white"
                        : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
                    }`}
                  >
                    {control.label}
                    {dateLabel ? ` · сессия с ${dateLabel}` : ""}
                  </span>
                ) : null}
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {subject.course_number ? `${subject.course_number} курс` : ""}
                  {subject.semester ? ` · ${subject.semester} семестр` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/subjects/physiology/lessons" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
          <BookOpen className="h-4 w-4 text-[var(--status-ok-fg)]" /> Практикум по физиологии
        </Link>
        <Link href="/trainers" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
          <Microscope className="h-4 w-4 text-indigo-500" /> Тренажёр
        </Link>
        <Link href="/chemistry" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
          <FlaskConical className="h-4 w-4 text-indigo-500" /> Химия
        </Link>
        <Link href="/tutor" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
          <Sparkles className="h-4 w-4 text-indigo-500" /> AI-тьютор
        </Link>
        <Link href="/study#progress" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700">
          <GraduationCap className="h-4 w-4 text-indigo-500" /> Прогресс
        </Link>
      </div>
    </section>
  );
}

function HomeworkWidget({ page }: WidgetProps) {
  const { data } = page;
  return (
    <section className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">Задания</h3>
      {(data?.homeworks || []).length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Пока нет заданий</p>
      ) : (
        <ul className="space-y-3">
          {(data?.homeworks || []).slice(0, 6).map((hw, i) => (
            <li key={str(hw, "id") || String(i)}>
              <Link href="/homework" className="block rounded-xl border border-slate-100 bg-slate-50/80 p-3 hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-500/40">
                <div className="break-words font-medium text-slate-900 dark:text-slate-100">{str(hw, "title") || "Задание"}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {str(hw, "due_at") ? `до ${str(hw, "due_at").slice(0, 10)}` : ""}
                  {homeworkStatusLabel(hw) ? ` · ${homeworkStatusLabel(hw)}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AnnouncementsWidget({ page }: WidgetProps) {
  const { data } = page;
  return (
    <section className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-200">Объявления</h3>
      {(data?.announcements || []).length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Нет объявлений</p>
      ) : (
        <ul className="space-y-3">
          {(data?.announcements || []).map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="break-words font-medium text-slate-900 dark:text-slate-100">{a.title}</div>
              <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DebtsWidget({ page }: WidgetProps) {
  const { academic } = page;
  if (!academic?.debts?.length) return null;
  return (
    <section className="h-full rounded-2xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/40 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--status-critical-fg)]">
        <AlertTriangle className="h-4 w-4" /> Академические долги
      </div>
      <ul className="space-y-2">
        {academic.debts.slice(0, 5).map((debt, i) => (
          <li key={String(debt.id || i)} className="text-sm text-slate-800 dark:text-slate-200">
            <span className="font-medium">{String(debt.subject_name || "Предмет")}</span>
            {debt.note ? <span className="text-slate-500 dark:text-slate-400"> · {String(debt.note)}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoteWidget({ page }: WidgetProps) {
  const { homePrefs, applyHome } = page;
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
        <ClipboardList className="h-4 w-4" /> Заметка
      </div>
      <textarea
        value={homePrefs.note}
        onChange={(event) => applyHome({ ...homePrefs, note: event.target.value.slice(0, 4000) })}
        placeholder="Что не забыть сегодня…"
        rows={5}
        className="min-h-[120px] w-full flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:border-indigo-500/50 dark:focus:bg-slate-800"
      />
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Видна только вам и сохраняется в аккаунте.</p>
    </section>
  );
}

/** Набор виджетов по id раскладки; отсутствующий ключ HomeDashboard прячет. */
export function homeWidgets(page: HomeDashboardState) {
  return {
    today: (
      <TodaySummary
        date={page.summary.date}
        isToday={page.summary.isToday}
        isTomorrow={page.summaryIsTomorrow}
        lessons={page.summary.rows}
        homeworks={page.activeHomeworks}
        events={page.academic?.upcoming || []}
        subjects={page.subjects}
      />
    ),
    academic: <AcademicWidget page={page} />,
    tests: <TestsWidget page={page} />,
    chemistry: <DailyChemistryTask />,
    subjects: <SubjectsWidget page={page} />,
    homeworkList: <HomeworkWidget page={page} />,
    announcements: <AnnouncementsWidget page={page} />,
    debts: <DebtsWidget page={page} />,
    note: <NoteWidget page={page} />,
  };
}
