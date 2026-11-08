/**
 * Парсеры страниц расписаний и документов FESMU (ЗАДАЧА A3: вынесено из
 * монолита fesmu.ts). Чистые функции без сети — вся сеть в _shared/http.
 */
import {
  MAX_CONTEXT_LENGTH,
  attrValue,
  cleanText,
  extractDateText,
  resolveUrl,
} from "./_shared";
import {
  BOILERPLATE_TITLES,
  DISCLAIMER,
  FACULTIES,
  FEED_LABELS,
  FEED_SOURCES,
  KIND_LABELS,
  KIND_ORDER,
  PORTAL,
  SCHEDULE_INDEX_URL,
  SCHEDULE_NOTE,
  SECTION_LABELS,
  findFaculty,
  staticServices,
} from "../portals";
import type {
  DocumentFormat,
  Faculty,
  FacultySchedule,
  FacultySummary,
  Feed,
  FeedItem,
  FeedKind,
  FesmuResponse,
  Overview,
  ScheduleItem,
  ScheduleKind,
  SchedulePage,
  Semester,
  ServiceStatusReport,
  ServiceStatus,
  StudyForm,
  TitleSource,
} from "../types";
function formatFromPath(pathname: string): DocumentFormat | null {
  const match = /\.(pdf|doc|docx|xls|xlsx)$/i.exec(pathname);
  if (!match) return null;
  return match[1].toLowerCase() as DocumentFormat;
}

function resolveDocumentUrl(href: string, baseUrl: string): { url: string; format: DocumentFormat } | null {
  if (/\.tmp(?:$|[?#/])/i.test(href)) return null;
  const resolved = resolveUrl(href, baseUrl);
  if (!resolved) return null;
  let pathname: string;
  try {
    pathname = new URL(resolved).pathname;
  } catch {
    return null;
  }
  const format = formatFromPath(pathname);
  if (!format) return null;
  return { url: resolved, format };
}

export function fileStem(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    let decoded = name;
    try {
      decoded = decodeURIComponent(name);
    } catch {
      decoded = name;
    }
    return decoded.replace(/\.[a-z0-9]{1,5}$/i, "");
  } catch {
    return "";
  }
}

/** Human title from a file name, used only when the page carries no text. */
export function titleFromFilename(url: string): string {
  const stem = fileStem(url)
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = stem
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !/^\d+([.,/]\d+)*$/.test(word));
  const title = words.join(" ").trim();
  return (title || "Документ").slice(0, 160);
}

type RawAnchor = {
  url: string;
  format: DocumentFormat;
  text: string;
  attrTitle: string | null;
  start: number;
  end: number;
};

function anchorAttrTitle(attributes: string, inner: string): string | null {
  for (const name of ["data-title", "title", "alt", "aria-label"]) {
    const value = attrValue(attributes, name);
    if (value && cleanText(value)) return cleanText(value);
  }
  for (const name of ["alt", "title", "data-alt", "aria-label"]) {
    const value = attrValue(inner, name);
    if (value && cleanText(value)) return cleanText(value);
  }
  return null;
}

function scanDocumentAnchors(html: string, baseUrl: string): RawAnchor[] {
  const anchors: RawAnchor[] = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const attributes = match[1] ?? "";
    const inner = match[2] ?? "";
    const href = attrValue(attributes, "href");
    if (!href) continue;
    const resolved = resolveDocumentUrl(href, baseUrl);
    if (!resolved) continue;
    anchors.push({
      url: resolved.url,
      format: resolved.format,
      text: cleanText(inner),
      attrTitle: anchorAttrTitle(attributes, inner),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return anchors;
}

/** True when `base` already contains `fragment` as a whole token sequence. */
function titleCovers(base: string, fragment: string): boolean {
  if (!fragment) return true;
  if (base === fragment || base.endsWith(fragment)) return true;
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(base);
  } catch {
    return base.includes(fragment);
  }
}

/**
 * Joins fragments of the same document (e.g. `<br>`-split debt captions).
 * A tag or whitespace between two anchors is a word boundary; an immediate
 * continuation (`практик`+`е`, `…2026`+`-27 уч.года`) is concatenated as-is.
 */
function joinFragment(base: string, fragment: string, gap: string): string {
  if (!fragment) return base;
  if (!base) return fragment;
  if (titleCovers(base, fragment)) return base;
  const boundary = /[<\s]/.test(gap);
  const continuation = /^[\d\-–—.,)(]/.test(fragment) || (!/\s/.test(fragment) && fragment.length <= 3);
  if (!boundary && continuation) return base + fragment;
  return /[\s(«"'\-–—]$/.test(base) ? base + fragment : `${base} ${fragment}`;
}

function mergeGroupTitle(group: RawAnchor[], html: string): { title: string; source: TitleSource } {
  let title = "";
  let previous: RawAnchor | null = null;
  for (const anchor of group) {
    const candidate = anchor.text || anchor.attrTitle || "";
    if (!candidate) continue;
    if (!title) {
      title = candidate;
      previous = anchor;
      continue;
    }
    const gap = html.slice(previous ? previous.end : anchor.start, anchor.start);
    title = joinFragment(title, candidate, gap);
    previous = anchor;
  }
  return { title: title.slice(0, 240), source: title ? "page" : "filename" };
}

function deriveCourse(title: string, stem: string): { course: string | null; courseNumber: number | null } {
  const fromWord = /(\d{1,2})\s*(?:-?й)?\s*курс/i.exec(title);
  if (fromWord) {
    const value = Number(fromWord[1]);
    if (value >= 1 && value <= 9) return { course: `${value} курс`, courseNumber: value };
  }
  const trimmed = title.trim();
  const fromPrefix = /^(\d{1,2})\s*(?:[.\-_]|\s|$)/.exec(trimmed);
  if (fromPrefix && !/^\d{1,2}\s*поток/i.test(trimmed)) {
    const value = Number(fromPrefix[1]);
    if (value >= 1 && value <= 9) return { course: `${value} курс`, courseNumber: value };
  }
  // V-3: the digit that opens `1_potok_osen.pdf` belongs to the stream, so a
  // stem whose leading digits are followed by поток/potok is never a course.
  const normalizedStem = stem.replace(/[_\-]+/g, " ").trim();
  if (/^\d{1,2}\s*(?:поток|potok)/i.test(normalizedStem)) return { course: null, courseNumber: null };
  const stemPrefix = /^(\d{1,2})(?![0-9])/.exec(normalizedStem);
  if (stemPrefix) {
    const value = Number(stemPrefix[1]);
    if (value >= 1 && value <= 9) return { course: `${value} курс`, courseNumber: value };
  }
  return { course: null, courseNumber: null };
}

/**
 * U2: курс часто живёт только в шапке таблицы (`1 курс … 6 курс`), а в тексте
 * ссылки («Занятия и лекции») цифры нет вообще. Поэтому курс читается из
 * колонки: находим таблицу и строку с якорем, считаем номер ячейки и берём
 * одноимённую ячейку шапки.
 */
export function parseCourseWord(text: string): { course: string; courseNumber: number } | null {
  const match = /(\d{1,2})\s*(?:-?й)?\s*курс/i.exec(text || "");
  if (!match) return null;
  const value = Number(match[1]);
  if (!(value >= 1 && value <= 9)) return null;
  return { course: `${value} курс`, courseNumber: value };
}

export function deriveCourseFromTable(
  html: string,
  index: number,
): { course: string; courseNumber: number } | null {
  if (typeof html !== "string" || index <= 0) return null;
  const tableStart = html.lastIndexOf("<table", index);
  if (tableStart === -1) return null;
  const rowStart = Math.max(html.lastIndexOf("<tr", index), tableStart);
  const rowPrefix = html.slice(rowStart, index);
  // Number of cells *before* the current one, so column 0 is the first <td>.
  const column = Math.max(0, (rowPrefix.match(/<t[hd]\b/gi) || []).length - 1);
  const tableHead = html.slice(tableStart, index);
  // Шапка — первый ряд таблицы; в шаблонах Bitrix она может быть и из <td>.
  const headerMatch = /<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(tableHead);
  if (!headerMatch) return null;
  const cells = headerMatch[1].split(/<t[hd]\b[^>]*>/i).slice(1);
  const header = cells[column];
  if (!header) return null;
  const hit = parseCourseWord(cleanText(header));
  if (!hit) return null;
  return { course: hit.course, courseNumber: hit.courseNumber };
}

/**
 * U1: специальность — это заголовок секции перед таблицей, а не `context`:
 * «30.05.01 Медицинская биохимия» стоит раньше «Осенний семестр», поэтому
 * deriveContext() его теряет.
 */
const PROGRAM_PATTERN = /(\d{2}\.\d{2}\.\d{2})\s+([А-ЯЁA-Zа-яё][А-Яа-яёA-Za-z\s\-()]{2,80})/;

export function deriveProgram(html: string, index: number): string | null {
  if (typeof html !== "string" || index <= 0) return null;
  // Реальный ДВГМУ пишет специальность не заголовком, а абзацем:
  // `<p style="text-align:center"><span><b>30.05.01 Медицинская биохимия</b></span></p>`.
  // Поэтому ищем сам текст кода в разметке, но только в собственном блоке: всё,
  // что было до закрытия предыдущей таблицы, относится к предыдущей специальности.
  const previousTableEnd = html.lastIndexOf("</table>", index);
  const sectionEnd = html.lastIndexOf("</section>", index);
  const floor = Math.max(previousTableEnd, sectionEnd, index - 60_000, 0);
  const prefix = html.slice(floor, index);
  let best: { at: number; text: string } | null = null;
  for (const match of prefix.matchAll(new RegExp(PROGRAM_PATTERN.source, "g"))) {
    const label = `${match[1]} ${match[2]}`.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!label || label.length < 10) continue;
    const at = match.index ?? 0;
    if (!best || at >= best.at) best = { at, text: label };
  }
  return best ? (best as { at: number; text: string }).text : null;
}

/**
 * U3: форма обучения обычно стоит отдельной строкой под ссылкой
 * («(заочная форма)»), а не в её тексте. Берём хвост ячейки до ближайшего
 * переноса/ссылки — так «очная» и «заочная» в одном <td> не путаются.
 */
export function deriveFormFromCell(html: string, index: number): StudyForm | null {
  if (typeof html !== "string" || index <= 0) return null;
  const cellEnd = html.indexOf("</td>", index);
  const nextAnchor = html.indexOf("<a ", index);
  const limit = Math.min(
    cellEnd === -1 ? index + 400 : cellEnd,
    nextAnchor === -1 ? index + 400 : nextAnchor,
    index + 500,
  );
  return deriveForm(cleanText(html.slice(index, limit)));
}

/**
 * U3: форма обучения — из текста ссылки или строки под ней («(заочная форма)»).
 * Возвращается та форма, которая встречается раньше: в одной ячейке могут стоять
 * и очная, и заочная — тогда форма относится к ближайшей строке.
 */
export function deriveForm(haystack: string): StudyForm | null {
  const original = String(haystack || "");
  const hits: { form: StudyForm; at: number }[] = [];
  const scan = (form: StudyForm, pattern: RegExp, source: string, offset = 0) => {
    const match = pattern.exec(source);
    if (match) hits.push({ form, at: offset + match.index });
  };
  scan("очно-заочная", /очно\s*-\s*заочн/i, original);
  // «заочная» и «очная» не должны срабатывать внутри «очно-заочная».
  let rest = original;
  const masked = original.replace(/очно\s*-\s*заочн/gi, (fragment) => " ".repeat(fragment.length));
  if (masked.length === original.length) rest = masked;
  scan("заочная", /заочн/i, rest);
  scan("очная", /очн/i, rest);
  if (hits.length === 0) return null;
  hits.sort((left, right) => left.at - right.at);
  return hits[0].form;
}

function deriveSemester(haystack: string): Semester | null {
  if (/осен|osen|autumn/i.test(haystack)) return "осенний";
  if (/весн|vesna|spring/i.test(haystack)) return "весенний";
  return null;
}

function deriveStream(haystack: string): string | null {
  const before = /(\d{1,2})\s*(?:поток|potok)/i.exec(haystack);
  if (before) return `${Number(before[1])} поток`;
  const after = /(?:поток|potok)\s*(?:№|No?)?\s*(\d{1,2})/i.exec(haystack);
  if (after) return `${Number(after[1])} поток`;
  return null;
}

const KIND_RULES: { kind: ScheduleKind; pattern: RegExp }[] = [
  { kind: "debt", pattern: /ликвидац|задолженност/ },
  { kind: "practice-exams", pattern: /практик/ },
  { kind: "gia", pattern: /гиа|государственн[а-яё]*\s+итогов/ },
  { kind: "diploma", pattern: /диплом/ },
  { kind: "process-graph", pattern: /график\s+учебн/ },
  { kind: "credits", pattern: /зач[её]т/ },
  { kind: "exams", pattern: /экзамен/ },
  { kind: "classes", pattern: /заняти/ },
  { kind: "lectures", pattern: /лекц/ },
];

/** Maps Russian document wording to the frozen kind list (contract §1.4). */
export function classifyKind(label: string): ScheduleKind {
  const text = (label || "").toLowerCase();
  if (!text) return "other";
  for (const rule of KIND_RULES) {
    if (rule.pattern.test(text)) return rule.kind;
  }
  return "other";
}

function deriveKindLabel(kind: ScheduleKind, title: string, source: TitleSource): string {
  if (source === "page" && title) {
    const stripped = cleanText(
      title
        .replace(/\(?\s*\d{1,2}\s*(?:-?й)?\s*курс[а-яё]*\s*\)?/gi, " ")
        .replace(/\(?\s*\d{1,2}\s*поток[^)]*\)?/gi, " ")
        .replace(/\(?\s*(?:поток|potok)\s*(?:№|No?)?\s*\d{1,2}[^)]*\)?/gi, " ")
        .replace(/\(?\s*(?:осенн|весенн)[а-яё]*\s*(?:семестр)?[\s\S]{0,20}?\)?$/gi, " "),
    );
    if (stripped) return stripped.slice(0, 120);
  }
  return KIND_LABELS[kind];
}

/**
 * `context` = the schedule table/row the document belongs to, e.g.
 * «Осенний семестр 2026-2027», otherwise the nearest heading text.
 */
function deriveContext(html: string, index: number): string | null {
  const prefix = html.slice(Math.max(0, index - 40_000), index);
  let best: { at: number; text: string } | null = null;
  const consider = (at: number, raw: string) => {
    let value = raw;
    const trailingTag = value.lastIndexOf("<");
    if (trailingTag > 0) value = value.slice(0, trailingTag);
    const text = cleanText(value).slice(0, MAX_CONTEXT_LENGTH);
    if (!text) return;
    if (!best || at >= best.at) best = { at, text };
  };
  for (const match of prefix.matchAll(/(?:Осенний|Весенний)\s+семестр[\s\S]{0,80}/gi)) {
    consider(match.index ?? 0, match[0]);
  }
  for (const match of prefix.matchAll(/(?:Расписание\s+)?[Лл]иквидаци[а-яё]*/g)) {
    consider(match.index ?? 0, "Ликвидация академической задолженности");
  }
  for (const match of prefix.matchAll(/<h[1-4][^>]*>([\s\S]{0,160}?)<\/h[1-4]>/gi)) {
    consider(match.index ?? 0, match[1]);
  }
  return best ? (best as { at: number; text: string }).text : null;
}

function sortScheduleItems(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort((left, right) => {
    const a = left.course_number;
    const b = right.course_number;
    if (a !== b) {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    }
    const kindA = KIND_ORDER.indexOf(left.kind);
    const kindB = KIND_ORDER.indexOf(right.kind);
    if (kindA !== kindB) return kindA - kindB;
    return left.title.localeCompare(right.title, "ru");
  });
}

/**
 * V-4: title source for an anchor that carries no text and no title attribute —
 * the nearest preceding heading (`h1`–`h4`) or table caption inside the same
 * section, so the parser never falls straight through to a raw file name.
 */
function deriveCaptionTitle(html: string, index: number): string | null {
  const sectionEnd = html.lastIndexOf("</section>", index);
  const floor = Math.max(sectionEnd === -1 ? 0 : sectionEnd, index - 40_000, 0);
  const prefix = html.slice(floor, index);
  let best: { at: number; text: string } | null = null;
  const consider = (at: number, raw: string) => {
    const text = cleanText(raw).slice(0, MAX_CONTEXT_LENGTH);
    if (!text) return;
    if (!best || at >= best.at) best = { at, text };
  };
  for (const match of prefix.matchAll(/<h[1-4][^>]*>([\s\S]{0,200}?)<\/h[1-4]>/gi)) {
    consider(match.index ?? 0, match[1]);
  }
  for (const match of prefix.matchAll(/<(?:caption|th)\b[^>]*>([\s\S]{0,200}?)<\/(?:caption|th)>/gi)) {
    consider(match.index ?? 0, match[1]);
  }
  for (const match of prefix.matchAll(/<td\b[^>]*>([\s\S]{0,200}?)<\/td>/gi)) {
    const text = cleanText(match[1]);
    // A short row/column caption qualifies; a cell full of other links does not.
    if (text && text.length <= 60) consider(match.index ?? 0, text);
  }
  return best ? (best as { at: number; text: string }).text : null;
}

function buildScheduleItem(
  url: string,
  group: RawAnchor[],
  html: string,
  options: { document?: boolean },
): ScheduleItem | null {
  const merged = mergeGroupTitle(group, html);
  const stem = fileStem(url);
  const fallback = titleFromFilename(url);
  const first = group[0];
  const caption = merged.title || !first ? "" : deriveCaptionTitle(html, first.start);
  const title = merged.title || caption || fallback;
  const titleSource: TitleSource = merged.title || caption ? "page" : "filename";
  if (BOILERPLATE_TITLES.some((pattern) => pattern.test(title))) return null;
  if (BOILERPLATE_TITLES.some((pattern) => pattern.test(`${stem} ${fallback}`))) return null;

  // Course from the name wins; the table column is the fallback (U2).
  const namedCourse = deriveCourse(title, stem);
  const course = namedCourse.courseNumber === null && first ? deriveCourseFromTable(html, first.start) : null;
  const resolvedCourse = namedCourse.courseNumber !== null ? namedCourse : course ?? namedCourse;
  // Separators are word boundaries here too, so `2_potok_vesna.pdf` reads as
  // «2 поток, весенний» instead of losing the stream.
  const haystack = `${title} ${stem.replace(/[_\-]+/g, " ")}`;
  const kind = classifyKind(title);
  const item: ScheduleItem = {
    title,
    title_source: titleSource,
    url,
    program: first ? deriveProgram(html, first.start) : null,
    course: resolvedCourse.course,
    course_number: resolvedCourse.courseNumber,
    semester: deriveSemester(haystack),
    stream: deriveStream(haystack),
    form: deriveForm(haystack) ?? (first ? deriveFormFromCell(html, first.end) : null),
    kind,
    kind_label: deriveKindLabel(kind, title, titleSource),
    format: first ? first.format : "pdf",
    context: first ? deriveContext(html, first.start) : null,
    is_debt: kind === "debt",
  };
  if (options.document) item.type = "document";
  return item;
}

/** Parses every PDF/DOC/XLS link of a page (faculty or schedule index). */
export function parseScheduleDocuments(
  html: string,
  pageUrl: string,
  options: { document?: boolean } = {},
): ScheduleItem[] {
  if (typeof html !== "string" || html.length === 0) return [];
  const anchors = scanDocumentAnchors(html, pageUrl);
  if (anchors.length === 0) return [];

  const groups = new Map<string, RawAnchor[]>();
  const order: string[] = [];
  for (const anchor of anchors) {
    const existing = groups.get(anchor.url);
    if (existing) {
      existing.push(anchor);
    } else {
      groups.set(anchor.url, [anchor]);
      order.push(anchor.url);
    }
  }

  const items: ScheduleItem[] = [];
  for (const url of order) {
    const group = groups.get(url);
    if (!group) continue;
    const item = buildScheduleItem(url, group, html, options);
    if (item) items.push(item);
  }
  return sortScheduleItems(items);
}

