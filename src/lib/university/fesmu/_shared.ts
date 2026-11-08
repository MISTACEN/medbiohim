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
export const PROBE_TIMEOUT_MS = 6_000;
export const PROBE_BUDGET_MS = 15_000;
export const PROBE_CONCURRENCY = 4;
export const CACHE_TTL_MS = 30 * 60 * 1000;
export const STATUS_TTL_MS = 10 * 60 * 1000;
export const MAX_FEED_ITEMS = 30;
export const MAX_CONTEXT_LENGTH = 120;
export const PARSE_ERROR = "Разметка источника изменилась";
/**
 * Hosts allowed by the transport: the university site and the public ОЗиЗ
 * Moodle catalog (U6/U7). Both are read-only public HTML; no credentials are
 * ever sent, so the relaxed TLS agent stays limited to these hosts.
 */
const FESMU_HOST = /(^|\.)(fesmu\.ru|ozizdvgmu\.ru)$/i;

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
    return { url: null, error: "Разрешены только домены fesmu.ru и ozizdvgmu.ru" };
  }
  return { url, error: null };
}

export function describeError(cause: unknown): string {
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

export function attrValue(attributes: string, name: string): string | null {
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

