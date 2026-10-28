/**
 * Page analyzer for the MEDBIOHIM importer.
 *
 * It never sends anything automatically: the popup asks for a page snapshot, the
 * user reviews the list and only then imports the selected links. Only public
 * titles, links, dates and short snippets are read from the current DOM. No
 * cookies, no tokens and no credentials are read here.
 *
 * Selectors, limits and heuristic regexes live in `sources.json` (declarative
 * source map, see README → «Карта источников»), so a platform redesign is a JSON
 * edit instead of a code change. Per-source `selectors` extend the common block:
 * arrays are concatenated, strings replace.
 *
 * FESMU note: the public ДВГМУ site is NOT ЕИОС. Cards on `www.fesmu.ru`
 * (1C-Bitrix `sf-` template) carry the real title in an `area-label` attribute on
 * the card wrapper, while the anchor itself is usually an empty image link — so a
 * title has to be resolved from attributes, exactly like the server adapter does
 * in `src/lib/university/fesmu.ts`.
 *
 * Network capture: the MAIN-world `interceptor.js` announces list-like JSON
 * payloads the page itself requested while the user was reviewing it. Those
 * items are buffered here (in memory, per tab) and merged into the preview with
 * `via: "network"`. Nothing leaves the tab until the user presses «Импортировать».
 */

import sourcesConfig from "./sources.json";

const CAPTURE_EVENT = "medbiohim:capture";
const ARM_EVENT = "medbiohim:arm";
const DISARM_EVENT = "medbiohim:disarm";

/** How long one «Разобрать страницу» keeps the interceptor armed. */
const ARM_TTL_MS = 100000;

const SUPPORTED = (sourcesConfig.sources || []).map((entry) => ({
  match: new RegExp(entry.match, "i"),
  source: entry.id,
  label: entry.label,
}));

const COMMON = sourcesConfig.common || {};

function sourceConfig(hostname) {
  return (sourcesConfig.sources || []).find((entry) => {
    try {
      return new RegExp(entry.match, "i").test(hostname);
    } catch {
      return false;
    }
  });
}

function mergeSelectors(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (Array.isArray(value) && Array.isArray(merged[key])) {
      merged[key] = [...merged[key], ...value];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function selectorsFor(hostname) {
  const entry = sourceConfig(hostname);
  return mergeSelectors(COMMON, entry && entry.selectors);
}

const MAX_TITLE = Number(COMMON.limits?.title ?? 220);
const MAX_SUMMARY = Number(COMMON.limits?.summary ?? 240);
const MAX_ANCHORS = Number(COMMON.limits?.anchors ?? 60);
const MAX_ITEMS = Number(COMMON.limits?.items ?? 50);

const PLACEHOLDER_TITLES = new RegExp(
  COMMON.placeholder_titles || "^(heading|filename|title|alt|image|link|\\+|-)$",
  "i",
);
const DATE_ONLY = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
const DATE_PATTERN = new RegExp(COMMON.date_pattern || "(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})");
const SKIP_URL = new RegExp(COMMON.skip_url || "\\.(png|jpe?g|gif|svg)(\\?|$)", "i");
const KIND_RULES = (COMMON.kind_rules || []).map((rule) => ({
  kind: rule.kind,
  pattern: new RegExp(rule.pattern, "i"),
}));

let activeSelectors = selectorsFor(window.location.hostname);

function currentSource() {
  const host = window.location.hostname;
  return SUPPORTED.find((entry) => entry.match.test(host)) || { source: "other", label: host };
}

function text(node, max = 300) {
  if (!node) return "";
  const raw = typeof node.textContent === "string" ? node.textContent : "";
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

function absolute(href) {
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return null;
  }
}

function attributeTitle(node) {
  if (!node || typeof node.getAttribute !== "function") return "";
  const names = activeSelectors.title_attributes || ["title", "alt", "aria-label"];
  for (const name of names) {
    const value = node.getAttribute(name);
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function isUsableTitle(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length >= 6 && !PLACEHOLDER_TITLES.test(clean);
}

function cardContainer(anchor) {
  const selector = (activeSelectors.card_selector || []).join(", ");
  if (!selector || !anchor || typeof anchor.closest !== "function") return null;
  return anchor.closest(selector);
}

function queryOne(node, selector) {
  if (!node || !selector || typeof node.querySelector !== "function") return null;
  return node.querySelector(selector);
}

/**
 * Title of a card: anchor text → anchor/inner-image attributes → the card itself
 * (heading, then its attributes) → its ancestors, so a link wrapped in a section
 * that carries the visible title is still readable. ДВГМУ pages rely on this:
 * the anchor is often an empty image link and the title lives on the wrapper.
 */
function resolveTitle(anchor) {
  const candidates = [
    text(anchor, MAX_TITLE),
    text(queryOne(anchor, "h1,h2,h3,h4"), MAX_TITLE),
    attributeTitle(anchor),
    attributeTitle(queryOne(anchor, "img")),
  ];
  let scope = cardContainer(anchor);
  for (let level = 0; level < 3 && scope; level += 1) {
    candidates.push(
      text(queryOne(scope, "h1,h2,h3,h4,h5"), MAX_TITLE),
      attributeTitle(scope),
      attributeTitle(queryOne(scope, "img")),
    );
    scope = scope.parentNode && scope.parentNode.nodeType === 1 ? scope.parentNode : null;
  }
  for (const candidate of candidates) {
    const value = String(candidate || "").replace(/\s+/g, " ").trim();
    if (isUsableTitle(value)) return value;
  }
  return "";
}

function classify(title, href) {
  const value = `${title} ${href}`;
  for (const rule of KIND_RULES) {
    if (rule.pattern.test(value)) return rule.kind;
  }
  return "link";
}

/* ------------------------------------------------------------------ *
 * Real-calendar dates (same rules as src/lib/university/fesmu.ts)
 * ------------------------------------------------------------------ */

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1] || 0;
}

/** First `dd.mm.yyyy` inside the card → ISO `YYYY-MM-DD`; impossible dates drop out. */
function publishedAt(anchor) {
  const scope = cardContainer(anchor) || anchor;
  const haystack = `${text(scope, 4000)} ${attributeTitle(scope)}`;
  const match = DATE_PATTERN.exec(haystack);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  const pad = (value) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function nearbySummary(anchor) {
  const container = cardContainer(anchor) || anchor;
  const selector = activeSelectors.summary_selector || "p, .description, .summary, .excerpt, time";
  const nodes = typeof container.querySelectorAll === "function" ? container.querySelectorAll(selector) : [];
  for (const node of nodes) {
    const value = text(node, MAX_SUMMARY);
    if (!value || DATE_ONLY.test(value)) continue;
    return value;
  }
  const single = queryOne(container, selector);
  const value = text(single, MAX_SUMMARY);
  return DATE_ONLY.test(value) ? "" : value;
}

function collectAnchors() {
  const seen = new Set();
  const items = [];
  const scope = activeSelectors.anchor_scope || "a[href]";
  let anchors = [];
  try {
    anchors = document.querySelectorAll(scope);
  } catch {
    anchors = document.querySelectorAll("a[href]");
  }
  for (const anchor of anchors) {
    const href = absolute(anchor.getAttribute("href"));
    if (!href || !/^https?:/i.test(href)) continue;
    if (SKIP_URL.test(href)) continue;
    const title = resolveTitle(anchor);
    if (!title) continue;
    const key = `${href}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      title,
      url: href,
      kind: classify(title, href),
      summary: nearbySummary(anchor),
      published_at: publishedAt(anchor),
    });
    if (items.length >= MAX_ANCHORS) break;
  }
  return items;
}

function collectHeadings() {
  const items = [];
  const scope = activeSelectors.heading_scope || "main h2, article h2, main h3";
  let headings = [];
  try {
    headings = document.querySelectorAll(scope);
  } catch {
    headings = document.querySelectorAll("main h2, article h2, main h3");
  }
  for (const heading of headings) {
    const title = text(heading, MAX_TITLE);
    if (title.length < 6) continue;
    const link = heading.querySelector("a[href]") || heading.closest("a[href]");
    const url = link ? absolute(link.getAttribute("href")) : null;
    if (!url || !/^https?:/i.test(url)) continue;
    items.push({
      title,
      url,
      kind: classify(title, url),
      summary: text(heading.nextElementSibling, MAX_SUMMARY),
      published_at: publishedAt(heading),
    });
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Network capture buffer (filled by interceptor.js in the MAIN world)
 * ------------------------------------------------------------------ */

const networkItems = [];
const networkSeen = new Set();

function rememberNetworkItem(item) {
  const url = String(item?.url || "");
  const title = String(item?.title || "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  if (!url || !/^https?:/i.test(url) || title.length < 4) return;
  const key = `${url}|${title}`;
  if (networkSeen.has(key)) return;
  networkSeen.add(key);
  networkItems.push({ title, url, kind: classify(title, url), summary: "", published_at: null, via: "network" });
  if (networkItems.length > MAX_ITEMS) networkItems.splice(0, networkItems.length - MAX_ITEMS);
}

/**
 * MAIN world can only hand us strings (`CustomEvent.detail` objects are not
 * reliably readable across worlds), so the payload arrives JSON-encoded.
 */
window.addEventListener(CAPTURE_EVENT, (event) => {
  try {
    const raw = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
    for (const item of raw?.items || []) rememberNetworkItem(item);
  } catch {
    /* malformed payload — ignore */
  }
});

function armCapture() {
  window.dispatchEvent(new CustomEvent(ARM_EVENT, { detail: { ttl: ARM_TTL_MS } }));
}

function disarmCapture() {
  window.dispatchEvent(new CustomEvent(DISARM_EVENT));
}

function analyze() {
  const meta = currentSource();
  activeSelectors = selectorsFor(window.location.hostname);
  const merged = new Map();
  const pageUrl = window.location.href;
  for (const item of [...collectHeadings(), ...collectAnchors(), ...networkItems]) {
    const title = item.title.replace(/^#+\s*/, "");
    if (item.url === pageUrl) continue;
    const key = item.url;
    const existing = merged.get(key);
    if (existing) {
      if (title.length > existing.title.length) existing.title = title;
      if (!existing.summary && item.summary) existing.summary = item.summary;
      if (!existing.published_at && item.published_at) existing.published_at = item.published_at;
      if (item.via === "network" && !existing.via) existing.via = "network";
      continue;
    }
    merged.set(key, {
      ...item,
      title,
      published_at: item.published_at || null,
      via: item.via || "page",
      source: meta.source,
      page_title: document.title.slice(0, 200),
    });
  }
  const items = [...merged.values()];
  return {
    source: meta.source,
    source_label: meta.label,
    page_url: pageUrl,
    page_title: document.title,
    sources_version: sourcesConfig.version || null,
    network_count: items.filter((item) => item.via === "network").length,
    items: items.slice(0, MAX_ITEMS),
  };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action === "analyze_page") {
    try {
      // Capture only starts when the user asks for a parse, and it stops on its
      // own TTL or on the explicit disarm when the preview closes (anti-goal U9).
      armCapture();
      sendResponse({ ok: true, ...analyze() });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  }
  if (request?.action === "disarm_capture") {
    disarmCapture();
    sendResponse({ ok: true });
  }
  return true;
});
