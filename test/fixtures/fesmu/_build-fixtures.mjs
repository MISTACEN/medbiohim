/**
 * Builds the small, committed HTML fixtures in this directory from the raw
 * pages the Lead saved live on 2026-10-25 in `.tmp-fixtures/` (fetched from
 * https://www.fesmu.ru with relaxed TLS for the *.fesmu.ru hosts only).
 *
 * The raw pages are ~0.5 MB each (header/footer/base64 noise), so this script
 * keeps only the parts the adapter parses:
 *   - the real Bitrix `iblock-list-item-wrap` cards for the three press feeds;
 *   - the real `sf-iblock-detail-area` region (course/semester tables with the
 *     PDF links) plus the internal `http://192.168.x.x` nav noise for faculty
 *     pages;
 *   - the real document `<ul>` and internal nav links of the schedule index.
 *
 * Output must stay under 40 KB per file. Run manually from the repo root:
 *   node test/fixtures/fesmu/_build-fixtures.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = new URL("./", import.meta.url);
const RAW = new URL("../../../.tmp-fixtures/", HERE);
const OUT = HERE;

const FEEDS = [
  ["news", "news-list.html", "https://www.fesmu.ru/press-center/news/", "Новости", 10],
  ["announcements", "announcements-list.html", "https://www.fesmu.ru/press-center/announce/", "Объявления", 0],
  ["events", "events-list.html", "https://www.fesmu.ru/press-center/events/", "Анонсы", 0],
];

const FACULTIES = [
  ["lechebnyy", "faculty-lechebnyy.html"],
  ["pediatricheskiy", "faculty-pediatricheskiy.html"],
  ["stomatologicheskiy", "faculty-stomatologicheskiy.html"],
  ["farmatsii", "faculty-farmatsii.html"],
  ["mediko-gumanitarnyy", "faculty-mediko-gumanitarnyy.html"],
  ["kolledzh", "faculty-kolledzh.html"],
];

function readRaw(name) {
  return readFileSync(fileURLToPath(new URL(name, RAW)), "utf8").replace(/^\uFEFF/, "");
}

/** Light minification: Bitrix templates are tab-indented; no markup semantics change. */
function tighten(html) {
  return html
    .replace(/data:image\/gif;base64,[A-Za-z0-9+/=]+/g, "data:image/gif;base64,")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{2,}/g, "\n");
}

function wrap(title, body, note) {
  return [
    "<!doctype html>",
    '<html lang="ru"><head><meta charset="utf-8">',
    `<title>${title} — усечённый фикстур FESMU</title>`,
    "</head><body>",
    `<!-- ${note} -->`,
    body,
    "</body></html>",
    "",
  ].join("\n");
}

const bytes = (html) => Buffer.byteLength(html, "utf8");

function extractCards(raw) {
  const MARKER = "iblock-list-item-wrap";
  const cards = [];
  let index = 0;
  for (;;) {
    const start = raw.indexOf(MARKER, index);
    if (start === -1) break;
    const divStart = raw.lastIndexOf("<div", start);
    let end = raw.indexOf(MARKER, start + MARKER.length);
    if (end === -1) end = raw.length;
    const sectionEnd = raw.indexOf("</section>", start);
    if (sectionEnd !== -1 && sectionEnd < end) end = sectionEnd;
    cards.push(raw.slice(divStart === -1 ? start : divStart, end));
    index = start + MARKER.length;
  }
  return cards;
}

function extractInternalLinks(raw) {
  const out = [];
  const re = /href="http:\/\/192\.168\.[^"]+"/gi;
  let match;
  while ((match = re.exec(raw))) {
    const liStart = raw.lastIndexOf("<li", match.index);
    const liEnd = raw.indexOf("</li>", match.index);
    if (liStart !== -1 && liEnd !== -1 && liEnd - liStart < 1200) {
      out.push(raw.slice(liStart, liEnd + 5).replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

function buildFeeds() {
  const report = [];
  for (const [kind, file, source, label, limit] of FEEDS) {
    const raw = readRaw(file);
    const all = extractCards(raw);
    const cards = limit > 0 ? all.slice(0, limit) : all;
    const body = [
      `<section class="sf-iblock-card-area lazyload sf-viewbox-wrap  mb-4">`,
      `<div class="sf-viewbox position-relative"><div class="row ">`,
      cards.join("\n"),
      `</div></div></section>`,
    ].join("\n");
    const note =
      cards.length === all.length
        ? `All ${all.length} real Bitrix cards from ${source}`
        : `${cards.length} of ${all.length} real Bitrix cards from ${source} (newest first; trimmed for the 40 KB budget)`;
    const html = tighten(wrap(label, body, `${note} (fetched 2026-10-25).`));
    writeFileSync(fileURLToPath(new URL(`feeds-${kind}.html`, OUT)), html, "utf8");
    report.push([`feeds-${kind}.html`, cards.length, bytes(html)]);
  }
  return report;
}

function buildFaculty() {
  const report = [];
  for (const [id, file] of FACULTIES) {
    const raw = readRaw(file);
    const detailIdx = raw.indexOf("sf-iblock-detail-area");
    if (detailIdx === -1) throw new Error(`${file}: sf-iblock-detail-area not found`);
    const sectionStart = raw.lastIndexOf("<section", detailIdx);
    const sectionEnd = raw.indexOf("</main>", detailIdx);
    const detail = raw.slice(sectionStart, sectionEnd === -1 ? raw.length : sectionEnd);
    const h1 = (raw.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i) || [])[1] || "";
    const nav = extractInternalLinks(raw);
    const body = [
      `<!-- real nav noise: internal RFC1918 links that the adapter must drop -->`,
      `<ul class="nav flex-column">${nav.join("\n")}</ul>`,
      h1 ? `<h1 class="sf-title mt-0 mb-4 t-3 t-md-4">${h1}</h1>` : "",
      detail,
    ].join("\n");
    const html = tighten(
      wrap(
        `Расписание — ${id}`,
        body,
        `Real schedule page region from ${file} (fetched 2026-10-25); header/footer trimmed.`,
      ),
    );
    writeFileSync(fileURLToPath(new URL(`faculty-${id}.html`, OUT)), html, "utf8");
    const docHrefs = (detail.match(/href="[^"]*\.(?:pdf|docx?|xlsx?)"/gi) || []).length;
    report.push([`faculty-${id}.html`, docHrefs, bytes(html)]);
  }
  return report;
}

function buildScheduleIndex() {
  const raw = readRaw("schedule-index.html");
  const anchor = raw.indexOf("Именные аудитории");
  if (anchor === -1) throw new Error("schedule-index.html: document list anchor not found");
  const start = raw.lastIndexOf("<div", anchor);
  const lastDoc = raw.indexOf("grafik_uch_rasp_VO_vesna_26.pdf");
  if (lastDoc === -1) throw new Error("schedule-index.html: last document link not found");
  const end = raw.indexOf("</ul>", lastDoc) + 5;
  const region = raw.slice(start, end);
  const nav = extractInternalLinks(raw);
  const h1 = (raw.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i) || [])[1] || "";
  const body = [
    h1 ? `<h1 class="sf-title mt-0 mb-4 t-3 t-md-4">${h1}</h1>` : "",
    `<ul class="nav flex-column">${nav.join("\n")}</ul>`,
    region,
  ].join("\n");
  const html = tighten(
    wrap(
      "Расписание (указатель)",
      body,
      "Real schedule index document list from schedule-index.html (fetched 2026-10-25).",
    ),
  );
  writeFileSync(fileURLToPath(new URL("schedule-index.html", OUT)), html, "utf8");
  const docHrefs = (region.match(/href="[^"]*\.(?:pdf|docx?|xlsx?)"/gi) || []).length;
  return [["schedule-index.html", docHrefs, bytes(html)]];
}

const rows = [...buildFeeds(), ...buildFaculty(), ...buildScheduleIndex()];
let max = 0;
for (const [name, links, size] of rows) {
  max = Math.max(max, size);
  console.log(`${name.padEnd(34)} docHrefs=${String(links).padStart(2)}  ${size} bytes`);
}
if (max > 40 * 1024) {
  console.error(`FAIL: largest fixture is ${max} bytes (> 40 KB)`);
  process.exitCode = 1;
}
console.log(`largest fixture: ${max} bytes`);