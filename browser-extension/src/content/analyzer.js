/**
 * Page analyzer for the MEDBIOHIM importer.
 *
 * It never sends anything automatically: the popup asks for a page snapshot, the
 * user reviews the list and only then imports the selected links. Only public
 * titles, links, dates and short snippets are read from the current DOM. No
 * cookies, no tokens and no credentials are read here.
 *
 * FESMU note: the public ДВГМУ site is NOT ЕИОС. Cards on `www.fesmu.ru`
 * (1C-Bitrix `sf-` template) carry the real title in an `area-label` attribute on
 * the card wrapper, while the anchor itself is usually an empty image link — so a
 * title has to be resolved from attributes, exactly like the server adapter does
 * in `src/lib/university/fesmu.ts`.
 */

const SUPPORTED = [
  { match: /^eios\.fesmu\.ru$/i, source: "eios", label: "ЕИОС ДВГМУ" },
  // Public university pages are the official ДВГМУ site, not the ЕИОС system.
  { match: /(^|\.)fesmu\.ru$/i, source: "fesmu", label: "ДВГМУ (сайт вуза)" },
  { match: /(^|\.)lab\.neofamily\.ru$/i, source: "neofamily", label: "NeoFamily Lab" },
  { match: /(^|\.)xn--80aafla1ahtef3a7eg\.xn--p1ai$/i, source: "sechenov", label: "Школа Сеченова" },
];

/** Wrapper selectors: generic cards plus the 1C-Bitrix blocks used by ДВГМУ. */
const CARD_SELECTOR = [
  "article",
  "li",
  ".card",
  ".item",
  ".event",
  ".news",
  ".announcement",
  "[class*='card']",
  "[class*='item']",
  ".iblock-list-item-wrap",
  "[area-label]",
  "[class*='iblock']",
].join(", ");

/** Attributes that carry a human title on ДВГМУ cards. */
const TITLE_ATTRIBUTES = ["area-label", "data-title", "title", "alt", "aria-label"];
/** Values that are markup plumbing, never a real title. */
const PLACEHOLDER_TITLES = /^(heading|filename|title|alt|image|link|ссылка|подробнее|читать далее|more|ещё|еще|\+|-)$/i;
const DATE_ONLY = /^\d{1,2}\.\d{1,2}\.\d{4}$/;

const MAX_TITLE = 220;
const MAX_SUMMARY = 240;
const MAX_ANCHORS = 60;
const MAX_ITEMS = 50;

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
  for (const name of TITLE_ATTRIBUTES) {
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
  return anchor && typeof anchor.closest === "function" ? anchor.closest(CARD_SELECTOR) : null;
}

function queryOne(node, selector) {
  return node && typeof node.querySelector === "function" ? node.querySelector(selector) : null;
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
  const value = `${title} ${href}`.toLowerCase();
  if (/\.(pdf|docx?|xlsx?|pptx?)(\?|$)/.test(value)) return "document";
  if (/расписан|календар|событ|мероприят|schedule|calendar|event/.test(value)) return "event";
  if (/объявлен|новост|announcement|news/.test(value)) return "announcement";
  if (/задан|урок|тем|lesson|topic|trainer|тренаж|тест/.test(value)) return "topic";
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
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(haystack);
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
  const nodes =
    typeof container.querySelectorAll === "function"
      ? container.querySelectorAll("p, .description, .summary, .excerpt, time")
      : [];
  for (const node of nodes) {
    const value = text(node, MAX_SUMMARY);
    if (!value || DATE_ONLY.test(value)) continue;
    return value;
  }
  const single = queryOne(container, "p, .description, .summary, .excerpt, time");
  const value = text(single, MAX_SUMMARY);
  return DATE_ONLY.test(value) ? "" : value;
}

function collectAnchors() {
  const seen = new Set();
  const items = [];
  const anchors = document.querySelectorAll("main a[href], article a[href], .content a[href], .card a[href], a[href]");
  for (const anchor of anchors) {
    const href = absolute(anchor.getAttribute("href"));
    if (!href || !/^https?:/i.test(href)) continue;
    if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?|css|js)(\?|$)/i.test(href)) continue;
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
  for (const heading of document.querySelectorAll("main h2, article h2, main h3")) {
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

function analyze() {
  const meta = currentSource();
  const merged = new Map();
  for (const item of [...collectHeadings(), ...collectAnchors()]) {
    const title = item.title.replace(/^#+\s*/, "");
    const key = item.url;
    const existing = merged.get(key);
    if (existing) {
      if (title.length > existing.title.length) existing.title = title;
      if (!existing.summary && item.summary) existing.summary = item.summary;
      if (!existing.published_at && item.published_at) existing.published_at = item.published_at;
      continue;
    }
    merged.set(key, { ...item, title, published_at: item.published_at || null, source: meta.source, page_title: document.title.slice(0, 200) });
  }
  return {
    source: meta.source,
    source_label: meta.label,
    page_url: window.location.href,
    page_title: document.title,
    items: [...merged.values()].slice(0, MAX_ITEMS),
  };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action === "analyze_page") {
    try {
      sendResponse({ ok: true, ...analyze() });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  }
  return true;
});
