"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Download,
  FileQuestion,
  FlaskConical,
  Loader2,
  Play,
  Search,
  Stethoscope,
} from "lucide-react";
import TestRunner from "./TestRunner";
import {
  loadPhysiologyIndex,
  loadPhysiologyManual,
  type PhysiologyIndex,
  type PhysiologyLesson,
  type PhysiologyManual,
  type PhysiologyTestGroup,
} from "@/lib/physiologyContent";

type View =
  | { kind: "hub" }
  | { kind: "manual"; slug: string }
  | { kind: "lesson"; lessonId: string };

type LessonTab = "questions" | "practice" | "situational" | "tests" | "notes";

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`;
  return `${count} ${many}`;
}

function semesterLabel(semester: number) {
  return semester % 2 === 1 ? "осенний семестр" : "весенний семестр";
}

function Chip({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "indigo" | "emerald" | "amber" }) {
  const styles = {
    slate: "bg-slate-100 text-slate-600",
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
    amber: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles}`}>{children}</span>;
}

function downloadName(url: string) {
  return decodeURIComponent(url.split("/").pop() || "материал");
}

export default function PhysiologyPractice({ backHref, backLabel }: { backHref?: string; backLabel?: string }) {
  const [index, setIndex] = useState<PhysiologyIndex | null>(null);
  const [manual, setManual] = useState<PhysiologyManual | null>(null);
  const [view, setView] = useState<View>({ kind: "hub" });
  const [tab, setTab] = useState<LessonTab>("questions");
  const [group, setGroup] = useState<PhysiologyTestGroup | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadPhysiologyIndex()
      .then((data) => {
        if (alive) {
          setIndex(data);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить практикум");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const openManual = useCallback(async (slug: string) => {
    setView({ kind: "manual", slug });
    setGroup(null);
    setQuery("");
    setManual(null);
    setLoading(true);
    try {
      setManual(await loadPhysiologyManual(slug));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить раздел");
    } finally {
      setLoading(false);
    }
  }, []);

  const lesson: PhysiologyLesson | null = useMemo(() => {
    if (view.kind !== "lesson" || !manual) return null;
    return manual.lessons.find((item) => item.id === view.lessonId) || null;
  }, [view, manual]);

  const lessonOrder = useMemo(() => {
    if (!manual || !lesson) return 0;
    return manual.lessons.findIndex((item) => item.id === lesson.id) + 1;
  }, [manual, lesson]);

  const sectionTitle = useMemo(() => {
    if (!manual || !lesson) return "";
    const section = manual.sections.find((item) => item.lesson_ids.includes(lesson.id));
    return section?.title || manual.title;
  }, [manual, lesson]);

  const filteredLessons = useMemo(() => {
    if (!manual) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return manual.lessons;
    return manual.lessons.filter((item) =>
      (item.title + " " + item.questions.join(" ")).toLowerCase().includes(needle)
    );
  }, [manual, query]);

  if (error) {
    return <div className="card p-6 text-sm text-[var(--status-critical-fg)]">{error}</div>;
  }

  if (loading && !index) {
    return (
      <div className="card flex items-center gap-3 p-6 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> Загружаем практикум…
      </div>
    );
  }

  if (!index) return null;

  if (group) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setGroup(null)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Назад
          </button>
          <span className="text-sm font-semibold text-slate-500">{group.title}</span>
        </div>
        <TestRunner group={group} onExit={() => setGroup(null)} />
      </div>
    );
  }

  if (view.kind === "hub") {
    return (
      <div className="space-y-6">
        <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Практикум · физиология</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Все занятия по физиологии</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Шесть учебно-методических пособий кафедры разобраны по занятиям: вопросы для самоподготовки,
            практические работы, ситуационные задачи и банки тестов. Исходные файлы доступны для скачивания.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={index.reference.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300"
            >
              <Download className="h-4 w-4" /> {index.reference.title} (PDF)
            </a>
            {backHref && (
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300"
              >
                <ArrowLeft className="h-4 w-4" /> {backLabel || "К предмету"}
              </Link>
            )}
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {index.manuals.map((item) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => void openManual(item.slug)}
              className="group flex h-full flex-col rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug text-slate-900">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.semester} семестр · {semesterLabel(item.semester)}
                  </div>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-600">{item.subtitle}</p>
              <div className="mt-auto flex items-center justify-between pt-4 text-xs font-semibold text-indigo-600">
                <span>Открыть занятия</span>
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>

        <section className="card p-5">
          <h2 className="text-lg font-bold">Скачать пособия</h2>
          <p className="mt-1 text-sm text-slate-500">Оригинальные файлы кафедры — те же, по которым собран практикум.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {index.manuals.map((item) => (
              <a
                key={item.slug}
                href={item.source_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border bg-slate-50 p-3 text-sm transition hover:border-indigo-300 hover:bg-white"
              >
                <Download className="h-4 w-4 shrink-0 text-indigo-500" />
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug text-slate-800">{item.title}</span>
                  <span className="block truncate text-xs text-slate-500">{downloadName(item.source_url)}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (loading && !manual) {
    return (
      <div className="card flex items-center gap-3 p-6 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> Загружаем раздел…
      </div>
    );
  }

  if (!manual) return null;

  if (lesson) {
    const tabs: { id: LessonTab; label: string; count?: number }[] = [
      { id: "questions", label: "Вопросы", count: lesson.questions.length },
      { id: "practice", label: "Практика", count: lesson.practical.length },
      { id: "situational", label: "Задачи", count: lesson.situational.length },
      { id: "tests", label: "Тесты", count: lesson.tests.reduce((sum, item) => sum + item.questions.length, 0) },
      { id: "notes", label: "Конспект", count: lesson.notes.length },
    ];

    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => {
            setView({ kind: "manual", slug: manual.slug });
            setTab("questions");
          }}
          className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {manual.title}
        </button>

        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Занятие {lessonOrder}</p>
          <h1 className="mt-1 text-xl font-extrabold leading-snug text-slate-900 sm:text-2xl">{lesson.title}</h1>
          <p className="mt-2 text-xs text-slate-500">{sectionTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone="indigo">
              <ClipboardList className="h-3 w-3" /> {plural(lesson.questions.length, "вопрос", "вопроса", "вопросов")}
            </Chip>
            <Chip tone="emerald">
              <FlaskConical className="h-3 w-3" /> {plural(lesson.practical.length, "работа", "работы", "работ")}
            </Chip>
            <Chip tone="amber">
              <FileQuestion className="h-3 w-3" /> {plural(lesson.situational.length, "задача", "задачи", "задач")}
            </Chip>
            <a
              href={manual.source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
            >
              <Download className="h-3 w-3" /> источник
            </a>
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                "shrink-0 rounded-xl border px-3.5 py-2 text-sm font-semibold transition " +
                (tab === item.id
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              {item.label}
              {item.count ? <span className="ml-1.5 text-[11px] opacity-70">{item.count}</span> : null}
            </button>
          ))}
        </nav>

        {tab === "questions" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Вопросы для самоподготовки</h2>
            {lesson.actuality && <p className="mt-2 rounded-xl bg-indigo-50/60 p-3 text-sm leading-6 text-slate-700">{lesson.actuality}</p>}
            {lesson.questions.length ? (
              <ol className="mt-4 space-y-2.5">
                {lesson.questions.map((question, position) => (
                  <li key={position} className="flex gap-3 rounded-xl border bg-slate-50/60 p-3 text-sm leading-6 text-slate-800">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-indigo-600 shadow-sm">
                      {position + 1}
                    </span>
                    <span>{question}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
                В этом занятии вопросы для самоподготовки в пособии не выделены — смотрите конспект и задачи.
              </p>
            )}
            {lesson.essays.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-slate-700">Темы рефератов</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {lesson.essays.map((essay, position) => (
                    <li key={position}>{essay}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {tab === "practice" && (
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-bold">Практические работы</h2>
            {lesson.practical.length ? (
              lesson.practical.map((work) => (
                <article key={work.number} className="rounded-xl border bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">
                    Работа {work.number}. {work.title}
                  </h3>
                  <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                    {work.body.map((paragraph, position) => (
                      <p key={position}>{paragraph}</p>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
                Отдельных практических работ в этом занятии нет.
              </p>
            )}
            {lesson.tasks.length > 0 && (
              <div className="rounded-xl border bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-800">Задания в тетради</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {lesson.tasks.map((task, position) => (
                    <li key={position}>{task}</li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        {tab === "situational" && (
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-bold">Ситуационные задачи</h2>
            {lesson.situational.length ? (
              lesson.situational.map((task, position) => (
                <article key={position} className="rounded-xl border bg-white p-4 text-sm leading-6 text-slate-800">
                  <span className="mb-1 block text-xs font-bold text-indigo-500">Задача {position + 1}</span>
                  {task}
                </article>
              ))
            ) : (
              <p className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
                В этом занятии ситуационные задачи в пособии не приведены.
              </p>
            )}
          </section>
        )}

        {tab === "tests" && (
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-bold">Тесты занятия</h2>
            {lesson.tests.length ? (
              lesson.tests.map((item) => (
                <article key={item.title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {plural(item.questions.length, "вопрос", "вопроса", "вопросов")} ·{" "}
                      {item.questions.filter((question) => question.answer).length > 0 ? "с проверкой" : "разбор"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroup(item)}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                  >
                    <Play className="h-4 w-4" /> Начать
                  </button>
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
                К занятию не привязан отдельный банк тестов.{" "}
                {manual.banks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setView({ kind: "manual", slug: manual.slug });
                    }}
                    className="font-semibold underline"
                  >
                    Открыть банки раздела
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "notes" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Конспект занятия</h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
              {lesson.notes.length ? (
                lesson.notes.slice(0, 80).map((paragraph, position) => <p key={position}>{paragraph}</p>)
              ) : (
                <p className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
                  Информационный блок в пособии для этого занятия отсутствует.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setView({ kind: "hub" })}
        className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Все разделы
      </button>

      <header className="rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">
          {manual.semester} семестр · {manual.year} · {manual.hours} ч.
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{manual.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{manual.subtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone="indigo">{plural(manual.lessons.length, "занятие", "занятия", "занятий")}</Chip>
          <Chip tone="emerald">{plural(manual.stats.questions, "тест", "теста", "тестов")}</Chip>
          <a
            href={manual.source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
          >
            <Download className="h-3 w-3" /> скачать пособие
          </a>
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти занятие или вопрос"
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      <div className="space-y-4">
        {manual.sections.map((section) => {
          const sectionLessons = filteredLessons.filter((item) => section.lesson_ids.includes(item.id));
          if (!sectionLessons.length) return null;
          return (
            <section key={section.number} className="space-y-2">
              {section.title !== manual.title && (
                <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-500">{section.title}</h2>
              )}
              <div className="grid gap-2">
                {sectionLessons.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setView({ kind: "lesson", lessonId: item.id });
                      setTab(item.questions.length ? "questions" : item.practical.length ? "practice" : "situational");
                    }}
                    className="flex items-center gap-4 rounded-xl border bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-extrabold text-indigo-600">
                      {manual.lessons.findIndex((entry) => entry.id === item.id) + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug text-slate-900">{item.title}</span>
                      <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span>{plural(item.questions.length, "вопрос", "вопроса", "вопросов")}</span>
                        <span>·</span>
                        <span>{plural(item.situational.length, "задача", "задачи", "задач")}</span>
                        <span>·</span>
                        <span>{plural(item.practical.length, "работа", "работы", "работ")}</span>
                        {item.tests.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-semibold text-[var(--status-ok-fg)]">тесты</span>
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {!filteredLessons.length && (
          <p className="card p-5 text-sm text-slate-500">По запросу «{query}» занятий не найдено.</p>
        )}
      </div>

      {manual.banks.length > 0 && (
        <section className="card space-y-3 p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-bold">Тесты раздела</h2>
          </div>
          <p className="text-sm text-slate-500">Общий банк тестовых заданий пособия — можно пройти целиком.</p>
          {manual.banks.map((bank) => (
            <article key={bank.title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{bank.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {plural(bank.questions.length, "вопрос", "вопроса", "вопросов")} ·{" "}
                  {bank.questions.some((question) => question.answer) ? "с проверкой" : "разбор"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGroup(bank)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
              >
                <Play className="h-4 w-4" /> Начать
              </button>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
