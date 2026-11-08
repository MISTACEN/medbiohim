/**
 * Сборка страниц расписаний и обзора портала FESMU (ЗАДАЧА A3: вынесено из
 * монолита fesmu.ts).
 */
import { DISCLAIMER, FACULTIES, PORTAL, SCHEDULE_INDEX_URL, SCHEDULE_NOTE, findFaculty, staticServices } from "../portals";
import type { Faculty, FacultySchedule, FacultySummary, Overview, SchedulePage } from "../types";
import { loadSchedule } from "./load";
import { fetchFeed } from "./feed";
import { runPool, withDeadline } from "./status";

/* ------------------------------------------------------------------ *
 * Builders used by the route handlers
 * ------------------------------------------------------------------ */

/**
 * U5: «что внутри» карточки факультета до клика — число файлов, курсы,
 * специальности, наличие потоков и форм обучения. Считается по уже
 * закэшированному расписанию факультетов; недоступный факультет отдаёт
 * `ok: false` и не ломает overview.
 */
async function summariseFaculty(faculty: Faculty): Promise<FacultySummary> {
  const loaded = await loadSchedule(`schedule:${faculty.id}`, faculty.url, false, false);
  const items = loaded.items;
  const courses = [...new Set(items.map((item) => item.course).filter((value): value is string => Boolean(value)))].sort(
    (left, right) => (parseInt(left, 10) || 99) - (parseInt(right, 10) || 99),
  );
  const programs = [...new Set(items.map((item) => item.program).filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right, "ru"),
  );
  return {
    id: faculty.id,
    ok: loaded.ok,
    doc_count: items.length,
    courses,
    programs: programs.length > 0 ? programs : [...faculty.programs],
    has_streams: items.some((item) => Boolean(item.stream)),
    has_forms: items.some((item) => Boolean(item.form)),
  };
}

const EMPTY_SUMMARY_TIMEOUT_MS = 9_000;

function failedSummary(faculty: Faculty): FacultySummary {
  return {
    id: faculty.id,
    ok: false,
    doc_count: 0,
    courses: [],
    programs: [...faculty.programs],
    has_streams: false,
    has_forms: false,
  };
}

export async function getSchedulePage(options: { force?: boolean } = {}): Promise<SchedulePage> {
  const loaded = await loadSchedule("schedule:index", SCHEDULE_INDEX_URL, true, options.force === true);
  const faculty_summaries = await runPool(FACULTIES, 3, (faculty) =>
    withDeadline(summariseFaculty(faculty), EMPTY_SUMMARY_TIMEOUT_MS, () => failedSummary(faculty)),
  );
  return {
    index_url: SCHEDULE_INDEX_URL,
    note: SCHEDULE_NOTE,
    faculties: FACULTIES.map((faculty) => ({ ...faculty })),
    faculty_summaries,
    documents: loaded.items,
    cached: loaded.cached,
    stale: loaded.stale,
    fetched_at: loaded.fetched_at,
    error: loaded.error,
  };
}

export async function getFacultySchedule(
  id: string | null | undefined,
  options: { force?: boolean } = {},
): Promise<FacultySchedule | null> {
  const faculty: Faculty | null = findFaculty(id);
  if (!faculty) return null;
  const loaded = await loadSchedule(`schedule:${faculty.id}`, faculty.url, false, options.force === true);
  return {
    ok: loaded.ok,
    faculty: { ...faculty },
    fetched_at: loaded.fetched_at ?? new Date().toISOString(),
    source: faculty.url,
    cached: loaded.cached,
    stale: loaded.stale,
    cache_age_seconds: loaded.cache_age_seconds,
    items: loaded.items,
    error: loaded.error,
  };
}

export async function getOverview(options: { force?: boolean } = {}): Promise<Overview> {
  const force = options.force === true;
  const [news, announcements, events, schedule] = await Promise.all([
    fetchFeed("news", { force }),
    fetchFeed("announcements", { force }),
    fetchFeed("events", { force }),
    getSchedulePage({ force }),
  ]);
  return {
    ok: true,
    fetched_at: new Date().toISOString(),
    portal: { ...PORTAL },
    disclaimer: DISCLAIMER,
    services: staticServices(),
    schedule,
    feeds: { news, announcements, events },
  };
}

