"use client";

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
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
import {
  _CHEM_SLUGS,
  lessonNumberFromTopic,
  overlapScore,
  textSnippet,
  type LectureRow,
  type TestRow,
} from "@/components/subjects/lesson/model";

export function useTopicPage() {
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

  return {
    slug,
    week,
    loading,
    error,
    query,
    setQuery,
    planNote,
    sessionDate,
    topicTitle,
    isControlWeek,
    searched,
    hasSearchHits,
    searchResults,
    lecture,
    labItems,
    practice,
    topicTests,
    isChemistrySubject,
  };
}

export type TopicPageState = ReturnType<typeof useTopicPage>;
