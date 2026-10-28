/**
 * Public catalog of the ОЗиЗ Moodle (ozizdvgmu.ru), U7–U8.
 *
 * Only `GET` of public HTML: the course list on the front page, the category
 * tree, and leaf category pages. Course contents live behind the Moodle login
 * and are never requested; no credentials or Moodle tokens are read or stored
 * (anti-goal U9). Every loader returns a payload and never throws.
 */
import { cleanText, decodeEntities, deriveForm, parseCourseWord } from "./fesmu";
import { OZIZ_URL } from "./portals";
import type { OzizCatalog, OzizCategory, OzizCourse, Semester, StudyForm } from "./types";

export const OZIZ_NOTE =
  "Публичный каталог курсов ОЗиЗ (Moodle). Видны название, описание, преподаватель и учебный год; содержимое курса открывается только после входа на стороне Moodle — MEDBIOHIM не входит в аккаунт и не хранит пароли.";

const OZIZ_HOST = /(^|\.)ozizdvgmu\.ru$/i;
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CATEGORY_PAGES = 12;
const MAX_COURSES = 300;
const USER_AGENT = "MEDBIOHIM/1.0 (+https://medbiohim.vercel.app; public catalog reader)";

export type OzizResponse = {
  ok: boolean;
  status: number;
  body: string;
  error?: string | null;
};

export type OzizFetch = (url: string) => Promise<OzizResponse>;

const cache = new Map<string, { value: OzizCatalog; fetchedAt: number }>();
let transport: OzizFetch | null = null;

/** Tests replace the network with saved pages; `null` restores the real fetch. */
export function setOzizTransportForTests(next: OzizFetch | null): void {
  transport = next;
}

export function clearOzizCache(): void {
  cache.clear();
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function stripTags(input: string): string {
  return cleanText(decodeEntities(input.replace(/<[^>]*>/g, " ")));
}

/** `<option value="/course/index.php?categoryid=4">ДВГМУ / … / ИТвЗ</option>`. */
export function parseCategoryTree(html: string): OzizCategory[] {
  const seen = new Set<number>();
  const categories: OzizCategory[] = [];
  const pattern = /<option\s+value="\/course\/index\.php\?categoryid=(\d+)"[^>]*>([\s\S]*?)<\/option>/gi;
  for (const match of html.matchAll(pattern)) {
    const id = Number(match[1]);
    const path = stripTags(match[2]);
    if (!id || !path || seen.has(id)) continue;
    seen.add(id);
    const parts = path.split(/\s*\/\s*/).filter(Boolean);
    categories.push({ id, name: parts[parts.length - 1] ?? path, path, depth: parts.length });
  }
  return categories;
}

/**
 * Course boxes differ between the front page (`<a><h3>…</h3></a>` + teachers
 * and summary) and a category page (`div.coursename > a.aalink`). Both are
 * `div.coursebox`, so one block split handles the two shapes; a block without a
 * course link is skipped.
 */
export function parseCourses(html: string): OzizCourse[] {
  const seen = new Set<number>();
  const courses: OzizCourse[] = [];
  const blocks = html.split(/<div[^>]*\bclass="[^"]*\bcoursebox\b/i).slice(1);
  for (const block of blocks) {
    const link = /<a[^>]+href="([^"]*?\/course\/view\.php\?id=(\d+))"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;
    const id = Number(link[2]);
    const url = decodeEntities(link[1]);
    const title = stripTags(link[3]);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);

    const summaryMatch = /<span[^>]+title="([^"]*)"/i.exec(block);
    const summary = summaryMatch ? stripTags(summaryMatch[1]) : null;
    const teachers: string[] = [];
    const teacherPattern = /(?:Учитель|Teacher):\s*([^<]+)/gi;
    for (const teacher of block.matchAll(teacherPattern)) {
      const name = cleanText(decodeEntities(teacher[1]));
      if (name && !teachers.includes(name)) teachers.push(name);
    }

    courses.push({
      id,
      title,
      url,
      summary: summary && summary !== title ? summary.slice(0, 400) : null,
      teachers,
      category: null,
      faculty: null,
      program: null,
      course: null,
      course_number: null,
      form: null,
      semester: null,
      year: null,
    });
    if (courses.length >= MAX_COURSES) break;
  }
  return courses;
}

const PROGRAMS: { pattern: RegExp; faculty: string }[] = [
  { pattern: /фармац|биомед|мбх/i, faculty: "Фармация и биомедицины" },
  { pattern: /медико-гуманитарн|мгф|социальн\w*\s+работ|сестринск|клиническ\w*\s+психолог/i, faculty: "Медико-гуманитарный" },
  { pattern: /стоматолог|стм\./i, faculty: "Стоматологический" },
  { pattern: /педиатр/i, faculty: "Педиатрический" },
  { pattern: /лечебн|леч\.?\s*ф/i, faculty: "Лечебный" },
  { pattern: /колледж/i, faculty: "Колледж" },
];

/** Faculty from the title first, then from the Moodle category path (U8). */
export function deriveFaculty(title: string, categoryPath: string | null): string | null {
  // The category tree groups all ИТвЗ courses under «Лечебный факультет», so the
  // title must win: «… МБХ …» is фармация even when the path says лечебный.
  for (const source of [title, categoryPath ?? ""]) {
    for (const rule of PROGRAMS) {
      if (rule.pattern.test(source)) return rule.faculty;
    }
  }
  return null;
}

/** «34.03.01 Сестринское дело» — only when the title names the code explicitly. */
export function deriveProgramCode(title: string): string | null {
  const match = /(\d{2}\.\d{2}\.\d{2})\s+([А-ЯЁA-Zа-яё][А-Яа-яёA-Za-z\s\-()]{2,60})/.exec(title);
  if (!match) return null;
  return `${match[1]} ${cleanText(match[2])}`.slice(0, 100);
}

/** «2к.» in «МБХ, 2к. 02.2021»; «N курс» is handled by the shared parser. */
export function deriveCourseNumber(title: string): { course: string; courseNumber: number } | null {
  const word = parseCourseWord(title);
  if (word) return word;
  const short = /(\d{1,2})\s*к(?:\.|\b)/i.exec(title);
  if (!short) return null;
  const value = Number(short[1]);
  if (!(value >= 1 && value <= 9)) return null;
  return { course: `${value} курс`, courseNumber: value };
}

/** Academic year / month.year written in the title; no inventing a start date. */
export function deriveYear(title: string): string | null {
  // Month ranges («09.2020-06.2021») come first, otherwise the generic rule
  // would read the month as the second year.
  const range = /\b(?:\d{1,2}\.)?(20\d{2})\s*[-–/]\s*(?:\d{1,2}\.)?(20\d{2}|\d{2})\b(?!\.\d)/.exec(title);
  if (range) {
    const second = range[2].length === 4 ? range[2].slice(2) : range[2];
    return `${range[1]}-${second}`;
  }
  const month = /\b(0?[1-9]|1[0-2])\.(20\d{2})\b/.exec(title);
  if (month) return `${month[1].padStart(2, "0")}.${month[2]}`;
  return null;
}

function deriveSemester(title: string): Semester | null {
  if (/осен|autumn/i.test(title)) return "осенний";
  if (/весн|spring/i.test(title)) return "весенний";
  return null;
}

/** Form words only at a word start: «песочница» must not become «очная». */
function deriveOzizForm(title: string): StudyForm | null {
  return /(?:^|[^а-яё])(?:очно\s*-\s*заочн|заочн|очн)/i.test(title) ? deriveForm(title) : null;
}

/** U8: map a Moodle course onto the same dimensions as the FESMU schedule. */
export function deriveOzizMeta(
  title: string,
  category: string | null,
): Pick<OzizCourse, "faculty" | "program" | "course" | "course_number" | "form" | "semester" | "year"> {
  const course = deriveCourseNumber(title);
  return {
    faculty: deriveFaculty(title, category),
    program: deriveProgramCode(title),
    course: course?.course ?? null,
    course_number: course?.courseNumber ?? null,
    form: deriveOzizForm(title),
    semester: deriveSemester(title),
    year: deriveYear(title),
  };
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

function guardUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return null;
    if (!OZIZ_HOST.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.name === "AbortError") return "Таймаут источника";
    const code = (cause as NodeJS.ErrnoException).code;
    return (code ? `${code}: ${cause.message}` : cause.message).slice(0, 200) || "Ошибка сети";
  }
  return "Ошибка сети";
}

async function defaultFetch(url: string): Promise<OzizResponse> {
  const target = guardUrl(url);
  if (!target) return { ok: false, status: 0, body: "", error: "Разрешён только https://ozizdvgmu.ru" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (cause) {
    return { ok: false, status: 0, body: "", error: describeError(cause) };
  } finally {
    clearTimeout(timer);
  }
}

function fetcher(): OzizFetch {
  return transport ?? defaultFetch;
}

async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function leafCategories(categories: OzizCategory[]): OzizCategory[] {
  return categories
    .filter((category) => category.depth >= 2)
    .filter((category) => !categories.some((other) => other.id !== category.id && other.path.startsWith(`${category.path} /`)))
    .slice(0, MAX_CATEGORY_PAGES);
}

function mergeCourses(target: Map<number, OzizCourse>, incoming: OzizCourse[], category: string | null): void {
  for (const course of incoming) {
    const existing = target.get(course.id);
    if (!existing) {
      target.set(course.id, { ...course, category });
      continue;
    }
    if (category && !existing.category) existing.category = category;
    if (!existing.summary && course.summary) existing.summary = course.summary;
    for (const teacher of course.teachers) {
      if (!existing.teachers.includes(teacher)) existing.teachers.push(teacher);
    }
  }
}

function finish(courses: Map<number, OzizCourse>): OzizCourse[] {
  return [...courses.values()].map((course) => ({ ...course, ...deriveOzizMeta(course.title, course.category) }));
}

async function loadCatalog(): Promise<{ value: OzizCatalog | null; error: string | null }> {
  const read = fetcher();
  const [treePage, homePage] = await Promise.all([read(`${OZIZ_URL}course/index.php`), read(OZIZ_URL)]);

  const categories = treePage.ok ? parseCategoryTree(treePage.body) : [];
  const courses = new Map<number, OzizCourse>();
  if (homePage.ok) mergeCourses(courses, parseCourses(homePage.body), null);

  // Course→category binding only exists on category pages; skip failed leaves.
  const leaves = leafCategories(categories);
  const pages = await runPool(leaves, 3, async (category) => ({
    category,
    page: await read(`${OZIZ_URL}course/index.php?categoryid=${category.id}`),
  }));
  for (const { category, page } of pages) {
    if (page.ok) mergeCourses(courses, parseCourses(page.body), category.path);
  }

  if (!courses.size && !categories.length) {
    const error = homePage.error || treePage.error || "Источник не вернул ни курсов, ни категорий";
    return { value: null, error };
  }

  return {
    value: {
      ok: true,
      fetched_at: new Date().toISOString(),
      source: OZIZ_URL,
      cached: false,
      stale: false,
      cache_age_seconds: 0,
      categories,
      courses: finish(courses),
      note: OZIZ_NOTE,
      error: null,
    },
    error: null,
  };
}

export async function getOzizCatalog(options: { force?: boolean } = {}): Promise<OzizCatalog> {
  const key = "catalog";
  const hit = cache.get(key);
  if (hit && !options.force && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return {
      ...hit.value,
      cached: true,
      stale: false,
      cache_age_seconds: Math.max(0, Math.round((Date.now() - hit.fetchedAt) / 1000)),
      error: null,
    };
  }

  let loaded: { value: OzizCatalog | null; error: string | null };
  try {
    loaded = await loadCatalog();
  } catch (cause) {
    loaded = { value: null, error: describeError(cause) };
  }

  if (loaded.value) {
    cache.set(key, { value: loaded.value, fetchedAt: Date.now() });
    return loaded.value;
  }

  if (hit) {
    return {
      ...hit.value,
      cached: true,
      stale: true,
      cache_age_seconds: Math.max(0, Math.round((Date.now() - hit.fetchedAt) / 1000)),
      error: loaded.error ?? "Не удалось обновить каталог ОЗиЗ",
    };
  }

  return {
    ok: false,
    fetched_at: new Date().toISOString(),
    source: OZIZ_URL,
    cached: false,
    stale: false,
    cache_age_seconds: null,
    categories: [],
    courses: [],
    note: OZIZ_NOTE,
    error: loaded.error ?? "Не удалось загрузить каталог ОЗиЗ",
  };
}
