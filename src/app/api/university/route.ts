import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const FESMU_ORIGIN = "https://www.fesmu.ru";
const SCHEDULE_INDEX = `${FESMU_ORIGIN}/ucheba/raspisanie/`;
const FEED_SOURCES = {
  news: { url: `${FESMU_ORIGIN}/press-center/news/`, label: "Новости ДВГМУ" },
  announcements: { url: `${FESMU_ORIGIN}/press-center/announce/`, label: "Объявления ДВГМУ" },
  events: { url: `${FESMU_ORIGIN}/press-center/events/`, label: "Анонсы ДВГМУ" },
} as const;

type FeedKind = keyof typeof FEED_SOURCES;

type FeedItem = {
  title: string;
  url: string;
  date: string | null;
  source: string;
};

type Faculty = {
  id: string;
  title: string;
  program: string | null;
  code: string | null;
  url: string;
};

type ScheduleItem = {
  title: string;
  url: string;
  course: string | null;
  semester: string | null;
  kind: string;
  context: string | null;
};

const FACULTIES: Faculty[] = [
  {
    id: "lechebnyy",
    title: "Лечебный факультет",
    program: "Лечебное дело",
    code: "31.05.01",
    url: `${FESMU_ORIGIN}/ucheba/raspisanie/lechebnyy-fakultet-31-05-01-lechebnoe-delo/`,
  },
  {
    id: "pediatricheskiy",
    title: "Педиатрический факультет",
    program: "Педиатрия",
    code: "31.05.02",
    url: `${FESMU_ORIGIN}/ucheba/raspisanie/pediatricheskiy-fakultet-31-05-02-pediatriya/`,
  },
  {
    id: "stomatologicheskiy",
    title: "Стоматологический факультет",
    program: "Стоматология",
    code: "31.05.03",
    url: `${FESMU_ORIGIN}/ucheba/raspisanie/stomatologicheskiy-fakultet-31-05-03-stomatologiya/`,
  },
  {
    id: "farmatsii",
    title: "Факультет фармации и биомедицины",
    program: "Фармация",
    code: "33.05.01",
    url: `${FESMU_ORIGIN}/ucheba/raspisanie/fakultet-farmatsii-i-biomeditsiny-33-05-01-farmatsiya/`,
  },
  {
    id: "mediko-gumanitarnyy",
    title: "Медико-гуманитарный факультет",
    program: null,
    code: null,
    url: `${FESMU_ORIGIN}/ucheba/raspisanie/mediko-gumanitarnyy-fakultet/`,
  },
  {
    id: "kolledzh",
    title: "Медико-фармацевтический колледж",
    program: null,
    code: null,
    url: `${FESMU_ORIGIN}/ucheba/raspisanie/mediko-farmatsevticheskiy-kolledzh/`,
  },
];

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    laquo: "«",
    raquo: "»",
    mdash: "—",
    ndash: "–",
    hellip: "…",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => named[String(name).toLowerCase()] ?? match);
}

function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(href: string): string | null {
  try {
    const url = new URL(decodeEntities(href.trim()), FESMU_ORIGIN);
    if (url.protocol !== "https:" || !url.hostname.endsWith("fesmu.ru")) return null;
    if (url.hostname === "192.168.2.37" || url.pathname.includes("192.168.2.37")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Mozilla/5.0 (compatible; MEDBIOHIM University Hub/1.0; +https://medbiohim.vercel.app/university)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function cached<T>(key: string, loader: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { value: hit.value as T, cached: true };
  }
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return { value, cached: false };
}

function nearestCalendarDate(html: string, anchorIndex: number): string | null {
  const calendarPattern = /fa-calendar-alt[\s\S]{0,180}?(\d{2}\.\d{2}\.\d{4})/gi;
  let best: { date: string; distance: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = calendarPattern.exec(html))) {
    const distance = Math.abs(match.index - anchorIndex);
    if (!best || distance < best.distance) best = { date: match[1], distance };
  }
  return best?.date ?? null;
}

function parseFeed(html: string, kind: FeedKind): FeedItem[] {
  const source = FEED_SOURCES[kind];
  const sectionPattern = new RegExp(`^/press-center/${kind === "announcements" ? "announce" : kind}/[^/?#]+/[^/?#]+/?$`);
  const anchorPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) && items.length < 14) {
    const href = decodeEntities(match[1]);
    let pathname = "";
    try {
      pathname = new URL(href, FESMU_ORIGIN).pathname;
    } catch {
      continue;
    }
    if (!sectionPattern.test(pathname)) continue;
    const url = absoluteUrl(href);
    const title = stripHtml(match[2]);
    if (!url || title.length < 5 || seen.has(url)) continue;
    seen.add(url);
    items.push({
      title,
      url,
      date: nearestCalendarDate(html, match.index),
      source: source.url,
    });
  }
  return items;
}

function parseFacultyTitle(html: string, fallback: string): string {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1 ? stripHtml(h1[1]) : "";
  return title || fallback;
}

function inferCourse(fileName: string): string | null {
  const base = fileName.split("/").pop()?.replace(/\.pdf$/i, "") ?? "";
  const match = base.match(/(?:^|[_.-])([1-6])(?=[_.-]|$)/);
  return match ? `${match[1]} курс` : null;
}

function inferSemester(value: string): string | null {
  const text = value.toLowerCase();
  if (/osen|осен/.test(text)) return "Осенний семестр";
  if (/vesn|весн/.test(text)) return "Весенний семестр";
  return null;
}

function inferKind(value: string): string {
  const text = value.toLowerCase();
  if (/likvid|ликвидац/.test(text)) return "Ликвидация задолженности";
  if (/gia|гиа|ekz|экзам|exam/.test(text)) return "Экзамены и ГИА";
  if (/lek|лекц/.test(text)) return "Лекции";
  if (/grafik|график/.test(text)) return "График";
  if (/zanjat|занят/.test(text)) return "Занятия";
  return "Материалы";
}

function cleanScheduleTitle(title: string, fallback: string, context: { course: string | null; semester: string | null }): string {
  let result = title.replace(/\s+/g, " ").trim();
  if (!result) result = fallback;
  if (/^занятия и лекции/i.test(result)) result = result.replace(/^занятия и лекции/i, "Занятия и лекции");
  if (/^ликвидация академической$/i.test(result)) result = "Ликвидация академической задолженности";
  if (result.length < 6 && context.course) result = `${result || "Расписание"} · ${context.course}`;
  return result;
}

function parseScheduleContexts(html: string): Map<string, { course: string | null; semester: string | null; context: string | null }> {
  const result = new Map<string, { course: string | null; semester: string | null; context: string | null }>();
  const tablePattern = /<table\b[\s\S]*?<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tablePattern.exec(html))) {
    const rows = [...tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1])
    );
    if (rows.length < 2) continue;
    const headers = rows[0].map((cell) => stripHtml(cell));
    if (!headers.some((header) => /курс/i.test(header))) continue;

    for (const row of rows.slice(1)) {
      if (!row.length) continue;
      const semesterText = stripHtml(row[0]);
      const semester = inferSemester(semesterText);
      for (let i = 1; i < row.length; i += 1) {
        const header = headers[i] || "";
        const course = /курс/i.test(header) ? header.replace(/\s+/g, " ").trim() : null;
        for (const link of row[i].matchAll(/href="([^"]+\.pdf)"/gi)) {
          const url = absoluteUrl(link[1]);
          if (!url) continue;
          const previous = result.get(url);
          result.set(url, {
            course: course || previous?.course || null,
            semester: semester || previous?.semester || null,
            context: semesterText || previous?.context || null,
          });
        }
      }
    }
  }
  return result;
}

function parseSchedule(html: string): ScheduleItem[] {
  const contexts = parseScheduleContexts(html);
  const anchorPattern = /<a\b[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  const items = new Map<string, ScheduleItem>();
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const url = absoluteUrl(match[1]);
    if (!url || !url.includes("/ucheba/raspisanie/")) continue;
    const anchorTitle = stripHtml(match[2]);
    const context = contexts.get(url);
    const fileName = new URL(url).pathname.split("/").pop() || "Расписание";
    const inferredCourse = inferCourse(fileName);
    const course = context?.course || inferredCourse;
    const semester = context?.semester || inferSemester(fileName);
    const kind = inferKind(`${anchorTitle} ${fileName}`);
    const fallback = fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
    const title = cleanScheduleTitle(anchorTitle, fallback, { course, semester });
    const previous = items.get(url);
    if (previous) {
      if (title.length > previous.title.length) previous.title = title;
      continue;
    }
    items.set(url, { title, url, course, semester, kind, context: context?.context ?? null });
  }

  return [...items.values()]
    .sort((a, b) => {
      const courseA = Number.parseInt(a.course || "99", 10);
      const courseB = Number.parseInt(b.course || "99", 10);
      if (courseA !== courseB) return courseA - courseB;
      const semesterA = a.semester?.includes("Осен") ? 0 : a.semester?.includes("Весен") ? 1 : 2;
      const semesterB = b.semester?.includes("Осен") ? 0 : b.semester?.includes("Весен") ? 1 : 2;
      if (semesterA !== semesterB) return semesterA - semesterB;
      return a.title.localeCompare(b.title, "ru");
    })
    .slice(0, 240);
}

async function loadOverview() {
  const entries = await Promise.allSettled([
    cached("fesmu:news", () => fetchText(FEED_SOURCES.news.url).then((html) => parseFeed(html, "news"))),
    cached("fesmu:announcements", () => fetchText(FEED_SOURCES.announcements.url).then((html) => parseFeed(html, "announcements"))),
    cached("fesmu:events", () => fetchText(FEED_SOURCES.events.url).then((html) => parseFeed(html, "events"))),
  ]);

  const feeds: Record<string, { source: string; label: string; items: FeedItem[]; error: string | null; cached: boolean }> = {};
  const kinds: FeedKind[] = ["news", "announcements", "events"];
  kinds.forEach((kind, index) => {
    const entry = entries[index];
    if (entry.status === "fulfilled") {
      feeds[kind] = {
        source: FEED_SOURCES[kind].url,
        label: FEED_SOURCES[kind].label,
        items: entry.value.value,
        error: null,
        cached: entry.value.cached,
      };
    } else {
      feeds[kind] = {
        source: FEED_SOURCES[kind].url,
        label: FEED_SOURCES[kind].label,
        items: [],
        error: entry.reason instanceof Error ? entry.reason.message : "Источник временно недоступен",
        cached: false,
      };
    }
  });

  return {
    fetched_at: new Date().toISOString(),
    portal: {
      name: "Дальневосточный государственный медицинский университет",
      url: FESMU_ORIGIN,
      eios_url: "https://eios.fesmu.ru/WebApp/#/",
      testing_url: "http://test.fesmu.ru:8080/",
      library_url: "https://elib.fesmu.ru/",
    },
    disclaimer:
      "MEDBIOHIM не является официальным порталом ДВГМУ. Данные ФЕСМУ показаны по публичным страницам с указанием источника и времени получения. Первоисточник всегда открывается по ссылке.",
    schedule: {
      index_url: SCHEDULE_INDEX,
      faculties: FACULTIES,
      note: "Расписание публикуется на сайте ДВГМУ в PDF. Ниже — ссылки на официальные файлы; локальная копия не создаётся.",
    },
    feeds,
  };
}

export async function GET(request: NextRequest) {
  const facultyId = request.nextUrl.searchParams.get("faculty");
  try {
    if (facultyId) {
      const faculty = FACULTIES.find((item) => item.id === facultyId);
      if (!faculty) {
        return NextResponse.json({ ok: false, error: "Неизвестный факультет" }, { status: 404 });
      }
      const result = await cached(`fesmu:faculty:${faculty.id}`, async () => {
        const html = await fetchText(faculty.url);
        return {
          faculty: { ...faculty, title: parseFacultyTitle(html, faculty.title) },
          fetched_at: new Date().toISOString(),
          source: faculty.url,
          items: parseSchedule(html),
        };
      });
      return NextResponse.json(
        { ok: true, ...result.value, cached: result.cached },
        { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } }
      );
    }

    const overview = await cached("fesmu:overview", loadOverview);
    const response = {
      ok: true,
      ...overview.value,
      cached: overview.cached,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Не удалось получить данные ФЕСМУ",
        source: FESMU_ORIGIN,
      },
      { status: 502 }
    );
  }
}
