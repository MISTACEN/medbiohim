"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ClipboardCheck, FlaskConical, Loader2, Search } from "lucide-react";
import { LectureView } from "@/components/lectures/LectureView";
import { listLectures } from "@/lib/api/content";
import { listSubjectsCatalog } from "@/lib/api";
import { listTests } from "@/lib/api/tests";
import { getSubjectPlan } from "@/lib/api/subjects";
import { fetchStaticPlan, SUBJECT_STATIC_PLANS } from "@/lib/subject-plan-static";
import { selectTopicTests } from "@/lib/topic-tests";
import {
  normalizeStaticPlan,
  parsePlanDate,
  sessionsFromApiPlanWeeks,
  type PlanSession,
} from "@/lib/subject-plan-next";

/**
 * Страница темы: одно занятие плана = лекция + тест по этой же теме + быстрый
 * поиск по лекциям и тестам предмета.
 *
 * Зачем отдельная страница: на вкладке «План» занятие — это строка, на
 * «Лекциях» — читалка, в «Тестах» — список тестов. Студенту перед занятием
 * нужны лекция и тест рядом, без переключения вкладок и без поиска нужного
 * теста среди двадцати.
 *
 * Источники: статический план кафедры (public/content/<slug>/plan-*.json) для
 * названия и даты занятия, API лекций (body_markdown приходит в списке) и
 * API тестов предмета. Ничего не выдумываем: если лекции или теста по теме
 * нет, страница честно об этом пишет.
 */

type LectureRow = {
  id: string;
  title?: string;
  topic?: string;
  summary?: string;
  body_markdown?: string | null;
  subject_slug?: string;
};

type TestRow = { id: string; title?: string; subject_slug?: string; topic_id?: string | null };

const _CHEM_SLUGS = new Set(["organic_chemistry", "chemistry_organic_physical"]);

const STOP_WORDS = new Set([
  "общая", "общие", "характеристика", "свойства", "строение", "получение", "классификация",
  "реакционная", "способность", "занятие", "занятия", "работа", "контрольная", "тема", "темы",
]);

/** Значимые слова названия: по ним сопоставляем занятие, лекцию и тест. */
function keywords(title: string): string[] {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, " ")
    .split(/\s+/)
    .map((word) => word.replace(/(ами|ями|ов|ев|ый|ий|ая|ое|ые|ой|ах|ях|и|ы|а|е|у|о)$/u, ""))
    .filter((word) => word.length >= 5 && !STOP_WORDS.has(word));
}

function overlapScore(a: string, b: string): number {
  const setB = new Set(keywords(b));
  return keywords(a).reduce((score, word) => (setB.has(word) ? score + 1 : score), 0);
}

/** «занятие 08» из поля topic лекции. */
function lessonNumberFromTopic(topic?: string): number | null {
  // [а-яё]* — \w в JS не покрывает кириллицу, без этого «занятие 11» не находилось.
  const m = /занят[а-яё]*\s+(\d{1,2})/i.exec(String(topic || ""));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function textSnippet(body: string | null | undefined, query: string): string | null {
  const plain = String(body || "").replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`]/g, " ").replace(/\s+/g, " ").trim();
  if (!plain || !query) return null;
  const index = plain.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return null;
  const from = Math.max(0, index - 70);
  return `${from > 0 ? "…" : ""}${plain.slice(from, index + query.length + 90)}…`;
}

export default function TopicPage() {
  const params = useParams<{ id: string; n: string }>();
  const slug = String(params?.id || "");
  const week = Number.parseInt(String(params?.n || ""), 10);

  const [lectures, setLectures] = useState<LectureRow[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  // Кафедральный план нужен и тогда, когда показываем план БД: только в нём
  // лежит явная привязка занятия к тесту.
  const [staticSessions, setStaticSessions] = useState<PlanSession[]>([]);
  const [planNote, setPlanNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      // У химии слаг плана в адресе («organic_chemistry») не совпадает со
      // слагом предмета в БД («chemistry_organic_physical»), а у предмета
      // несколько активных строк (семестры). Поэтому тесты собираем по всем
      // id, найденным в каталоге; запрос по слагу — запасной вариант.
      const catalogRes = await listSubjectsCatalog();
      const catalogItems = (catalogRes?.ok ? catalogRes.data?.items || [] : []) as Array<{
        id?: string;
        slug?: string;
      }>;
      const subjectIds = Array.from(
        new Set(
          catalogItems
            .filter(
              (row) =>
                row?.id &&
                (row.slug === slug ||
                  row.slug === "chemistry_organic_physical" ||
                  (_CHEM_SLUGS.has(String(row.slug || "")) && _CHEM_SLUGS.has(slug)))
            )
            .map((row) => String(row.id))
        )
      );
      const testSlugs = slug === "organic_chemistry" ? [slug, "chemistry_organic_physical"] : [slug];
      const [lectureRes, ...testResults] = await Promise.all([
        // no-store: иначе после правки лекций страница до минуты показывала
        // список из sessionStorage и теряла новые поля.
        listLectures(slug || undefined, { cache: "no-store" }),
        ...(subjectIds.length
          ? subjectIds.map((id) => listTests(id))
          : testSlugs.map((value) => listTests(undefined, undefined, value || undefined))),
      ]);
      if (cancelled) return;

      if (lectureRes?.ok) setLectures((lectureRes.data?.items || []) as LectureRow[]);
      const testItems = (testResults as any[])
        .filter((res) => res?.ok)
        .flatMap((res) => (res.data?.items || []) as TestRow[])
        .filter(
          (test, index, list) => list.findIndex((other) => String(other.id) === String(test.id)) === index
        );
      setTests(testItems);

      // Нумерация занятий берётся из плана в БД — его же показывает вкладка
      // «План». Статический план кафедры остаётся запасным источником.
      let sessionsFromApi: PlanSession[] = [];
      try {
        const planRes = await getSubjectPlan(slug);
        if (planRes?.ok) {
          const planPayload = planRes.data?.plan || planRes.data;
          const weeks = Array.isArray(planPayload?.weeks) ? planPayload.weeks : planPayload?.items;
          sessionsFromApi = sessionsFromApiPlanWeeks(weeks);
        }
      } catch {
        sessionsFromApi = [];
      }
      if (cancelled) return;

      // Кафедральный план читаем всегда: в нём подписан test_id занятия, тогда
      // как план БД отдаёт только даты и темы. Даты и названия по-прежнему
      // берём из плана БД, если он есть.
      const file = SUBJECT_STATIC_PLANS[slug];
      let staticSessionsResult: PlanSession[] = [];
      if (file) {
        try {
          const raw = await fetchStaticPlan(file);
          if (cancelled) return;
          const normalized = normalizeStaticPlan(raw);
          staticSessionsResult = normalized.sessions;
          setStaticSessions(staticSessionsResult);
          if (!sessionsFromApi.length) {
            setSessions(normalized.sessions);
            setPlanNote(normalized.note || "");
          }
        } catch {
          if (!sessionsFromApi.length) {
            setPlanNote("План кафедры недоступен — ниже только лекции и тесты.");
            setSessions([]);
          }
        }
      } else if (!sessionsFromApi.length) {
        setPlanNote("Для этого предмета нет плана кафедры.");
        setSessions([]);
      }
      if (sessionsFromApi.length) {
        setSessions(sessionsFromApi);
        setPlanNote("");
      }

      if (!cancelled && !lectureRes?.ok && testItems.length === 0) {
        setError("Не удалось загрузить лекции и тесты. Проверьте вход и попробуйте обновить страницу.");
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Занятие недели: в недельном плане это kind="week", в плоском — lab/practical.
  const practice = useMemo(
    () => sessions.find((session) => session.num === week && session.kind !== "lecture") || null,
    [sessions, week]
  );
  const planLecture = useMemo(
    () =>
      sessions.find((session) => session.kind === "lecture" && session.num === week) ||
      sessions.find((session) => session.lecture?.num === week) ||
      null,
    [sessions, week]
  );

  /** Тема лекции занятия: её показывает заголовок, по ней же подбирается тест. */
  const lectureTitle = String(planLecture?.lecture?.title || practice?.lecture?.title || "");
  /** Тема практики/лабораторной занятия — для блока «Практика занятия» и поиска. */
  const practiceTitle = String(
    practice?.lab?.title || practice?.title || practice?.practice || lectureTitle
  );
  /** Заголовок страницы: занятие — это лекция, лабораторная идёт отдельным блоком. */
  const topicTitle = lectureTitle || practiceTitle;
  /**
   * Контрольная или зачёт: у такого занятия нет ни лекции, ни теста. Без этого
   * проверка «по словам» подтягивала к контрольной работе случайную лекцию
   * («Контрольная № 2 „Углеводороды“» → лекция про арены) вместе с её тестом.
   */
  const isControlWeek =
    Boolean(practice?.control || planLecture?.control) ||
    /^\s*(контрольная|зачёт|зачет|экзамен)/i.test(practiceTitle);
  /** Опыты практикума занятия: лабораторная работа из плана кафедры. */
  const labItems = useMemo(() => {
    const fromPlan = practice?.laboratory;
    if (Array.isArray(fromPlan) && fromPlan.length) return fromPlan;
    const fromHomework = practice?.homework?.items;
    return Array.isArray(fromHomework) ? fromHomework : [];
  }, [practice]);

  const sessionDate =
    parsePlanDate(practice?.date) || parsePlanDate(planLecture?.date) || practice?.date || planLecture?.date || null;

  /**
   * Лекция темы: главный признак — совпадение названия лекции с темой занятия.
   * Номер занятия из поля topic — запасной вариант: нумерация в плане БД и в
   * самих лекциях может разойтись, и тогда номер уводит на чужую тему.
   */
  // Явная привязка лекции из плана БД (поле lecture_id недели).
  const weekLectureId = practice?.lecture?.lectureId || null;

  const lecture = useMemo(() => {
    if (isControlWeek) return null;
    const explicitId = planLecture?.lecture?.lectureId || weekLectureId;
    if (explicitId) {
      const linked = lectures.find((item) => String(item.id) === String(explicitId));
      if (linked) return linked;
    }
    if (topicTitle) {
      const best = lectures
        .map((item) => ({ item, score: overlapScore(topicTitle, `${item.title || ""} ${item.topic || ""}`) }))
        .sort((a, b) => b.score - a.score)
        .find((row) => row.score > 0);
      if (best) return best.item;
    }
    return lectures.find((item) => lessonNumberFromTopic(item.topic) === week) || null;
  }, [isControlWeek, lectures, planLecture, topicTitle, week, weekLectureId]);

  /**
   * Тест темы — только по явным связям: `test_id` кафедрального плана для этой
   * лекции (или номера занятия), затем связь по теме в БД, затем объявленная
   * карта классов соединений. Поиск по словам убран: он подмешивал к занятию
   * общий тест раздела («Тема 3. Строение и химические свойства…»).
   */
  const explicitTestIds = useMemo(() => {
    const lectureId = String(lecture?.id || "");
    const linked = lectureId
      ? staticSessions.filter((session) => String(session.lecture?.lectureId || "") === lectureId)
      : staticSessions.filter((session) => session.num === week || session.lecture?.num === week);
    return linked.map((session) => session.testId).filter((id): id is string => Boolean(id));
  }, [lecture, staticSessions, week]);

  // Химический предмет — по той же эвристике, что и вкладка chem на странице
  // предмета (/chem|хим/). Второй признак покрывает переход по UUID-слагу:
  // у химических лекций id вида «lec-chem-*».
  const isChemistrySubject = /chem|хим/i.test(slug) || /chem/i.test(String(lecture?.id || ""));

  const topicTests = useMemo(() => {
    if (isControlWeek) return [];
    return selectTopicTests({
      tests,
      explicitTestIds,
      topicId: practice?.topicId || planLecture?.topicId,
      practiceTitle: topicTitle,
    });
  }, [explicitTestIds, isControlWeek, planLecture, practice, topicTitle, tests]);

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return { lectures: [] as Array<{ item: LectureRow; snippet: string }>, tests: [] as TestRow[] };
    return {
      lectures: lectures
        .map((item) => {
          const haystack = `${item.title || ""} ${item.topic || ""} ${item.summary || ""}`.toLowerCase();
          const snippet = haystack.includes(term) ? "" : textSnippet(item.body_markdown, term) || "";
          if (!haystack.includes(term) && !snippet) return null;
          return { item, snippet };
        })
        .filter(Boolean)
        .slice(0, 6) as Array<{ item: LectureRow; snippet: string }>,
      tests: tests.filter((test) => String(test.title || "").toLowerCase().includes(term)).slice(0, 6),
    };
  }, [lectures, query, tests]);

  const searched = query.trim().length >= 2;
  const hasSearchHits = searchResults.lectures.length > 0 || searchResults.tests.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={`/subjects/${encodeURIComponent(slug)}?tab=plan`} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" /> К плану предмета
      </Link>

      <header className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">Занятие {Number.isFinite(week) ? week : "—"}</span>
          {sessionDate && <span>{sessionDate}</span>}
          {planNote && <span className="font-normal">· {planNote}</span>}
        </div>
        <h1 className="mt-2 text-base font-bold leading-snug sm:text-xl">{topicTitle || "Тема не найдена в плане"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isControlWeek
            ? "Контрольное мероприятие плана кафедры: отдельной лекции и теста у занятия нет."
            : "Лекция и тест по этой теме — на одной странице."}
        </p>

        <div className="relative mt-3 sm:mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по лекциям и тестам"
            aria-label="Поиск по теме"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
        </div>

        {searched && (
          <div className="mt-3 space-y-2">
            {!hasSearchHits && <p className="text-sm text-slate-500">Ничего не найдено — попробуйте другое слово.</p>}
            {searchResults.lectures.map(({ item, snippet }) => (
              <Link
                key={item.id}
                href={`/lectures/${encodeURIComponent(item.id)}`}
                className="block rounded-xl border border-[var(--border)] p-3 text-sm transition hover:border-[var(--primary)]/50"
              >
                <span className="font-semibold">{item.title}</span>
                {item.topic && <span className="ml-2 text-xs text-slate-500">{item.topic}</span>}
                {snippet && <span className="mt-1 block text-xs text-slate-500">{snippet}</span>}
              </Link>
            ))}
            {searchResults.tests.map((test) => (
              <Link
                key={test.id}
                href={`/tests/attempt/${encodeURIComponent(test.id)}`}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-3 text-sm transition hover:border-[var(--primary)]/50"
              >
                <ClipboardCheck className="h-4 w-4 text-indigo-600" />
                <span className="font-semibold">{test.title}</span>
              </Link>
            ))}
          </div>
        )}
      </header>

      {loading && (
        <div className="card flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаю лекцию и тесты…
        </div>
      )}

      {error && <div className="card p-4 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      {!loading && !lecture && !isControlWeek && (
        <div className="card p-5 text-sm text-slate-500">
          Лекции по этой теме пока нет.{" "}
          {/* Вкладка lessons есть только у физиологии; остальным — общий каталог лекций. */}
          <Link
            href={slug === "physiology" ? `/subjects/${encodeURIComponent(slug)}?tab=lessons` : "/lectures"}
            className="font-semibold text-[var(--primary)]"
          >
            Все лекции предмета
          </Link>
        </div>
      )}

      {lecture && (
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <BookOpen className="h-5 w-5 text-indigo-600" /> Лекция
            </h2>
            <Link href={`/lectures/${encodeURIComponent(lecture.id)}`} className="text-sm font-semibold text-[var(--primary)]">
              Отдельная страница →
            </Link>
          </div>
          <LectureView
            lecture={lecture as any}
            lectureId={lecture.id}
            lessonNumber={Number.isFinite(week) ? week : null}
            backHref={`/subjects/${encodeURIComponent(slug)}?tab=lectures`}
            backLabel="Все лекции"
          />
        </section>
      )}

      {labItems.length > 0 && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FlaskConical className="h-5 w-5 text-[var(--status-ok-fg)]" /> Лабораторная работа
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Лабораторная работа по плану кафедры — {labItems.length} опытов. Ход и уравнения — в блоке практики лекции.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            {labItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>
      )}

      {(practice?.practice || practice?.preparations?.length) && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FlaskConical className="h-5 w-5 text-[var(--status-ok-fg)]" /> Практика занятия
          </h2>
          {practice?.practice && <p className="mt-1 text-sm text-slate-500">{practice.practice}</p>}
          {practice?.preparations?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Гистопрепараты</p>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {practice.preparations.map((item, i) => (
                  <li key={i} className="rounded-full border border-[var(--border)] px-3 py-1">
                    {item.n ? `№${item.n} · ` : ""}
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardCheck className="h-5 w-5 text-indigo-600" /> Тест по теме
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isControlWeek
            ? "Контрольная работа проверяется на занятии: отдельного теста к ней нет, охват — в плане предмета."
            : "Мини-тесты уже встроены в лекцию — они проверяют каждый блок сразу после теории. Полный тест темы открывается отдельно."}
        </p>
        {isControlWeek ? null : topicTests.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-slate-500">
            Отдельного теста по теме нет. Мини-тесты лекции при этом работают.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {topicTests.map((test) => (
              <li key={test.id}>
                <Link
                  href={`/tests/attempt/${encodeURIComponent(test.id)}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3 text-sm transition hover:border-[var(--primary)]/50"
                >
                  <span className="font-semibold">{test.title}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link href={`/subjects/${encodeURIComponent(slug)}?tab=tests`} className="rounded-xl border border-[var(--border)] px-3 py-2 font-semibold">
            Все тесты предмета
          </Link>
          {/* Вкладка chem есть только у химических предметов: на странице предмета
              она рендерится по тому же признаку (/chem|хим/). Для остальных предметов
              кнопка ведёт в пустую панель — не показываем. */}
          {isChemistrySubject && (
            <Link href={`/subjects/${encodeURIComponent(slug)}?tab=chem`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 font-semibold">
              <FlaskConical className="h-4 w-4" /> Химический модуль: структуры и тренажёры
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
