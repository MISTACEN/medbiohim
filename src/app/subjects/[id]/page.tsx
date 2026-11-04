"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ComponentType } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, ChevronLeft, ClipboardList, ExternalLink, FileQuestion, FlaskConical, FolderOpen, Globe, GraduationCap, ListChecks, TrendingUp, X } from "lucide-react";
import { getLecture, getProgress, getSubject, getSubjectGradebook, getSubjectPlan, getSubjectPlanProgress, listLectures, listMaterials, listSubjectsCatalog, listTests, markMaterialOpened, setTopicProgress, type ApiTest, type Lecture, type SubjectPlan } from "@/lib/api";
import { LectureView } from "@/components/lectures/LectureView";
import { listSubjectMaterials, type SubjectMaterial } from "@/lib/content-api";
import { resolveSubjectSlug } from "@/lib/subjectSlug";
import { platformsForSubject } from "@/data/external-platforms";
import { LIBRARY_FILES } from "@/lib/library";
import SubjectTrainersHub from "@/components/trainers/SubjectTrainersHub";
import HistologyTrainer from "@/components/trainers/HistologyTrainer";
import HistologyMaterials from "@/components/trainers/HistologyMaterials";
import TestsHub from "@/components/tests/TestsHub";
import Labs from "@/components/Labs";
import AttestationList from "@/components/attestations/AttestationList";
import ExamQuestionsPanel from "@/components/subjects/ExamQuestionsPanel";
import TicketGenerator from "@/components/subjects/TicketGenerator";
import { PlanTimeline } from "@/components/subjects/PlanTimeline";
import TabFallback from "@/components/subjects/TabFallback";
import PhysiologyPractice from "@/components/physiology/PhysiologyPractice";
import Colloquium from "@/components/physiology/Colloquium";
import SubjectQuestionBank from "@/components/questions/SubjectQuestionBank";
import HobaPortal from "@/components/portals/HobaPortal";
import MatchingTrainer from "@/components/portals/MatchingTrainer";
import LegacyMCTests from "@/components/portals/LegacyMCTests";
import ChemSdf from "@/components/portals/ChemSdf";
import ArchiveLectures from "@/components/portals/ArchiveLectures";
import ChemPlan from "@/components/chem/ChemPlan";
import { ChemistryWorkbench } from "@/components/chemistry/ChemistryWorkbench";
import SubjectSimulations from "@/components/labs/SubjectSimulations";
import SubjectModules from "@/components/subjects/SubjectModules";
import LatinRecipes from "@/components/portals/LatinRecipes";
import { legacyPortalConfig } from "@/lib/portalContent";
import ExternalPlatformLinks from "@/components/university/ExternalPlatformLinks";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useAuth } from "@/components/auth/AuthProvider";
import { describeApiError } from "@/lib/errors";
import { sessionsFromApiPlanWeeks } from "@/lib/subject-plan-next";
import { SUBJECT_STATIC_PLANS } from "@/lib/subject-plan-static";

type Subject = {
  id: string;
  name: string;
  course_number?: number | null;
  semester?: number | null;
  control_type?: string | null;
  total_hours?: number | null;
  credits?: number | null;
  slug?: string | null;
};
type Module = { id?: string; title?: string; topics?: { id?: string; title?: string }[] };

/**
 * D9: результат первого этапа загрузки предмета — ядро страницы (предмет,
 * модули, план, тесты). `ready: false` — версия «ещё не готовы» (bootstrap
 * авторизации), страница показывает скелетон.
 */
type SubjectCoreLoad =
  | { ready: false }
  | {
      ready: true;
      subjectId: string;
      slug: string;
      subject: Subject;
      modules: Module[];
      plan: SubjectPlan | null;
      tests: ApiTest[];
      resourceErrors: Record<string, string>;
    };

type TabId = "plan" | "lessons" | "tests" | "practice" | "lectures" | "materials" | "trainer" | "trainers" | "labs" | "attestations" | "exam" | "progress" | "colloquium" | "portal" | "chem" | "latin";
type GroupId = "plan" | "lessons" | "tests" | "materials" | "practice" | "attestations" | "progress" | "portal";

const TAB_IDS: TabId[] = ["plan", "lessons", "tests", "practice", "lectures", "materials", "trainer", "trainers", "labs", "attestations", "exam", "progress", "colloquium", "portal", "chem", "latin"];

// Вкладки сгруппированы: верхний ряд — крупные разделы, внутри — точные режимы.
// «Билеты» и «Вопросы к экзамену» объединены во вкладку exam («Экзамен / Билеты»):
// билеты и есть вопросы к экзамену. Старые адреса ?tab=tickets продолжают
// работать через алиас в normalizeTab — внешние ссылки из планов кафедр и
// sitemap не должны попасть в 404.
const GROUP_OF: Record<TabId, GroupId> = {
  plan: "plan",
  lessons: "lessons",
  tests: "tests",
  practice: "tests",
  lectures: "materials",
  materials: "materials",
  trainer: "practice",
  trainers: "practice",
  labs: "practice",
  attestations: "attestations",
  exam: "attestations",
  colloquium: "attestations",
  portal: "portal",
  progress: "progress",
  chem: "practice",
  latin: "practice",
};

const GROUP_DEFAULT: Record<GroupId, TabId> = {
  plan: "plan",
  lessons: "lessons",
  tests: "tests",
  materials: "lectures",
  practice: "trainers",
  attestations: "exam",
  portal: "portal",
  progress: "progress",
};

function normalizeTab(v: string) {
  // Алиасы старых адресов: билеты теперь живут во вкладке «Экзамен / Билеты».
  if (v === "tickets") return "exam" as TabId;
  if (v === "cards") return "trainers" as TabId;
  return v as TabId;
}

const slugNames: Record<string, string> = {
  "гистология, цитология": "histology",
  гистология: "histology",
  физиология: "physiology",
  "органическая и физическая химия": "chemistry_organic_physical",
};
const semester = (n: number) => (n % 2 ? "Осенний" : "Весенний");

function isTabId(v: string): v is TabId {
  return (TAB_IDS as string[]).includes(v);
}

function materialTypeLabel(type?: string | null) {
  const map: Record<string, string> = { lecture: "Лекция", pdf: "PDF", pptx: "Презентация", docx: "Word", lab: "Лабораторная", table: "Таблица", html: "Страница", video: "Видео", other: "Материал" };
  return map[String(type || "")] || String(type || "Материал");
}

function stripHtml(html?: string | null) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function SubjectPageInner({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get("tab") || "";
  const { user, loading: authLoading } = useAuth();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
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
    const fromQuery = tabFromQuery;
    const initial = fromQuery || fromHash;
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
  // Этап 1 — ядро страницы: каталог, предмет, план и тесты ( AbortSignal
  // отменяет запросы при unmount и смене предмета/группы).
  const { data: coreLoad, loading: coreLoading, error: coreError } = useApiRequest<SubjectCoreLoad>(
    async (signal) => {
      if (authLoading) return { ready: false } as SubjectCoreLoad;
      try {
        const p = await params;
        const routeId = p.id;
        // Catalog and subject are independent: start both requests immediately
        // so Vercel -> SpaceWeb latency does not create a waterfall.
        const [cat, r] = await Promise.all([listSubjectsCatalog({ signal }), getSubject(routeId, { signal })]);
        const hit = cat.ok
          ? cat.data.items.find((x: any) => x.id === routeId || x.slug === routeId) ||
            cat.data.items.find((x: any) => x.name.toLowerCase() === decodeURIComponent(routeId).toLowerCase())
          : null;
        if (!r.ok && !hit) throw new Error(describeApiError(r.error));
        // Cloudflare returns the subject row directly; the legacy SpaceWeb
        // contract may wrap it as { subject, modules }. Accept both shapes and
        // retain the catalog row as a safe fallback so a shape mismatch cannot
        // blank the entire subject page.
        const responseData: any = r.ok ? r.data : null;
        const subjectPayload = responseData?.subject || responseData?.item ||
          (responseData?.id ? responseData : null);
        const s: any = { ...(hit || {}), ...(subjectPayload || {}) };
        if (!s.name && hit?.name) s.name = hit.name;
        if (!s.slug && hit?.slug) s.slug = hit.slug;
        if (s.course_number == null && hit?.course_number != null) s.course_number = hit.course_number;
        if (s.semester == null && hit?.semester != null) s.semester = hit.semester;
        const moduleRows = responseData?.modules || responseData?.subject?.modules || [];
        const modules: Module[] = Array.isArray(moduleRows) ? (moduleRows as Module[]) : [];
        const slug = slugNames[(s?.name || "").toLowerCase()] || s?.slug || "";
        let subject: Subject = s;
        let plan: SubjectPlan | null = null;
        let tests: ApiTest[] = [];
        const resourceErrors: Record<string, string> = {};
        if (s?.id) {
          // Render the core subject view as soon as its plan and test catalog
          // arrive. Slow auxiliary panels (progress, tickets, media and CMS)
          // should not leave the whole subject page on a skeleton.
          const planRequest = slug ? getSubjectPlan(slug, s.course_number ?? 2, s.semester ?? 3, { signal }) : Promise.resolve({ ok: false } as any);
          const testsRequest = listTests(s.id, user?.groupId, slug, s.course_number ?? 2, s.semester ?? 3, { signal });
          const [pr, tt] = await Promise.all([planRequest, testsRequest]);
          if (pr.ok) {
            const planData = pr.data.plan || pr.data;
            const planSubject = pr.data.subject && typeof pr.data.subject === "object" ? pr.data.subject : {};
            const planWeeks = Array.isArray(planData.weeks) ? planData.weeks : (Array.isArray(planData.items) ? planData.items.map((item: any, index: number) => {
              const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
              const kind = String(item.item_type || "").toLowerCase();
              return {
                ...item,
                date: item.planned_date || metadata.date || null,
                week: metadata.week ?? metadata.calendar_week ?? index + 1,
                lecture: kind === "lecture" ? item.title : (metadata.lecture || item.title),
                practice: ["practice", "lab", "seminar"].includes(kind) ? item.title : (metadata.practice || null),
                preparations: Array.isArray(item.preparations) ? item.preparations : (Array.isArray(metadata.preparations) ? metadata.preparations : []),
              };
            }) : []);
            // Some older API versions return the subject and plan as separate
            // resources. Merge workload fields defensively so the page header
            // never goes blank merely because one response omitted them.
            const planSubjectFields: Record<string, unknown> = {
              id: planSubject.id,
              name: planSubject.name || (typeof planData.subject === "string" ? planData.subject : planData.title),
              slug: planSubject.slug || planData.subject_slug || slug,
              course_number: planSubject.course_number ?? planData.course_number ?? planData.course,
              semester: planSubject.semester ?? planData.semester,
              control_type: planSubject.control_type ?? planData.control ?? planData.control_type,
              total_hours: planSubject.total_hours ?? planData.total_hours ?? planData.hours?.total,
              credits: planSubject.credits ?? planData.credits,
              lecture_hours: planSubject.lecture_hours ?? planData.hours?.lecture,
              practice_hours: planSubject.practice_hours ?? planData.hours?.practice,
              self_study_hours: planSubject.self_study_hours ?? planData.hours?.self_study,
              description: planSubject.description ?? planData.description,
            };
            const merged: any = { ...(planSubject || {}), ...(s || {}) };
            for (const [key, value] of Object.entries(planSubjectFields)) {
              if ((merged[key] == null || merged[key] === "") && value != null && value !== "") merged[key] = value;
            }
            subject = merged;
            plan = { ...planData, weeks: planWeeks, control: planData.control || pr.data.plan_meta?.control };
          } else {
            resourceErrors.plan = pr.error?.message || "Не удалось загрузить учебный план.";
          }
          if (!tt.ok) resourceErrors.tests = tt.error?.message || "Не удалось загрузить тесты.";
          else tests = tt.data.items || [];
        }
        return { ready: true, subjectId: routeId, slug, subject, modules, plan, tests, resourceErrors };
      } catch (cause) {
        throw new Error(cause instanceof Error && cause.message ? cause.message : "Не удалось загрузить предмет");
      }
    },
    [params, authLoading, user?.groupId]
  );

  // Этап 1: применяем готовое ядро к состояниям страницы.
  useEffect(() => {
    if (!coreLoad?.ready) return;
    setSubjectId(coreLoad.subjectId);
    setSubject(coreLoad.subject);
    setModules(coreLoad.modules);
    setPlan(coreLoad.plan);
    setTests(coreLoad.tests);
    setResourceErrors(coreLoad.resourceErrors);
  }, [coreLoad]);

  const auxSubjectId = coreLoad?.ready ? coreLoad.subjectId : "";
  const auxSlug = coreLoad?.ready ? coreLoad.slug : "";
  // Этап 2 — медленные вспомогательные панели (зачётка, материалы,
  // прогресс): не блокируют ядро страницы, отменяются тем же хуком.
  const { data: auxLoad } = useApiRequest(
    async (signal) => {
      if (!auxSubjectId) return null;
      return Promise.all([
        getSubjectGradebook(auxSubjectId, { signal }),
        listSubjectMaterials({ subjectId: auxSubjectId }, { signal }),
        getProgress(auxSubjectId, user?.groupId, { signal }),
        listMaterials(auxSlug ? { subjectSlug: auxSlug } : {}, { signal }),
        listLectures(auxSlug, { signal }),
        getSubjectPlanProgress(auxSubjectId, { signal }),
      ]);
    },
    [auxSubjectId, auxSlug]
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

  // Личный статус темы: клик по чипу переводит его по циклу, сервер хранит
  // только свою строку (topic_progress). Синхронизация плана статусы не трогает.
  const TOPIC_STATUS_CYCLE: Record<string, string> = {
    pending: "in_progress",
    in_progress: "passed",
    passed: "failed",
    failed: "retake_needed",
    retake_needed: "pending",
  };
  const TOPIC_STATUS_LABEL: Record<string, string> = {
    pending: "не начато",
    in_progress: "в процессе",
    passed: "сдано",
    failed: "не сдано",
    retake_needed: "отработка",
  };
  const TOPIC_STATUS_CLASS: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600",
    in_progress: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]",
    passed: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]",
    failed: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
    retake_needed: "bg-orange-100 text-orange-800",
  };

  const topicProgressById = new Map<string, any>(
    ((planProgress?.items || []) as any[]).map((item) => [String(item.topic_id), item])
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
              item.topic_id === topicId ? { ...item, status: next } : item
            ),
          }
        : currentData
    );
    const res = await setTopicProgress(topicId, { status: next });
    if (!res.ok) {
      setPlanProgress((currentData: any) =>
        currentData
          ? {
              ...currentData,
              items: (currentData.items || []).map((item: any) =>
                item.topic_id === topicId ? { ...item, status: previous?.status || "pending" } : item
              ),
            }
          : currentData
      );
      setResourceErrors((current) => ({ ...current, topicProgress: describeApiError(res.error) }));
    } else {
      setResourceErrors((current) => {
        const { topicProgress: _drop, ...rest } = current;
        return rest;
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
                    materials: (item.materials || []).map((m: any) => m.id === material.id ? { ...m, opened: true } : m),
                    unopened_materials_count: Math.max(0, Number(item.unopened_materials_count || 0) - 1),
                  }
                : item
            ),
          }
        : currentData
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
  const chemistry = /chem|хим/i.test(`${slug || ""} ${subject?.name || ""}`);
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
            { id: "lectures", label: "Лекции" },
            { id: "materials", label: "Материалы" },
          ]
        : group === "practice"
          ? [
              { id: "trainers", label: "Тренажёры" },
              { id: "trainer", label: histology ? "Микропрепараты" : "Препараты" },
              { id: "labs", label: "Лабораторные" },
              ...(chemistry ? [{ id: "chem" as TabId, label: "Структуры" }] : []),
              ...(latin ? [{ id: "latin" as TabId, label: "Рецепты" }] : []),
            ]
          : group === "attestations"
            ? [
                { id: "exam", label: "Экзамен / Билеты" },
                { id: "attestations", label: "Аттестации" },
                ...(slug === "physiology" ? [{ id: "colloquium" as TabId, label: "Коллоквиум" }] : []),
              ]
            : [];

  if (loading) return (
    <div className="mx-auto max-w-6xl space-y-4" aria-label="Загрузка">
      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
      <div className="card space-y-3 p-5">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[1,2,3,4].map((n) => <div key={n} className="h-11 w-28 shrink-0 animate-pulse rounded-xl bg-slate-200" />)}
      </div>
      <div className="card min-h-48 animate-pulse p-5" />
    </div>
  );
  if (error && !subject) return <div className="card p-6 text-sm text-[var(--status-critical-fg)]">{error}</div>;

  return (
    <div className="space-y-6">
      <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" />К предметам
      </Link>

      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Предмет · Курс · Семестр</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{subject?.name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {course} курс · {semester(sem)} · {sem}
          {subject?.control_type
            ? " · " +
              (subject.control_type === "exam" ? "Экзамен" : subject.control_type === "credit" ? "Зачёт" : subject.control_type)
            : ""}
        </p>
      </header>

      <section className="card border-indigo-100 bg-indigo-50/40 p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <b>Учебная нагрузка:</b>
          {subject?.total_hours != null && <span>{subject.total_hours} ч</span>}
          {subject?.credits != null && <span>· {subject.credits} з.е.</span>}
        </div>
        {gradebook.length > 0 && (
          <div className="mt-2 text-sm text-slate-600">
            <b>Для зачётки:</b>{" "}
            {gradebook.map((g: any, i: number) => (
              <span key={i}>
                {i ? " · " : ""}
                {g.display_name}
                {g.hours != null ? " (" + g.hours + (g.credits != null ? "/" + g.credits : " ч") + ")" : ""}
              </span>
            ))}
          </div>
        )}
      </section>

      <nav className="mobile-scroll-x flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap" role="tablist" aria-label="Разделы предмета">
        {nav.map(({ id, label, Icon }) => {
          const active = group === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(GROUP_DEFAULT[id])}
              className={
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (active
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      {subnav.length > 1 && (
        // Чипсы режимов на мобильных прокручиваются горизонтально, а не ломают строку.
        <nav className="mobile-scroll-x flex flex-nowrap gap-1.5 overflow-x-auto pb-1 md:flex-wrap" aria-label="Режимы раздела">
          {subnav.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => selectTab(id)}
                className={
                  "min-h-8 shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition " +
                  (active ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
                }
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}

      <div role="tabpanel" className="min-h-[12rem]">
        {tab === "colloquium" && slug === "physiology" && <Colloquium embedded />}

        {tab === "chem" && chemistry && <ChemistryWorkbench embedded />}

        {tab === "latin" && latin && (
          <section className="card p-4 sm:p-5">
            <h2 className="text-lg font-bold">Латинский язык · рецепты</h2>
            <p className="mt-1 text-sm text-slate-500">
              Формы рецептов по Чернявскому: разделы, поиск и карточки Rp./Da./Signa — без ухода с предмета.
            </p>
            <div className="mt-4">
              <LatinRecipes />
            </div>
          </section>
        )}

        {tab === "portal" && (portal || externalPlatforms.length > 0) && (
          <div className="space-y-6">
            {portal?.hoba && <HobaPortal />}
            {portal?.sdf && <ChemSdf />}
            {portal?.parasitology && <MatchingTrainer />}
            {portal?.lectures && <ArchiveLectures setId={portal.lectures} />}
            {portal?.mcSubjectIds?.length ? (
              <section className="space-y-3">
                <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-400">Тестовые тренировки</h2>
                <LegacyMCTests subjectIds={portal.mcSubjectIds} />
              </section>
            ) : null}
            <ExternalPlatformLinks subjectSlug={slug} />
          </div>
        )}

        {tab === "lessons" && slug === "physiology" && (
          <PhysiologyPractice backHref={`/subjects/${encodeURIComponent(subjectId)}?tab=plan`} backLabel="К учебному плану" />
        )}
        {tab === "plan" && SUBJECT_STATIC_PLANS[slug] && <ChemPlan planFile={SUBJECT_STATIC_PLANS[slug]} subjectSlug={slug} />}
        {tab === "plan" && !SUBJECT_STATIC_PLANS[slug] && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Учебный план</h2>
            <p className="mt-1 text-sm text-slate-500">
              {plan ? (plan.control || "Контроль не указан") + " · " + (plan.weeks || []).length + " занятий" : resourceErrors.plan || "План ещё не загружен."}
            </p>
            {plan?.weeks?.length ? (
              // Единая лента плана: ближайшее занятие крупно сверху, предстоящие
              // списком, прошедшие — свёрнуты. Связки переключают вкладки предмета.
              <div className="mt-4">
                <PlanTimeline
                  sessions={planSessions}
                  links={{ onOpenTab: (t) => selectTab(t as TabId), onOpenLecture: openLectureById }}
                  emptyLabel="В плане пока нет занятий."
                />
              </div>
            ) : modules.length ? (
              <div className="mt-4 space-y-2">
                {planSummary && planSummary.total > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-2 text-sm">
                    <b>Мой прогресс:</b>
                    <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-ok-fg)]">
                      сдано {planSummary.passed} из {planSummary.total}
                    </span>
                    {planSummary.in_progress > 0 && (
                      <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-xs text-[var(--status-warn-fg)]">в процессе {planSummary.in_progress}</span>
                    )}
                    {planSummary.failed_or_retake > 0 && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">отработка {planSummary.failed_or_retake}</span>
                    )}
                    {Number(planSummary.unopened_materials || 0) > 0 && (
                      <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-xs text-[var(--status-warn-fg)]">не открыто материалов: {planSummary.unopened_materials}</span>
                    )}
                    <span className="text-xs text-slate-500">отметка видна только вам</span>
                  </div>
                )}
                {resourceErrors.topicProgress && (
                  <div className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-2 text-sm text-[var(--status-critical-fg)]">{resourceErrors.topicProgress}</div>
                )}
                {modules.map((m, i) => (
                  <details key={m.id || i} className="rounded-xl border" open={i === 0}>
                    <summary className="cursor-pointer px-4 py-3 font-semibold">{m.title || "Модуль " + (i + 1)}</summary>
                    <div className="border-t px-4 py-2 text-sm">
                      {(m.topics || []).map((tp, j) => {
                        const item = topicProgressById.get(String(tp.id));
                        const status = item?.status || "pending";
                        const nextDate = (item?.schedule_dates || [])[0];
                        return (
                          <div key={tp.id || j} className="border-b py-2 last:border-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={topicBusy === String(tp.id)}
                                onClick={() => cycleTopicStatus(String(tp.id), status)}
                                title="Клик меняет статус: не начато → в процессе → сдано → не сдано → отработка. Отметка видна только вам."
                                className={"rounded-full px-2 py-0.5 text-xs font-semibold disabled:opacity-50 " + (TOPIC_STATUS_CLASS[status] || TOPIC_STATUS_CLASS.pending)}
                              >
                                {TOPIC_STATUS_LABEL[status] || TOPIC_STATUS_LABEL.pending}
                              </button>
                              <span className="flex-1">{tp.title}</span>
                              {(item?.tests_count || 0) > 0 && (
                                <button type="button" onClick={() => selectTab("tests")} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100">
                                  📝 тестов: {item.tests_count}
                                </button>
                              )}
                              {(item?.exam_questions_count || 0) > 0 && (
                                <button type="button" onClick={() => selectTab("exam")} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100">
                                  ❓ вопросов: {item.exam_questions_count}
                                </button>
                              )}
                              {(item?.materials || []).map((material: any) => (
                                <button
                                  key={material.id}
                                  type="button"
                                  onClick={() => void openTopicMaterial(String(tp.id), material)}
                                  title={material.opened ? "Материал уже открыт" : "Ещё не открыт — откроется и отметится"}
                                  className={"max-w-[220px] truncate rounded-full px-2 py-0.5 text-xs " + (material.opened ? "bg-slate-100 text-slate-500" : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] hover:opacity-80")}
                                >
                                  {material.opened ? "✓ " : "• "}{material.title}
                                </button>
                              ))}
                              {(item?.unopened_materials_count || 0) > 0 && (
                                <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-warn-fg)]">
                                  не открыто: {item.unopened_materials_count}
                                </span>
                              )}
                              {nextDate?.date && (
                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700" title="Занятие по расписанию, привязанное к теме">
                                  📅 {nextDate.date.slice(5)}{nextDate.type ? " · " + nextDate.type : ""}
                                </span>
                              )}
                            </div>
                            {item?.grade ? (
                              <div className="mt-1 text-xs text-slate-500">Оценка: {item.grade}</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {/* Объединённая вкладка «Экзамен / Билеты»: всё содержимое билетного
            банка (генератор, банки вопросов, ситуационные задачи, препараты,
            архив) и список вопросов к экзамену — в одном месте. Старые адреса
            ?tab=tickets и ?tab=exam ведут сюда. */}
        {tab === "exam" && (
          <div className="space-y-4">
            <TicketGenerator slug={slug} subjectName={subject?.name} />
            <ExamQuestionsPanel subjectSlug={slug} />
          </div>
        )}

        {tab === "tests" && (
          <TestsHub
            subjectId={subject?.id || subjectId}
            subjectSlug={slug}
            subjectName={subject?.name}
            course={subject?.course_number ?? 2}
            semester={subject?.semester ?? 3}
            initialTopicId={searchParams.get("topic") || undefined}
            autoStart={searchParams.get("start") === "1"}
            embedded
          />
        )}

        {tab === "practice" && (
          <div className="space-y-3">
            <SubjectQuestionBank subjectId={subject?.id || ""} subjectSlug={slug} subjectName={subject?.name} />
            <SubjectModules
              slug={slug}
              name={subject?.name}
              subjectId={subject?.id || subjectId}
              topics={modules
                .flatMap((m) => (m.topics || []).map((tp) => ({ id: String(tp.id || ""), title: String(tp.title || "") })))
                .filter((tp) => tp.id && tp.title)}
            />
            <SubjectSimulations slug={slug} name={subject?.name} />
            {modules.length > 0 && (
              <section className="card p-5">
                <h2 className="text-lg font-bold">Темы предмета</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {histology ? "Темы, к которым привязаны микропрепараты, электронограммы и задания МБХ." : "Темы и практические задания предмета."}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {modules.slice(0, 6).map((m, i) => (
                    <div key={m.id || i} className="rounded-xl border p-3 text-sm font-medium">
                      {m.title}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "lectures" && activeLecture && (
          // Читаем лекцию тем же блоком, что и отдельная страница /lectures/:id:
          // оглавление по блокам, шапка со скачиванием и прогрессом, навигация.
          <LectureView
            lecture={activeLecture}
            lectureId={String((activeLecture as any).id || "")}
            onBack={() => setActiveLecture(null)}
            backLabel="К списку лекций"
          />
        )}

        {tab === "lectures" && !activeLecture && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Лекции</h2>
            <p className="mt-1 text-sm text-slate-500">Лекции этого предмета — читаются прямо здесь.</p>
            {lectureLoading && <p className="mt-3 text-sm text-slate-500">Открываю лекцию…</p>}
            {lectureError && <p className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">{lectureError}</p>}
            {subjectLectures.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {orderedLectures.map((lec: any) => (
                  <button
                    key={lec.id}
                    type="button"
                    onClick={() => openLectureById(String(lec.id))}
                    className="flex gap-3 rounded-xl border bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-white"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold leading-snug">{lec.title}</span>
                        {planLectureWeeks.has(String(lec.id)) && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                            неделя {planLectureWeeks.get(String(lec.id))}
                          </span>
                        )}
                      </div>
                      {lec.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{lec.summary}</p>}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
                Опубликованных лекций по этому предмету пока нет.
              </p>
            )}
          </section>
        )}

        {tab === "materials" && (
          histology ? (
            <HistologyMaterials />
          ) : (
            <section className="card p-5">
              <h2 className="text-lg font-bold">Материалы</h2>
              <p className="mt-1 text-sm text-slate-500">
                {materialsRich.length
                  ? materialsRich.length + " материалов — читаются прямо здесь, оригинал доступен отдельно."
                  : subjectLibrary.length
                    ? subjectLibrary.length + " исходных пособий кафедры — открываются здесь же."
                    : "Материалы пока не найдены."}
              </p>
              {subjectLibrary.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {subjectLibrary.map((file) => (
                    <a
                      key={file.href}
                      href={file.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex gap-3 rounded-xl border bg-slate-50 p-4 transition hover:border-indigo-300 hover:bg-white"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                        <FolderOpen className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug">{file.title}</span>
                        <span className="mt-1 block text-xs text-slate-500">{file.type}</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
              {materialsRich.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {materialsRich.map((m: any) => (
                    <article key={m.id} className="rounded-xl border bg-slate-50 p-4">
                      <div className="font-semibold leading-snug">{m.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{materialTypeLabel(m.type)}{m.source?.name ? " · " + m.source.name : ""}</div>
                      {stripHtml(m.content_html) && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{stripHtml(m.content_html)}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn-primary text-xs" onClick={() => setActiveMaterial(m)}>Читать</button>
                        {m.source?.download_url ? (
                          <a href={m.source.download_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                            <ExternalLink className="h-3.5 w-3.5" /> Исходник
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {!materialsRich.length && !subjectLibrary.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => selectTab("practice")} className="btn-primary inline-flex">Открыть базу вопросов</button>
                  <button
                    type="button"
                    onClick={() => selectTab("tests")}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300"
                    style={{ background: "var(--card)", borderColor: "var(--border)" }}
                  >
                    Перейти к тестам
                  </button>
                </div>
              )}
            </section>
          )
        )}

        {tab === "trainer" && (
          histology ? (
            <HistologyTrainer embedded />
          ) : (
            <TabFallback
              title="Микропрепараты"
              description="Для этого предмета микропрепараты пока не подключены. Потренируйтесь на вопросах с эталонами или запустите тест."
              onOpenTab={selectTab}
            />
          )
        )}

        {tab === "trainers" && (
          histology ? (
            <SubjectTrainersHub lectureHref={`/subjects/${encodeURIComponent(subjectId)}?tab=lectures`} />
          ) : (
            <TabFallback
              title="Тренажёры"
              description="Интерактивные тренажёры по этому предмету пока не подключены. Можно отработать материал в базе вопросов или в тестах."
              onOpenTab={selectTab}
            />
          )
        )}

        {tab === "labs" && (
          <section className="space-y-3">
            <div className="card p-5">
              <h2 className="text-lg font-bold">Интерактивные лабораторные</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Пошаговые лабораторные работы по этому предмету: задания внутри сессии, ответы и проверка преподавателем.
              </p>
            </div>
            <Labs subject={slug} />
          </section>
        )}

        {tab === "attestations" && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">
                <ClipboardList className="h-4 w-4" /> Аттестации
              </div>
              <h2 className="mt-1.5 font-serif text-xl font-semibold">Коллоквиумы, экзамены, зачёты и контрольные</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Открывайте аттестацию по этапам: теория с конспектом ответа, проверяемые тесты и задачи с эталонным решением. Прогресс сохраняется автоматически.
              </p>
            </div>
            <AttestationList subjectSlug={slug} subjectName={subject?.name} />
          </section>
        )}

        {tab === "exam" && <ExamQuestionsPanel subjectSlug={slug} />}

        {tab === "progress" && (
          <section className="card p-5">
            <h2 className="text-lg font-bold">Прогресс</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Общий</div>
                <b className="text-2xl">{progress?.overall_pct != null ? Math.round(progress.overall_pct) + "%" : "—"}</b>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Тесты</div>
                <b className="text-2xl">{tests.length}</b>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Материалы</div>
                <b className="text-2xl">{materials.length}</b>
              </div>
            </div>
            {tests.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {tests.slice(0, 6).map((t) => (
                  <Link key={t.id} href={"/tests/preparation/" + encodeURIComponent(t.id)} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
                    {t.title || t.name || "Тест"} · {t.questions_count || 0} вопросов
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {activeMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setActiveMaterial(null)}>
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{subject?.name} · {materialTypeLabel(activeMaterial.type)}</div>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">{activeMaterial.title}</h2>
                {activeMaterial.source?.name && <div className="mt-1 text-xs text-slate-500">Исходный файл: {activeMaterial.source.name}</div>}
              </div>
              <button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setActiveMaterial(null)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {activeMaterial.content_html ? (
                <article className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: activeMaterial.content_html }} />
              ) : activeMaterial.external_url ? (
                <iframe src={activeMaterial.external_url} title={activeMaterial.title} className="h-full min-h-[60vh] w-full rounded-xl border" />
              ) : (
                <div className="rounded-2xl bg-slate-50 p-8 text-sm text-slate-500">У этого материала пока нет преобразованного текста.</div>
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-5 py-4">
              <span className="text-xs text-slate-500">{activeMaterial.source_key ? "Источник: " + activeMaterial.source_key : "Источник не указан"}</span>
              <div className="flex gap-2">
                {activeMaterial.source?.download_url ? (
                  <a href={activeMaterial.source.download_url} target="_blank" rel="noreferrer" className="btn-pill inline-flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4" /> Открыть оригинал
                  </a>
                ) : null}
                <button type="button" className="btn-primary text-sm" onClick={() => setActiveMaterial(null)}>Закрыть</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl space-y-4 p-8 text-sm text-slate-500">Загрузка…</div>}>
      <SubjectPageInner params={params} />
    </Suspense>
  );
}
