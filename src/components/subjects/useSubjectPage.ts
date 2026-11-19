"use client";

/**
 * Данные и действия страницы предмета.
 *
 * Перенесено из `src/app/subjects/[id]/page.tsx` без изменения поведения:
 * две волны загрузки (ядро → вспомогательные панели), инициализация вкладки из
 * `?tab=`/`#hash`, оптимистичный цикл статуса темы, открытие лекции и материала,
 * навигация разделов и подразделов.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import {
  ClipboardList,
  FileQuestion,
  FlaskConical,
  FolderOpen,
  Globe,
  GraduationCap,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import {
  getLecture,
  markMaterialOpened,
  setTopicProgress,
  type ApiTest,
  type Lecture,
  type SubjectPlan,
} from "@/lib/api";
import type { SubjectMaterial } from "@/lib/content-api";
import { resolveSubjectSlug } from "@/lib/subjectSlug";
import { platformsForSubject } from "@/data/external-platforms";
import { LIBRARY_FILES } from "@/lib/library";
import {
  GROUP_OF,
  isTabId,
  normalizeTab,
  type GroupId,
  type TabId,
} from "@/components/subjects/tabs-config";
import { loadSubjectAux, loadSubjectCore, type Module, type Subject, type SubjectCoreLoad } from "@/components/subjects/subject-loaders";
import { submoduleForSubject } from "@/modules/subjects";
import { legacyPortalConfig } from "@/lib/portalContent";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import { sessionsFromApiPlanWeeks } from "@/lib/subject-plan-next";

export type { Module, Subject } from "@/components/subjects/subject-loaders";

/** Личный статус темы: клик по чипу переводит его по циклу. */
const TOPIC_STATUS_CYCLE: Record<string, string> = {
  pending: "in_progress",
  in_progress: "passed",
  passed: "failed",
  failed: "retake_needed",
  retake_needed: "pending",
};

export function useSubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get("tab") || "";
  const { user, loading: authLoading } = useAuth();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [topicItems, setTopicItems] = useState<any[]>([]);
  const [plan, setPlan] = useState<SubjectPlan | null>(null);
  const [gradebook, setGradebook] = useState<any[]>([]);
  const [tests, setTests] = useState<ApiTest[]>([]);
  const [materials, setMaterials] = useState<SubjectMaterial[]>([]);
  const [materialsRich, setMaterialsRich] = useState<any[]>([]);
  const [lectures, setLectures] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  // Прогресс по темам плана: «сдано / не сдано / отработка» на вкладке «План».
  const [planProgress, setPlanProgress] = useState<any | null>(null);
  const [topicBusy, setTopicBusy] = useState<string | null>(null);
  const [resourceErrors, setResourceErrors] = useState<Record<string, string>>({});
  const [subjectId, setSubjectId] = useState("");
  const [tab, setTab] = useState<TabId>("plan");
  // Материалы: модальное чтение без перехода со страницы предмета.
  const [activeMaterial, setActiveMaterial] = useState<any | null>(null);
  // Лекция читается прямо в предмете: переход на /lectures/:id уводил со страницы.
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null);
  const [lectureLoading, setLectureLoading] = useState(false);
  const [lectureError, setLectureError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromHash = window.location.hash.replace(/^#/, "");
    const initial = tabFromQuery || fromHash;
    const normalized = initial ? normalizeTab(initial) : "";
    if (normalized && isTabId(normalized)) setTab(normalized);

    const onHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      const normalized = h ? normalizeTab(h) : "";
      if (normalized && isTabId(normalized)) setTab(normalized);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [tabFromQuery]);

  // D9: ручной useEffect с cancelled-флагом заменён на useApiRequest.
  // Этап 1 — ядро страницы: каталог, предмет, план и тесты (AbortSignal
  // отменяет запросы при unmount и смене предмета/группы).
  const { data: coreLoad, loading: coreLoading, error: coreError } = useApiRequest<SubjectCoreLoad>(
    (signal) => loadSubjectCore({ params, authLoading, groupId: user?.groupId ?? undefined, signal }),
    [params, authLoading, user?.groupId],
  );

  // Этап 1: применяем готовое ядро к состояниям страницы.
  useEffect(() => {
    if (!coreLoad?.ready) return;
    setSubjectId(coreLoad.subjectId);
    setSubject(coreLoad.subject);
    setModules(coreLoad.modules);
    // Темы с уровнями пирамиды знаний и прогрессом (ЭТАП 6).
    setTopicItems(coreLoad.topicItems || []);
    setPlan(coreLoad.plan);
    setTests(coreLoad.tests);
    setResourceErrors(coreLoad.resourceErrors);
  }, [coreLoad]);

  const auxSubjectId = coreLoad?.ready ? coreLoad.subjectId : "";
  const auxSlug = coreLoad?.ready ? coreLoad.slug : "";
  // Этап 2 — медленные вспомогательные панели (зачётка, материалы,
  // прогресс): не блокируют ядро страницы, отменяются тем же хуком.
  const { data: auxLoad } = useApiRequest(
    (signal) => loadSubjectAux({ subjectId: auxSubjectId, slug: auxSlug, groupId: user?.groupId ?? undefined, signal }),
    [auxSubjectId, auxSlug, user?.groupId],
  );

  // Этап 2: применяем вспомогательные данные к состояниям страницы.
  useEffect(() => {
    if (!auxLoad) return;
    const [gb, mm, pg, mr, ll, pp] = auxLoad;
    if (gb.ok) setGradebook(gb.data.items || []);
    if (mm.ok) setMaterials(mm.data.items || []);
    if (pg.ok) setProgress(pg.data);
    if (mr.ok) setMaterialsRich(mr.data.items || []);
    if (ll.ok) setLectures(ll.data.items || []);
    if (pp.ok) setPlanProgress(pp.data || null);
  }, [auxLoad]);

  const loading = coreLoading || !coreLoad?.ready;
  const error = coreError;

  function selectTab(id: TabId) {
    setTab(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      url.hash = id;
      window.history.replaceState(null, "", url.toString());
    }
  }

  const topicProgressById = new Map<string, any>(
    ((planProgress?.items || []) as any[]).map((item) => [String(item.topic_id), item]),
  );
  const planSummary = planProgress?.summary as
    | { total: number; passed: number; in_progress: number; failed_or_retake: number; unopened_materials?: number }
    | undefined;

  // Занятия плана API в едином виде для ленты «План»: ближайшее занятие сверху,
  // прошедшие — свёрнуты. Счётчики тестов и экзаменационных вопросов темы
  // подтягиваются из topic_progress (server проставляет их по привязке тем).
  const planSessions = sessionsFromApiPlanWeeks(plan?.weeks).map((session) => {
    const topic = session.topicId ? topicProgressById.get(session.topicId) : null;
    if (!topic) return session;
    return {
      ...session,
      testsCount: Number(topic.tests_count ?? 0) || null,
      examQuestionsCount: Number(topic.exam_questions_count ?? 0) || null,
    };
  });

  async function cycleTopicStatus(topicId: string, current: string) {
    const next = TOPIC_STATUS_CYCLE[current] || "in_progress";
    setTopicBusy(topicId);
    // Оптимистично: чип меняется сразу, откат — если сервер отказал.
    const previous = topicProgressById.get(topicId);
    topicProgressById.set(topicId, { ...(previous || { topic_id: topicId }), status: next });
    setPlanProgress((currentData: any) =>
      currentData
        ? {
            ...currentData,
            items: (currentData.items || []).map((item: any) =>
              item.topic_id === topicId ? { ...item, status: next } : item,
            ),
          }
        : currentData,
    );
    const res = await setTopicProgress(topicId, { status: next });
    if (!res.ok) {
      setPlanProgress((currentData: any) =>
        currentData
          ? {
              ...currentData,
              items: (currentData.items || []).map((item: any) =>
                item.topic_id === topicId ? { ...item, status: previous?.status || "pending" } : item,
              ),
            }
          : currentData,
      );
      setResourceErrors((current) => ({ ...current, topicProgress: describeApiError(res.error) }));
    } else {
      setResourceErrors((current) => {
        const next = { ...current };
        delete next.topicProgress;
        return next;
      });
    }
    setTopicBusy(null);
  }

  async function openTopicMaterial(topicId: string, material: any) {
    if (material.external_url) window.open(String(material.external_url), "_blank", "noreferrer");
    else selectTab("materials");
    // Оптимистично: чип сразу становится «открыт», сервер хранит отметку
    // только для этого пользователя.
    setPlanProgress((currentData: any) =>
      currentData
        ? {
            ...currentData,
            items: (currentData.items || []).map((item: any) =>
              item.topic_id === topicId
                ? {
                    ...item,
                    materials: (item.materials || []).map((m: any) => (m.id === material.id ? { ...m, opened: true } : m)),
                    unopened_materials_count: Math.max(0, Number(item.unopened_materials_count || 0) - 1),
                  }
                : item,
            ),
          }
        : currentData,
    );
    await markMaterialOpened(String(material.id));
  }

  const course = subject?.course_number ?? 2;
  const sem = subject?.semester ?? 3;
  // The route id is usually a UUID. Resolve the canonical slug from the
  // subject's own slug/name first so banks and linked views don't get filtered
  // by that UUID.
  const slug = resolveSubjectSlug(subject?.slug || "", subject?.name) || resolveSubjectSlug(subjectId, subject?.name);
  const histology = slug === "histology" || /гистол.*цитол|цитол.*гистол/i.test(subject?.name || "");
  // Подмодуль предмета берём из реестра (src/modules/subjects/registry.json).
  // Регулярка по названию осталась запасным вариантом для предметов, которых в
  // реестре ещё нет: раньше она одна решала, показывать ли «Структуры».
  const subjectSubmodule = submoduleForSubject(slug);
  const chemistry =
    subjectSubmodule?.slug === "chemistry" ||
    (!subjectSubmodule && /chem|хим/i.test(`${slug || ""} ${subject?.name || ""}`));
  const latin = /lat|латин/i.test(`${slug || ""} ${subject?.name || ""}`) && !chemistry;
  const portal = legacyPortalConfig(slug);
  // NeoFamily и Школа Сеченова — не отдельная страница хаба, а часть предмета:
  // показываем только категории, размеченные под этот slug.
  const externalPlatforms = platformsForSubject(slug);
  const subjName = (subject?.name || "").toLowerCase().trim();
  // Пособия кафедры физиологии лежат файлами в public/library, а не в таблице
  // materials, поэтому берутся из общего индекса — того же, что у поиска.
  const subjectLibrary = LIBRARY_FILES.filter((file) => file.subject_slug === slug);
  // Лекции привязаны через subject_slug ("histology"), а не к русскому названию.
  const subjectLectures = lectures.filter((l) => {
    const slugKey = String(slug || "").toLowerCase().trim();
    const lectureSlug = String(l?.subject_slug || "").toLowerCase().trim();
    if (slugKey && lectureSlug) return lectureSlug === slugKey;
    const ls = String(l?.subject || "").toLowerCase().trim();
    if (!ls || !subjName) return false;
    return ls === subjName || ls.includes(subjName) || subjName.includes(ls);
  });
  // Недели плана хранят lecture_id, поэтому список лекций строится в порядке
  // плана: актуальные лекции оказываются первыми, а внеплановые — после них.
  const planLectureWeeks = new Map<string, number>();
  (plan?.weeks || []).forEach((w: any, i: number) => {
    const id = w?.lecture_id ? String(w.lecture_id) : "";
    if (id && !planLectureWeeks.has(id)) planLectureWeeks.set(id, Number(w.week) || i + 1);
  });
  const orderedLectures = [...subjectLectures].sort((a: any, b: any) => {
    const aw = planLectureWeeks.get(String(a.id));
    const bw = planLectureWeeks.get(String(b.id));
    if (aw != null && bw == null) return -1;
    if (aw == null && bw != null) return 1;
    if (aw != null && bw != null && aw !== bw) return aw - bw;
    return String(a.title || "").localeCompare(String(b.title || ""), "ru");
  });

  function openLectureById(id: string) {
    setTab("lectures");
    setLectureError("");
    setLectureLoading(true);
    void getLecture(id).then((result) => {
      // API отдаёт лекцию и вложенно (data.lecture), и плоско.
      const payload = result.ok ? (result.data?.lecture || result.data) : null;
      if (result.ok && payload) setActiveLecture(payload);
      else setLectureError(describeApiError(result.error) || "Не удалось открыть лекцию.");
      setLectureLoading(false);
    });
  }

  const nav: { id: GroupId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
    { id: "plan", label: "План", Icon: GraduationCap },
    ...(slug === "physiology" ? [{ id: "lessons" as GroupId, label: "Занятия", Icon: ListChecks }] : []),
    { id: "tests", label: "Тесты", Icon: FileQuestion },
    { id: "materials", label: "Материалы", Icon: FolderOpen },
    { id: "practice", label: "Практика", Icon: FlaskConical },
    ...(portal || externalPlatforms.length
      ? [{ id: "portal" as GroupId, label: portal?.tabLabel || "Платформы", Icon: Globe }]
      : []),
    // Билеты и вопросы к экзамену объединены: это один и тот же банк.
    { id: "attestations", label: "Экзамен · Аттестации", Icon: ClipboardList },
    { id: "progress", label: "Прогресс", Icon: TrendingUp },
  ];
  const group = GROUP_OF[tab];
  const subnav: { id: TabId; label: string }[] =
    group === "tests"
      ? [
          { id: "tests", label: "Тесты" },
          { id: "practice", label: "База вопросов" },
        ]
      : group === "materials"
        ? [
            // У физиологии лекции живут внутри занятий, отдельная вкладка не нужна.
            ...(slug === "physiology" ? [] : [{ id: "lectures" as TabId, label: "Лекции" }]),
            { id: "materials", label: "Материалы" },
          ]
        : group === "practice"
          ? [
              { id: "trainers", label: "Тренажёры" },
              { id: "trainer", label: histology ? "Микропрепараты" : "Препараты" },
              { id: "labs", label: "Лабораторные" },
              ...(chemistry
                ? [{ id: "chem" as TabId, label: subjectSubmodule?.tabs[0]?.label ?? "Структуры" }]
                : []),
              ...(latin ? [{ id: "latin" as TabId, label: "Рецепты" }] : []),
            ]
          : group === "attestations"
            ? [
                { id: "exam", label: "Экзамен / Билеты" },
                { id: "attestations", label: "Аттестации" },
                ...(slug === "physiology" ? [{ id: "colloquium" as TabId, label: "Коллоквиум" }] : []),
              ]
            : [];

  return {
    // состояние
    tab,
    setTab: selectTab,
    selectTab,
    group,
    nav,
    subnav,
    loading,
    error,
    searchParams,
    user,
    // данные
    subject,
    subjectId,
    slug,
    course,
    sem,
    modules,
    topicItems,
    plan,
    gradebook,
    tests,
    materials,
    materialsRich,
    lectures,
    progress,
    planProgress,
    topicProgressById,
    planSummary,
    planSessions,
    topicBusy,
    resourceErrors,
    subjectLibrary,
    subjectLectures,
    orderedLectures,
    planLectureWeeks,
    activeLecture,
    setActiveLecture,
    lectureLoading,
    lectureError,
    activeMaterial,
    setActiveMaterial,
    // признаки предмета
    histology,
    chemistry,
    latin,
    portal,
    externalPlatforms,
    subjectSubmodule,
    // действия
    cycleTopicStatus,
    openTopicMaterial,
    openLectureById,
  };
}

export type SubjectController = ReturnType<typeof useSubjectPage>;
