/** Загрузка данных предмета: ядро страницы и медленные вспомогательные панели. */
import {
  getProgress,
  getSubject,
  getSubjectGradebook,
  getSubjectPlan,
  getSubjectPlanProgress,
  listLectures,
  listMaterials,
  listSubjectsCatalog,
  listTests,
  type ApiTest,
  type SubjectPlan,
} from "@/lib/api";
import { listSubjectMaterials } from "@/lib/content-api";
import { slugNames } from "@/components/subjects/tabs-config";
import { describeApiError } from "@/lib/errors";

export type Subject = {
  id: string;
  name: string;
  course_number?: number | null;
  semester?: number | null;
  control_type?: string | null;
  total_hours?: number | null;
  credits?: number | null;
  slug?: string | null;
};
export type Module = { id?: string; title?: string; topics?: { id?: string; title?: string }[] };

/**
 * D9: результат первого этапа загрузки предмета — ядро страницы (предмет,
 * модули, план, тесты). `ready: false` — версия «ещё не готовы» (bootstrap
 * авторизации), страница показывает скелетон.
 */
export type SubjectCoreLoad =
  | { ready: false }
  | {
      ready: true;
      subjectId: string;
      slug: string;
      subject: Subject;
      modules: Module[];
      topicItems: any[];
      plan: SubjectPlan | null;
      tests: ApiTest[];
      resourceErrors: Record<string, string>;
    };

/**
 * Ядро страницы: каталог, предмет, план и тесты. Обе первые волны не зависят
 * друг от друга, поэтому запросы стартуют параллельно — Vercel → SpaceWeb
 * иначе превращается в водопад.
 */
export async function loadSubjectCore({
  params,
  authLoading,
  groupId,
  signal,
}: {
  params: Promise<{ id: string }>;
  authLoading: boolean;
  groupId?: string;
  signal: AbortSignal;
}): Promise<SubjectCoreLoad> {
  if (authLoading) return { ready: false };
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
      const testsRequest = listTests(s.id, groupId, slug, s.course_number ?? 2, s.semester ?? 3, { signal });
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
    return { ready: true, subjectId: routeId, slug, subject, modules, topicItems: responseData?.items || [], plan, tests, resourceErrors };
  } catch (cause) {
    throw new Error(cause instanceof Error && cause.message ? cause.message : "Не удалось загрузить предмет");
  }
}

/** Этап 2 — медленные вспомогательные панели (зачётка, материалы, прогресс). */
export async function loadSubjectAux({
  subjectId,
  slug,
  groupId,
  signal,
}: {
  subjectId: string;
  slug: string;
  groupId?: string;
  signal: AbortSignal;
}) {
  if (!subjectId) return null;
  return Promise.all([
    getSubjectGradebook(subjectId, { signal }),
    listSubjectMaterials({ subjectId }, { signal }),
    getProgress(subjectId, groupId, { signal }),
    listMaterials(slug ? { subjectSlug: slug } : {}, { signal }),
    listLectures(slug, { signal }),
    getSubjectPlanProgress(subjectId, { signal }),
  ]);
}
