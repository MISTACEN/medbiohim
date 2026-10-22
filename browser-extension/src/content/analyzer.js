/**
 * Page analyzer for the MEDBIOHIM importer.
 *
 * It never sends anything automatically: the popup asks for a page snapshot, the
 * user reviews the list and only then imports the selected links. Only public
 * titles, links and short snippets are read from the current DOM.
 */

const SUPPORTED = [
  { match: /eios\.fesmu\.ru$/, source: "eios", label: "ЕИОС ДВГМУ" },
  { match: /fesmu\.ru$/, source: "eios", label: "ДВГМУ" },
  { match: /lab\.neofamily\.ru$/, source: "neofamily", label: "NeoFamily Lab" },
  { match: /xn--80aafla1ahtef3a7eg\.xn--p1ai$/, source: "sechenov", label: "Школа Сеченова" },
];

function currentSource() {
  const host = window.location.hostname;
  return SUPPORTED.find((entry) => entry.match.test(host)) || { source: "other", label: host };
}

function text(node, max = 300) {
  return (node?.textContent || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function absolute(href) {
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return null;
  }
}

function classify(title, href) {
  const value = `${title} ${href}`.toLowerCase();
  if (/\.(pdf|docx?|xlsx?|pptx?)(\?|$)/.test(value)) return "document";
  if (/расписан|календар|событ|мероприят|schedule|calendar|event/.test(value)) return "event";
  if (/объявлен|новост|announcement|news/.test(value)) return "announcement";
  if (/задан|урок|тем|lesson|topic|trainer|тренаж|тест/.test(value)) return "topic";
  return "link";
}

function nearbySummary(anchor) {
  const container = anchor.closest("article, li, .card, .item, .event, .news, .announcement, [class*='card'], [class*='item']");
  if (!container) return "";
  const paragraph = container.querySelector("p, .description, .summary, .excerpt, time");
  return text(paragraph, 240);
}

function collectAnchors() {
  const seen = new Set();
  const items = [];
  const anchors = document.querySelectorAll("main a[href], article a[href], .content a[href], .card a[href], a[href]");
  for (const anchor of anchors) {
    const href = absolute(anchor.getAttribute("href"));
    if (!href || !/^https?:/i.test(href)) continue;
    if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?|css|js)(\?|$)/i.test(href)) continue;
    const title = text(anchor, 220) || text(anchor.querySelector("h1,h2,h3,h4"), 220);
    if (title.length < 6) continue;
    const key = `${href}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      title,
      url: href,
      kind: classify(title, href),
      summary: nearbySummary(anchor),
    });
    if (items.length >= 60) break;
  }
  return items;
}

function collectHeadings() {
  const items = [];
  for (const heading of document.querySelectorAll("main h2, article h2, main h3")) {
    const title = text(heading, 220);
    if (title.length < 6) continue;
    const link = heading.querySelector("a[href]") || heading.closest("a[href]");
    const url = link ? absolute(link.getAttribute("href")) : null;
    if (!url || !/^https?:/i.test(url)) continue;
    items.push({
      title,
      url,
      kind: classify(title, url),
      summary: text(heading.nextElementSibling, 240),
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
      continue;
    }
    merged.set(key, { ...item, title, source: meta.source, page_title: document.title.slice(0, 200) });
  }
  return {
    source: meta.source,
    source_label: meta.label,
    page_url: window.location.href,
    page_title: document.title,
    items: [...merged.values()].slice(0, 50),
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
