/**
 * FESMU (ДВГМУ) public-pages adapter.
 *
 * LIVE SMOKE — 2026-10-25, `node test/fixtures/fesmu/_live-smoke.mjs`
 * (Node 26.8.1, Asia/Vladivostok):
 *   - plain `fetch("https://www.fesmu.ru/")` → UNABLE_TO_VERIFY_LEAF_SIGNATURE;
 *   - overview 638 ms → news 15, announcements 10, events 2, index documents 6;
 *   - faculty "lechebnyy" 601 ms → 47 documents, 0 internal 192.168.* links;
 *   - service probes 6018 ms → portal/eios/schedule/testing/news answered
 *     HTTP 200, elib.fesmu.ru timed out after 6 s (reachable=false, no crash);
 *   - FESMU_STRICT_TLS=1 → «Ошибка TLS-сертификата:
 *     UNABLE_TO_VERIFY_LEAF_SIGNATURE» while the cached feed was still served
 *     as stale — the adapter degrades with an error string and never throws.
 *   Full transcript: docs/UNIVERSITY-ADAPTER.md.
 *
 * Security/ТLS rationale (contract §1.1): the university site does not send its
 * intermediate CA, so `https://www.fesmu.ru/` fails Node verification with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. We only read public HTML pages, send no
 * cookies, no Authorization header and no credentials, and the relaxed agent is
 * used *only* for `*.fesmu.ru`. `process.env.NODE_TLS_REJECT_UNAUTHORIZED` is
 * never touched.
 *
 * Everything below is defensive: `fesmuFetch` never throws, parsers return
 * `[]`/error strings, and the route builders keep serving the last good value
 * when a refresh fails.
 */
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
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
} from "./portals";
import type {
  DocumentFormat,
  Faculty,
  FacultySchedule,
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
  TitleSource,
} from "./types";

/* ------------------------------------------------------------------ *
 * Tunables (contract §1.1, §1.2, §1.5)
 * ------------------------------------------------------------------ */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DEFAULT_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const REQUEST_TIMEOUT_MS = 12_000;
const TOTAL_BUDGET_MS = 20_000;
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const RETRY_BACKOFF_MS = 250;
const MAX_REDIRECTS = 3;
const PROBE_TIMEOUT_MS = 6_000;
const PROBE_BUDGET_MS = 15_000;
const PROBE_CONCURRENCY = 4;
const CACHE_TTL_MS = 30 * 60 * 1000;
const STATUS_TTL_MS = 10 * 60 * 1000;
const MAX_FEED_ITEMS = 30;
const MAX_CONTEXT_LENGTH = 120;
const PARSE_ERROR = "Разметка источника изменилась";
const FESMU_HOST = /(^|\.)fesmu\.ru$/i;

export type FesmuMethod = "GET" | "HEAD";

export type FesmuRequestInit = {
  method?: FesmuMethod;
  timeoutMs?: number;
  maxAttempts?: number;
  totalBudgetMs?: number;
  accept?: string;
};

export type FesmuAttemptInit = { method: FesmuMethod; timeoutMs: number; accept: string };
export type FesmuAttempt = (url: string, init: FesmuAttemptInit) => Promise<FesmuResponse>;

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

let relaxedAgent: https.Agent | null = null;
let strictAgent: https.Agent | null = null;

/**
 * TLS agents are chosen per request. Plain http (test.fesmu.ru:8080) needs no
 * agent at all. Non-fesmu hosts can never reach this module because guardUrl()
 * rejects them before any socket is opened.
 */
function agentFor(url: URL): https.Agent | undefined {
  if (url.protocol !== "https:") return undefined;
  if (process.env.FESMU_STRICT_TLS === "1") {
    if (!strictAgent) strictAgent = new https.Agent({ keepAlive: true, minVersion: "TLSv1.2" });
    return strictAgent;
  }
  if (!relaxedAgent) {
    relaxedAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false, minVersion: "TLSv1.2" });
  }
  return relaxedAgent;
}

function guardUrl(input: string): { url: URL | null; error: string | null } {
  if (typeof input !== "string" || !input.trim()) return { url: null, error: "Пустой URL" };
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { url: null, error: "Некорректный URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { url: null, error: `Неподдерживаемая схема: ${url.protocol}` };
  }
  if (!FESMU_HOST.test(url.hostname)) {
    return { url: null, error: "Разрешены только домены fesmu.ru" };
  }
  return { url, error: null };
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code) {
      const text = code.toUpperCase();
      if (text.includes("UNABLE_TO_VERIFY") || text.includes("SELF_SIGNED") || text.includes("CERT")) {
        return `Ошибка TLS-сертификата: ${code}`;
      }
      if (code === "ENOTFOUND") return "Хост не найден (DNS)";
      if (code === "ECONNREFUSED") return "Соединение отклонено";
      if (code === "ECONNRESET") return "Соединение сброшено";
      if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return `Таймаут ${Math.round(REQUEST_TIMEOUT_MS / 1000)} с`;
      return `${code}: ${cause.message}`.slice(0, 200);
    }
    return cause.message.slice(0, 200) || "Неизвестная ошибка сети";
  }
  return String(cause ?? "Неизвестная ошибка сети").slice(0, 200);
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function decodeBody(buffer: Buffer, encoding: string): string {
  const value = encoding.toLowerCase();
  try {
    if (value.includes("br")) return zlib.brotliDecompressSync(buffer).toString("utf8");
    if (value.includes("gzip")) return zlib.gunzipSync(buffer).toString("utf8");
    if (value.includes("deflate")) return zlib.inflateSync(buffer).toString("utf8");
  } catch {
    // Wrong content-encoding on a broken response: fall back to the raw bytes.
  }
  return buffer.toString("utf8");
}

type RawAttemptResult = { status: number; location: string | null; body: string; error: string | null };

function rawRequest(url: URL, init: FesmuAttemptInit): Promise<RawAttemptResult> {
  return new Promise((resolve) => {
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    let settled = false;
    const settle = (result: RawAttemptResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let request: http.ClientRequest;
    try {
      request = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: init.method,
          agent: agentFor(url),
          timeout: init.timeoutMs,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: init.accept,
            "Accept-Language": "ru,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "close",
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = headerValue(response.headers.location) || null;
          if (init.method === "HEAD" || status === 204 || status === 304) {
            response.resume();
            response.on("end", () => settle({ status, location, body: "", error: null }));
            return;
          }
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer | string) => {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          });
          response.on("end", () =>
            settle({
              status,
              location,
              body: decodeBody(Buffer.concat(chunks), headerValue(response.headers["content-encoding"])),
              error: null,
            }),
          );
          response.on("error", (cause: Error) => settle({ status, location, body: "", error: describeError(cause) }));
        },
      );
    } catch (cause) {
      settle({ status: 0, location: null, body: "", error: describeError(cause) });
      return;
    }
    request.on("timeout", () => {
      request.destroy();
      settle({
        status: 0,
        location: null,
        body: "",
        error: `Таймаут ${Math.max(1, Math.round(init.timeoutMs / 1000))} с`,
      });
    });
    request.on("error", (cause: Error) => settle({ status: 0, location: null, body: "", error: describeError(cause) }));
    request.end();
  });
}

/** One logical request, following up to MAX_REDIRECTS same-domain redirects. */
async function defaultAttempt(input: string, init: FesmuAttemptInit): Promise<FesmuResponse> {
  let current = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const guarded = guardUrl(current);
    if (!guarded.url) return { ok: false, status: 0, body: "", error: guarded.error };
    const result = await rawRequest(guarded.url, init);
    if (result.error) return { ok: false, status: result.status, body: result.body, error: result.error };
    if (result.status >= 300 && result.status < 400 && result.location) {
      let next: URL;
      try {
        next = new URL(result.location, guarded.url);
      } catch {
        return { ok: false, status: result.status, body: "", error: "Некорректный редирект" };
      }
      if (!FESMU_HOST.test(next.hostname)) {
        return { ok: false, status: result.status, body: "", error: "Редирект на внешний домен отклонён" };
      }
      current = next.toString();
      continue;
    }
    const ok = result.status >= 200 && result.status < 300;
    return {
      ok,
      status: result.status,
      body: result.body,
      error: ok ? null : `HTTP ${result.status || 0}`,
    };
  }
  return { ok: false, status: 0, body: "", error: "Слишком много редиректов" };
}

let attemptOverride: FesmuAttempt | null = null;

/**
 * Test seam: route every attempt through a fixture-backed transport.
 * Pass `null` to restore the real node:https/node:http transport.
 */
export function setFesmuTransportForTests(transport: FesmuAttempt | null): void {
  attemptOverride = transport;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Public-pages GET/HEAD with retries. Never throws; returns
 * `{ ok, status, body, error }` with `error` set for any non-2xx or network
 * failure. Only `*.fesmu.ru` URLs are accepted.
 */
export async function fesmuFetch(input: string, init: FesmuRequestInit = {}): Promise<FesmuResponse> {
  const guarded = guardUrl(input);
  if (!guarded.url) return { ok: false, status: 0, body: "", error: guarded.error };

  const method: FesmuMethod = init.method === "HEAD" ? "HEAD" : "GET";
  const perTry = clamp(init.timeoutMs ?? REQUEST_TIMEOUT_MS, 500, TOTAL_BUDGET_MS);
  const attempts = clamp(init.maxAttempts ?? MAX_ATTEMPTS, 1, 5);
  const deadline = Date.now() + (init.totalBudgetMs ?? TOTAL_BUDGET_MS);
  const accept = init.accept ?? DEFAULT_ACCEPT;
  const attempt = attemptOverride ?? defaultAttempt;

  let last: FesmuResponse = { ok: false, status: 0, body: "", error: "Запрос не выполнен" };
  for (let index = 1; index <= attempts; index += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      last = { ok: false, status: last.status, body: "", error: last.error ?? "Бюджет запроса исчерпан" };
      break;
    }
    const timeoutMs = Math.min(perTry, remaining);
    let result: FesmuResponse;
    try {
      result = await attempt(guarded.url.toString(), { method, timeoutMs, accept });
    } catch (cause) {
      result = { ok: false, status: 0, body: "", error: describeError(cause) };
    }
    last = result;
    if (result.ok) return result;
    const retriable = result.status === 0 || result.status >= 500;
    if (!retriable || index === attempts) break;
    const wait = Math.min(RETRY_BACKOFF_MS * index, Math.max(0, deadline - Date.now()));
    if (wait > 0) await delay(wait);
  }
  return last;
}

/* ------------------------------------------------------------------ *
 * Text and URL helpers
 * ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  deg: "°",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  "#039": "'",
  "#39": "'",
  "#8217": "’",
  "#8211": "–",
  "#8212": "—",
  "#160": " ",
};

/** Decodes the HTML entities that occur on FESMU pages (incl. numeric refs). */
export function decodeEntities(input: string): string {
  if (typeof input !== "string" || input.indexOf("&") === -1) return typeof input === "string" ? input : "";
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, code: string) => {
    if (code.charAt(0) === "#") {
      const hex = code.charAt(1) === "x" || code.charAt(1) === "X";
      const digits = code.slice(hex ? 2 : 1);
      const value = Number.parseInt(digits, hex ? 16 : 10);
      if (Number.isFinite(value) && value > 0 && value <= 0x10ffff) {
        try {
          return String.fromCodePoint(value);
        } catch {
          return match;
        }
      }
      return match;
    }
    const known = ENTITIES[code.toLowerCase()];
    return known === undefined ? match : known;
  });
}

/**
 * Strips tags, decodes entities, collapses whitespace, trims surrounding «·»
 * bullets and trailing dashes (contract §1.3). Leading dashes are kept because
 * captions such as «-27 уч.года» are continuation fragments of a title.
 */
export function cleanText(input: string): string {
  if (typeof input !== "string" || !input) return "";
  const withoutTags = input.replace(/<[^>]*>/g, " ");
  const decoded = decodeEntities(withoutTags);
  return decoded
    .replace(/\s+/g, " ")
    .replace(/^[\s·•*|]+/, "")
    .replace(/[\s·•|]+$/, "")
    .replace(/[\s·•*\-–—|]+$/, "")
    .trim();
}

function isPrivateHost(hostname: string): boolean {
  const host = (hostname || "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^127\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

/** `new URL()`-based join (contract §0.1 bug 4); null when unusable. */
export function resolveUrl(href: string, baseUrl: string): string | null {
  if (typeof href !== "string") return null;
  const raw = decodeEntities(href).trim();
  if (!raw || raw.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(raw)) return null;
  let resolved: URL;
  try {
    resolved = new URL(raw, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  if (isPrivateHost(resolved.hostname)) return null;
  resolved.hash = "";
  return resolved.toString();
}

function attrValue(attributes: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = pattern.exec(attributes);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? match[3];
  return value === undefined ? null : value;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Real calendar length of a month (Feb = 29 in leap years). */
function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1] ?? 0;
}

/**
 * `dd.mm.yyyy` → `{ display, iso }`; null for malformed *and* impossible
 * calendar dates (31.02.2026, 29.02.2025 …), so `date_iso` can never leak a
 * non-existent date into `published_at` (V-1 / §2 invariant). Pure arithmetic:
 * no `Date`, so a mocked clock cannot affect it.
 */
export function extractDateText(source: string): { display: string; iso: string } | null {
  if (typeof source !== "string") return null;
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(source);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return { display: `${pad(day)}.${pad(month)}.${year}`, iso: `${year}-${pad(month)}-${pad(day)}` };
}

/* ------------------------------------------------------------------ *
 * Cache (contract §1.2)
 * ------------------------------------------------------------------ */

type CacheEntry<T> = { value: T; fetchedAt: number; ttlMs: number };

const cache = new Map<string, CacheEntry<unknown>>();

/** Drops every cached payload (used by tests and after a manual refresh). */
export function clearFesmuCache(): void {
  cache.clear();
}

export type CachedResult<T> = {
  value: T | null;
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
  cache_age_seconds: number | null;
  error: string | null;
};

function ageSeconds(from: number): number {
  return Math.max(0, Math.round((Date.now() - from) / 1000));
}

/**
 * 30-minute TTL cache with stale-serving: a failed refresh returns the last good
 * value with `cached: true, stale: true` plus the failure in `error`.
 */
async function readThrough<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<{ value: T | null; error: string | null }>,
  force: boolean,
): Promise<CachedResult<T>> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && !force && Date.now() - hit.fetchedAt < hit.ttlMs) {
    return {
      value: hit.value,
      cached: true,
      stale: false,
      fetched_at: new Date(hit.fetchedAt).toISOString(),
      cache_age_seconds: ageSeconds(hit.fetchedAt),
      error: null,
    };
  }

  let loaded: { value: T | null; error: string | null };
  try {
    loaded = await load();
  } catch (cause) {
    loaded = { value: null, error: describeError(cause) };
  }

  if (loaded.value !== null && !loaded.error) {
    const fetchedAt = Date.now();
    cache.set(key, { value: loaded.value, fetchedAt, ttlMs });
    return {
      value: loaded.value,
      cached: false,
      stale: false,
      fetched_at: new Date(fetchedAt).toISOString(),
      cache_age_seconds: 0,
      error: null,
    };
  }

  if (hit) {
    return {
      value: hit.value,
      cached: true,
      stale: true,
      fetched_at: new Date(hit.fetchedAt).toISOString(),
      cache_age_seconds: ageSeconds(hit.fetchedAt),
      error: loaded.error ?? "Не удалось обновить данные источника",
    };
  }

  return {
    value: null,
    cached: false,
    stale: false,
    fetched_at: null,
    cache_age_seconds: null,
    error: loaded.error ?? "Не удалось загрузить данные источника",
  };
}

/* ------------------------------------------------------------------ *
 * Press-center feeds (contract §1.3)
 * ------------------------------------------------------------------ */

/**
 * Path segment of the parsed feed (contract §1.3): a news page must never
 * accept `/press-center/events/...`, so the section is part of the pattern.
 */
const FEED_SECTION_PATH: Record<FeedKind, string> = {
  news: "news",
  announcements: "announce",
  events: "events",
};

function feedItemPath(kind: FeedKind): RegExp {
  return new RegExp(`^/press-center/${FEED_SECTION_PATH[kind]}/([^/]+)/([^/?#]+)/?$`, "i");
}

/** Splits a list page into Bitrix cards; the last card stops at `</section>`. */
export function splitFeedBlocks(html: string): string[] {
  const marker = "iblock-list-item-wrap";
  const blocks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = html.indexOf(marker, cursor);
    if (start === -1) break;
    let end = html.indexOf(marker, start + marker.length);
    if (end === -1) end = html.length;
    const sectionEnd = html.indexOf("</section>", start);
    if (sectionEnd !== -1 && sectionEnd < end) end = sectionEnd;
    blocks.push(html.slice(start, end));
    cursor = start + marker.length;
  }
  return blocks;
}

function feedTitle(block: string): string {
  const areaLabel = block.match(/area-label\s*=\s*"([^"]*)"/i);
  const fromArea = areaLabel ? cleanText(areaLabel[1]) : "";
  if (fromArea) return fromArea;
  for (const name of ["data-title", "title", "alt"]) {
    const value = attrValue(block, name);
    const text = value ? cleanText(value) : "";
    if (text) return text;
  }
  const anchorPattern = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(block)) !== null) {
    const text = cleanText(match[1]);
    if (text) return text;
  }
  return "";
}

/**
 * First href of the card that belongs to the feed being parsed (V-2):
 * returns the absolute URL plus the mapped section label, or null.
 */
function feedItemUrl(block: string, sourceUrl: string, kind: FeedKind): { url: string; section: string | null } | null {
  const pattern = feedItemPath(kind);
  const hrefPattern = /href\s*=\s*"([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(block)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("#")) continue;
    let resolved: URL;
    try {
      resolved = new URL(decodeEntities(href), sourceUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    const sectionMatch = pattern.exec(resolved.pathname);
    if (!sectionMatch) continue;
    resolved.hash = "";
    const slug = sectionMatch[1];
    return { url: resolved.toString(), section: SECTION_LABELS[slug] ?? slug };
  }
  return null;
}

/** Parses one press-center list page; never throws. */
export function parseFeedItems(html: string, kind: FeedKind, sourceUrl: string): FeedItem[] {
  if (typeof html !== "string" || html.length === 0) return [];
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  for (const block of splitFeedBlocks(html)) {
    const title = feedTitle(block);
    if (!title) continue;
    const target = feedItemUrl(block, sourceUrl, kind);
    if (!target || seen.has(target.url)) continue;
    seen.add(target.url);
    const date = extractDateText(block);
    items.push({
      title,
      url: target.url,
      date: date ? date.display : null,
      date_iso: date ? date.iso : null,
      section: target.section,
      source: sourceUrl,
      kind,
    });
    if (items.length >= MAX_FEED_ITEMS) break;
  }
  return items;
}

export async function fetchFeed(kind: FeedKind, options: { force?: boolean } = {}): Promise<Feed> {
  const source = FEED_SOURCES[kind];
  const label = FEED_LABELS[kind];
  const result = await readThrough<FeedItem[]>(
    `feed:${kind}`,
    CACHE_TTL_MS,
    async () => {
      const response = await fesmuFetch(source);
      if (!response.ok) return { value: null, error: response.error ?? `HTTP ${response.status}` };
      const items = parseFeedItems(response.body, kind, source);
      if (items.length === 0) return { value: null, error: PARSE_ERROR };
      return { value: items, error: null };
    },
    options.force === true,
  );
  return {
    source,
    label,
    items: result.value ?? [],
    error: result.error,
    cached: result.cached,
    stale: result.stale,
    fetched_at: result.fetched_at,
  };
}

/* ------------------------------------------------------------------ *
 * Documents: faculty pages and the schedule index (contract §1.4)
 * ------------------------------------------------------------------ */

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

  const course = deriveCourse(title, stem);
  // Separators are word boundaries here too, so `2_potok_vesna.pdf` reads as
  // «2 поток, весенний» instead of losing the stream.
  const haystack = `${title} ${stem.replace(/[_\-]+/g, " ")}`;
  const kind = classifyKind(title);
  const item: ScheduleItem = {
    title,
    title_source: titleSource,
    url,
    course: course.course,
    course_number: course.courseNumber,
    semester: deriveSemester(haystack),
    stream: deriveStream(haystack),
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

export type ScheduleLoad = {
  ok: boolean;
  items: ScheduleItem[];
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
  cache_age_seconds: number | null;
  error: string | null;
};

async function loadSchedule(
  key: string,
  pageUrl: string,
  document: boolean,
  force: boolean,
): Promise<ScheduleLoad> {
  const result = await readThrough<ScheduleItem[]>(
    key,
    CACHE_TTL_MS,
    async () => {
      const response = await fesmuFetch(pageUrl);
      if (!response.ok) return { value: null, error: response.error ?? `HTTP ${response.status}` };
      const items = parseScheduleDocuments(response.body, pageUrl, { document });
      if (items.length === 0) return { value: null, error: PARSE_ERROR };
      return { value: items, error: null };
    },
    force,
  );
  return {
    ok: result.value !== null,
    items: result.value ?? [],
    cached: result.cached,
    stale: result.stale,
    fetched_at: result.fetched_at,
    cache_age_seconds: result.cache_age_seconds,
    error: result.error,
  };
}

/* ------------------------------------------------------------------ *
 * Service probes (contract §1.5)
 * ------------------------------------------------------------------ */

function uncheckedService(service: ServiceStatus): ServiceStatus {
  return { ...service, reachable: null, http_status: null, latency_ms: null, checked_at: null };
}

async function probeService(service: ServiceStatus, deadline: number): Promise<ServiceStatus> {
  const checkedAt = new Date().toISOString();
  const budgetFor = () => Math.max(500, Math.min(PROBE_TIMEOUT_MS, deadline - Date.now()));
  const startedAt = Date.now();

  const head = await fesmuFetch(service.url, {
    method: "HEAD",
    timeoutMs: budgetFor(),
    maxAttempts: 1,
    totalBudgetMs: budgetFor() + 1_000,
  });
  if (head.ok) {
    return {
      ...service,
      reachable: true,
      http_status: head.status,
      latency_ms: Date.now() - startedAt,
      checked_at: checkedAt,
    };
  }

  // No HTTP answer at all (DNS/TLS/timeout/refused): a GET cannot do better, so
  // do not burn another 6 s of the 15 s budget on the same dead host.
  if (head.status === 0) {
    return {
      ...service,
      reachable: false,
      http_status: null,
      latency_ms: Date.now() - startedAt,
      checked_at: checkedAt,
      note: `${service.note} Ответ сервера: ${head.error ?? "нет ответа"}.`,
    };
  }

  // Real HTTP status but no success (405/403/…): some servers only speak GET.
  const get = await fesmuFetch(service.url, {
    method: "GET",
    timeoutMs: budgetFor(),
    maxAttempts: 1,
    totalBudgetMs: budgetFor() + 1_000,
  });
  const status = get.status > 0 ? get.status : head.status;
  return {
    ...service,
    reachable: get.status > 0 ? get.status >= 200 && get.status < 400 : false,
    http_status: status > 0 ? status : null,
    latency_ms: Date.now() - startedAt,
    checked_at: checkedAt,
    note: get.error ? `${service.note} Ответ сервера: ${get.error}.` : service.note,
  };
}

function withDeadline<T>(promise: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback()), Math.max(1, ms));
    if (typeof timer.unref === "function") timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback());
      },
    );
  });
}

/** Bounded-concurrency worker pool: a slow host never blocks the next probe. */
async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const size = Math.max(1, Math.min(limit, items.length));
  for (let index = 0; index < size; index += 1) {
    runners.push(
      (async () => {
        for (;;) {
          const current = cursor;
          cursor += 1;
          if (current >= items.length) return;
          results[current] = await worker(items[current]);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

/** Probes every registry service (HEAD then GET, bounded concurrency 4). */
export async function probeServices(): Promise<ServiceStatus[]> {
  const registry = staticServices();
  const deadline = Date.now() + PROBE_BUDGET_MS;
  return runPool(registry, PROBE_CONCURRENCY, (service) =>
    withDeadline(
      probeService(service, deadline),
      Math.max(0, deadline - Date.now()),
      () => uncheckedService(service),
    ),
  );
}

export async function getServiceStatuses(options: { force?: boolean } = {}): Promise<ServiceStatus[]> {
  const result = await readThrough<ServiceStatus[]>(
    "status",
    STATUS_TTL_MS,
    async () => ({ value: await probeServices(), error: null }),
    options.force === true,
  );
  return result.value ?? staticServices();
}

export async function getServiceReport(options: { force?: boolean } = {}): Promise<ServiceStatusReport> {
  const services = await getServiceStatuses(options);
  return { ok: true, fetched_at: new Date().toISOString(), services };
}

/* ------------------------------------------------------------------ *
 * Builders used by the route handlers
 * ------------------------------------------------------------------ */

export async function getSchedulePage(options: { force?: boolean } = {}): Promise<SchedulePage> {
  const loaded = await loadSchedule("schedule:index", SCHEDULE_INDEX_URL, true, options.force === true);
  return {
    index_url: SCHEDULE_INDEX_URL,
    note: SCHEDULE_NOTE,
    faculties: FACULTIES.map((faculty) => ({ ...faculty })),
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

export { DISCLAIMER, FACULTIES, FEED_SOURCES, PORTAL, SCHEDULE_INDEX_URL, findFaculty, staticServices };
