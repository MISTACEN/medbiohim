#!/usr/bin/env node
/**
 * Лекции по органической химии из учебника Травеня (3 тома PDF).
 *
 * Порядок работы по требованию кафедры: основа — Травень, формулировки
 * сохраняются; Тюкавкина используется как дополнение/уточнение.
 *
 * Скрипт:
 *   1. извлекает текст постранично (`unpdf`), снимает разрядку «У Ч Е Б Н И К»;
 *   2. убирает колонтитулы, номера страниц и оглавление с точечными лидерами;
 *   3. режет поток на главы («Глава 2. АЛКАНЫ») и параграфы («2.4. …»);
 *   4. собирает HTML: заголовки h2/h3, абзацы, маркированные перечни;
 *   5. раскладывает параграфы по темам программы МБХ-201 (org-1-1 … org-3-11).
 *
 * Режимы:
 *   node scripts/build-organic-traven.mjs --inventory   # сколько текста по главам
 *   node scripts/build-organic-traven.mjs --write       # записать lectures-chem-organic.json
 */
import fs from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const WRITE = process.argv.includes("--write");
const DIR = "C:/Users/MISTACEN/Desktop/вуз/учебники/химия физическая и органическре/";
const BOOKS = [
  { file: "Т. 1.pdf", label: "Травень, т. 1" },
  { file: "Т. 2 (1).pdf", label: "Травень, т. 2" },
  { file: "Учебник_Травень_Т_3_Карбоновые_кислоты_ч1.pdf", label: "Травень, т. 3 (фрагмент)" },
];
const TARGET = "public/content/portals/lectures-chem-organic.json";
const GROUP = "МБХ-201";

/* ---------- очистка ---------- */

/**
 * Разрядка «Де га ло гени ро ва ние»: PDF разбивает части слова на отдельные
 * блоки. Отличить обрывок от короткого настоящего слова («как», «для») можно
 * только по частоте: настоящие слова встречаются сотни раз, обрывки — единицы.
 */
const DICT = new Map();

function buildDict(pages) {
  for (const page of pages) {
    for (const token of page.split(/\s+/)) {
      const word = token.replace(/[^\p{L}]/gu, "");
      if (word.length < 2) continue;
      DICT.set(word.toLowerCase(), (DICT.get(word.toLowerCase()) ?? 0) + 1);
    }
  }
}

/**
 * Словарь «настоящих» слов книги: длинные встречаются редко, но они точные;
 * короткие берём только частые («если», «как» встречаются сотни раз, обрывки — нет).
 */
const LONG_WORDS = new Set();
const PREFIXES = new Set();
const buildLongWords = () => {
  for (const [word, count] of DICT) {
    if (word.length >= 6 || count >= 15) LONG_WORDS.add(word);
  }
  for (const word of LONG_WORDS) if (word.length > 5) PREFIXES.add(word.slice(0, 5));
};

const isPlainWord = (token) => /^[\p{L}]+$/u.test(token);

const isKnownWord = (word) => word.length >= 3 && (DICT.get(word) ?? 0) >= 3;

/**
 * Восстанавливает слова из обрывков: «че ния ал кил бен зо лов» →
 * «чения алкилбензолов». Ищем такую разбивку на слова, при которой
 * больше всего кусков попадает в словарь книги (динамическое программирование).
 */
function resegmentLine(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return line;
  const n = tokens.length;
  const best = new Array(n + 1).fill(null);
  best[0] = { score: 0, groups: [] };
  for (let index = 0; index < n; index += 1) {
    if (!best[index]) continue;
    let merged = "";
    for (let take = 1; take <= 5 && index + take <= n; take += 1) {
      const token = tokens[index + take - 1];
      merged += token;
      // Склеивать имеет смысл только цельные буквенные куски.
      if (!/^[\p{L}]+$/u.test(merged)) break;
      const known = isKnownWord(merged.toLowerCase());
      const score =
        best[index].score + (known ? 1 : -0.6) - (take > 1 ? 0.05 : 0);
      const target = index + take;
      if (!best[target] || best[target].score < score) {
        best[target] = {
          score,
          groups: [...best[index].groups, merged],
        };
      }
    }
  }
  return best[n] ? best[n].groups.join(" ") : line;
}

/**
 * Собирает подряд идущие обрывки, пока сумма не станет словом из книги:
 * «Де га ло гени ро ва ние» → «Дегалогенирование», «Ес ли» → «Если».
 * Если слово не сложилось, обрывки остаются как были — лучше пробел, чем склейка наугад.
 */
function joinFragments(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return line;
  const out = [];
  let index = 0;
  while (index < tokens.length) {
    const start = tokens[index];
    if (isPlainWord(start)) {
      let joined = start;
      let probe = index;
      let matched = false;
      while (probe + 1 < tokens.length && joined.length < 25) {
        const next = tokens[probe + 1];
        if (!isPlainWord(next)) break;
        const candidate = joined + next;
        if (LONG_WORDS.has(candidate.toLowerCase())) {
          joined = candidate;
          probe += 1;
          matched = true;
          break;
        }
        // Начало слова совпадает с известным — значит обрывок ещё не закончился.
        if (!PREFIXES.has(candidate.slice(0, 5).toLowerCase())) break;
        joined = candidate;
        probe += 1;
      }
      if (matched && probe > index) {
        out.push(joined);
        index = probe + 1;
        continue;
      }
    }
    out.push(start);
    index += 1;
  }
  return out.join(" ");
}

const deSpace = (text) =>
  text
    .replace(/(?:\b[А-ЯЁA-Z]\s){3,}/g, (run) => run.replace(/\s+/g, ""))
    .replace(/(?:\b[а-яёa-z]\s){3,}/g, (run) => run.replace(/\s+/g, " "))
    .replace(/\u00ad/g, "")
    .replace(/-\n(?=[а-яёa-z])/gi, "")
    .split("\n")
    .map(joinFragments)
    .map(resegmentLine)
    .join("\n");

// В оглавлении точки идут с пробелами: «Глава 2. АЛКАНЫ . . . . . . 121».
const TOC_LINE = /(?:\.\s*){4,}\d*\s*$/;
const DOT_RUN = /(?:\.\s*){3,}/;
const TOC_PAGE_LIMIT = 12;
const PAGE_NUMBER = /^\s*\d{1,3}\s*$/;
// Колонтитул — «Глава 2» без названия; «Глава 2. АЛКАНЫ» — настоящий заголовок.
// Колонтитул: «Глава 5. АЛКЕНЫ 227» (с номером страницы) или просто «Глава 5».
const RUNNING_HEAD = /^(?:Глава\s+\d+\s*$|Глава\s+\d+\.[^\n]*\s\d{2,3}\s*$|Травень|ОРГАНИЧЕСКАЯ\s+ХИМИЯ|Оглавление)/i;
const FIGURE_LINE = /^(?:Рис\.|Табл\.|Схема)\s*\d/i;

function cleanPages(pages) {
  // Оглавление книги не является материалом лекции.
  const body = pages.slice(TOC_PAGE_LIMIT);
  const counts = new Map();
  for (const page of body) {
    for (const line of new Set(page.split("\n").map((l) => l.trim()).filter(Boolean))) {
      if (line.length <= 60) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const noise = new Set(
    [...counts]
      .filter(([line, count]) => count >= Math.max(6, Math.floor(body.length * 0.2)) && !/[.!?]$/.test(line))
      .map(([line]) => line),
  );
  return body
    .map((page) =>
      page
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) =>
            line &&
            !noise.has(line) &&
            !TOC_LINE.test(line) &&
            !DOT_RUN.test(line) &&
            !PAGE_NUMBER.test(line) &&
            !RUNNING_HEAD.test(line) &&
            !FIGURE_LINE.test(line),
        )
        .join("\n"),
    )
    .filter((page) => page.length > 0);
}

/* ---------- сегментация ---------- */

const CHAPTER = /^Глава\s+(\d+)\.\s*(.+)$/;
const SECTION = /^(\d+\.\d+(?:\.\d+)?)\.?\s+([А-ЯЁ][^.]{3,90})$/;

function segment(pages, bookLabel) {
  const sections = [];
  const seenChapters = new Set();
  let chapter = null;
  let current = null;
  const push = () => {
    if (current) sections.push(current);
  };
  for (const page of pages) {
    const lines = page.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const ch = line.match(CHAPTER);
      if (ch && seenChapters.has(Number(ch[1]))) {
        // Повтор «Глава N» в колонтитуле, а не начало главы.
        continue;
      }
      if (ch) {
        push();
        current = null;
        seenChapters.add(Number(ch[1]));
        // Название главы часто переносится на следующую строку капсом.
        let title = ch[2].replace(/\s+/g, " ").trim();
        while (title.length < 70 && index + 1 < lines.length) {
          const next = lines[index + 1].trim();
          if (!next || !/^[А-ЯЁA-Z][А-ЯЁA-Z\s,.\-]{3,}$/.test(next)) break;
          title = `${title} ${next}`.replace(/\s+/g, " ").trim();
          index += 1;
        }
        chapter = { number: Number(ch[1]), title: title.replace(/\.$/, "") };
        continue;
      }
      const sec = line.match(SECTION);
      if (sec) {
        push();
        current = {
          book: bookLabel,
          chapter,
          number: sec[1],
          // В заголовке часто затесался номер страницы: «5.2. Способы получения 225».
          title: sec[2].replace(/\s+\d{2,3}$/, "").trim(),
          lines: [],
        };
        continue;
      }
      if (current) current.lines.push(line);
    }
  }
  push();
  return sections;
}

/* ---------- HTML ---------- */

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Качественный фильтр: OCR-слой Травеня местами рвёт слова на куски
 * («ви ци нальных»). Такой абзац лучше не показывать, чем показывать
 * с артефактами — он остаётся в книге, но не в лекции.
 */
function fragmentRatio(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  let words = 0;
  let broken = 0;
  for (const token of tokens) {
    if (!isPlainWord(token)) continue;
    words += 1;
    const word = token.toLowerCase();
    if (word.length <= 4 && (DICT.get(word) ?? 0) < 5) broken += 1;
  }
  if (!words) return 1;
  return broken / words;
}

function isReadableParagraph(text) {
  if (text.length < 60) return false;
  return fragmentRatio(text) < 0.3;
}

function sectionHtml(section) {
  // 5.3 — раздел, 5.3.1 — подраздел.
  const tag = section.number.split(".").length >= 3 ? "h4" : "h3";
  const paragraphs = [];
  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 1) paragraphs.push(text);
    buffer = [];
  };
  for (const line of section.lines) {
    if (/^[-–—•]\s+/.test(line)) {
      flush();
      paragraphs.push(`@@LI@@${line.replace(/^[-–—•]\s+/, "")}`);
    } else if (
      // Подзаголовок: нумерованный пункт или строка капсом. Формулы и обрывки
      // схем («Zn, пыль») в заголовки не попадают.
      /^\d+\.\d+\.\d+\.?\s+[А-ЯЁ]/.test(line) ||
      (/^[А-ЯЁ][А-ЯЁ\s\-–—,]{6,60}$/.test(line) && line.split(" ").length <= 8)
    ) {
      flush();
      paragraphs.push(`@@H4@@${line}`);
    } else {
      buffer.push(line);
    }
  }
  flush();

  const body = paragraphs
    .map((item) => {
      if (item.startsWith("@@LI@@")) return `<li>${escapeHtml(item.slice(6))}</li>`;
      if (item.startsWith("@@H4@@")) return `<h4>${escapeHtml(item.slice(6))}</h4>`;
      if (!isReadableParagraph(item)) return "";
      const latex = /[=→⇌]/.test(item) && /\d/.test(item) && item.length < 160;
      return latex
        ? `<p class="chem-eq">${escapeHtml(item)}</p>`
        : `<p>${escapeHtml(item)}</p>`;
    })
    .filter(Boolean)
    .join("\n")
    .replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);

  return `<${tag}>${escapeHtml(`${section.number}. ${section.title}`)}</${tag}>\n${body}`;
}

/* ---------- раскладка по темам МБХ-201 ---------- */

/**
 * Темы программы МБХ-201 и главы Травеня.
 *
 * Глава 1 содержит сразу три темы, поэтому для неё дополнительно смотрим
 * номер параграфа: 1.1–1.2 — классификация, 1.3–1.10 — связь и эффекты,
 * 1.11–1.14 — кислоты и основания.
 */
const TOPICS = [
  {
    id: "org-1-1-klassifikaciya-nomenklatura",
    title: "Классификация органических соединений и номенклатура",
    chapters: [1],
    chapter1Max: 2,
  },
  {
    id: "org-1-2-svyaz-elektronnye-effekty",
    title: "Химическая связь и электронные эффекты",
    chapters: [1],
    chapter1Min: 3,
    chapter1Max: 10,
  },
  {
    id: "org-1-3-kislotnost-osnovnost",
    title: "Кислотность и основность органических соединений",
    chapters: [1],
    chapter1Min: 11,
  },
  { id: "org-1-4-stereoizomeriya", title: "Изомерия и стереоизомерия: хиральность, энантиомеры, R/S-номенклатура", chapters: [3] },
  { id: "org-3-1-alkany-cikloalkany", title: "Алканы и циклоалканы", chapters: [2, 4] },
  { id: "org-3-2-alkeny-alkiny-dieny", title: "Алкены, алкины и диены", chapters: [5, 6, 7] },
  { id: "org-3-3-areny", title: "Ароматические углеводороды (арены)", chapters: [8, 9, 10, 11] },
  { id: "org-3-4-galogenuglevodorody", title: "Галогенопроизводные углеводородов", chapters: [13, 14] },
  { id: "org-3-5-spirty-fenoly-efiry", title: "Спирты, фенолы и простые эфиры", chapters: [16, 17, 18] },
  { id: "org-3-6-aminy-diazosoedineniya", title: "Амины и диазосоединения", chapters: [22, 23, 24] },
  { id: "org-3-8-aldegidy-ketony", title: "Альдегиды и кетоны", chapters: [19] },
  { id: "org-3-9-karbonovye-kisloty", title: "Карбоновые кислоты и их производные", chapters: [20, 21] },
  { id: "org-3-10-geterofunkcionalnye", title: "Гетерофункциональные соединения", chapters: [26, 27] },
  { id: "org-3-11-geterocikly-alkaloidy", title: "Гетероциклические соединения и алкалоиды", chapters: [25] },
];

/** Номер параграфа «1.11» → { major: 1, minor: 11 }. */
const splitNumber = (number) => {
  const [major, minor] = String(number).split(".").map(Number);
  return { major, minor: Number.isFinite(minor) ? minor : 0 };
};

function dedupeSections(sections) {
  // Один и тот же параграф может попасть из пересканированного тома — берём самый полный.
  const byKey = new Map();
  for (const section of sections) {
    const key = `${section.number}`;
    const previous = byKey.get(key);
    const size = section.lines.join(" ").length;
    if (!previous || size > previous.size) byKey.set(key, { section, size });
  }
  return [...byKey.values()].map((entry) => entry.section);
}

function assignTopics(sections) {
  const byTopic = new Map(TOPICS.map((topic) => [topic.id, []]));
  const leftovers = [];
  for (const section of sections) {
    const { major, minor } = splitNumber(section.number);
    const chapter = section.chapter?.number ?? major;
    const topic = TOPICS.find((candidate) => {
      if (!candidate.chapters.includes(chapter)) return false;
      if (chapter !== 1) return true;
      if (candidate.chapter1Min !== undefined && minor < candidate.chapter1Min) return false;
      if (candidate.chapter1Max !== undefined && minor > candidate.chapter1Max) return false;
      return true;
    });
    if (topic) byTopic.get(topic.id).push(section);
    else leftovers.push(section);
  }
  return { byTopic, leftovers };
}

/* ---------- сборка ---------- */

// Первый проход — сырой текст всех томов: по нему строится словарь частот,
// чтобы отличить обрывки слов от настоящих коротких слов.
const rawBooks = [];
for (const book of BOOKS) {
  if (!fs.existsSync(DIR + book.file)) {
    console.log(`нет файла: ${book.file}`);
    continue;
  }
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(DIR + book.file)));
  const { text } = await extractText(pdf, { mergePages: false });
  rawBooks.push({ book, text });
  buildDict(text);
}
buildLongWords();
console.log(`словарь: ${DICT.size} слов, из них длинных ${LONG_WORDS.size}`);

const allSections = [];
for (const { book, text } of rawBooks) {
  const pages = cleanPages(text.map(deSpace));
  const sections = segment(pages, book.label);
  console.log(`${book.file}: ${text.length} стр. → ${sections.length} параграфов`);
  allSections.push(...sections);
}

const sections = dedupeSections(allSections);
console.log(`уникальных параграфов после свёрки томов: ${sections.length}`);

if (!WRITE) {
  console.log("\n=== инвентаризация по главам ===");
  const byChapter = new Map();
  for (const section of sections) {
    const key = section.chapter ? `${section.chapter.number}. ${section.chapter.title}` : "(без главы)";
    const entry = byChapter.get(key) ?? { sections: 0, chars: 0 };
    entry.sections += 1;
    entry.chars += section.lines.join(" ").length;
    byChapter.set(key, entry);
  }
  for (const [key, entry] of [...byChapter].sort((a, b) => b[1].chars - a[1].chars)) {
    console.log(`${String(entry.sections).padStart(3)} пар., ${String(Math.round(entry.chars / 1000)).padStart(4)} тыс. симв. | ${key}`);
  }
  const { byTopic, leftovers } = assignTopics(sections);
  console.log("\n=== покрытие тем МБХ-201 ===");
  for (const topic of TOPICS) {
    const list = byTopic.get(topic.id);
    const chars = list.reduce((sum, s) => sum + s.lines.join(" ").length, 0);
    console.log(`${topic.id}: ${list.length} пар., ${Math.round(chars / 1000)} тыс. симв.`);
  }
  console.log(`не разобрано: ${leftovers.length} пар., ${Math.round(leftovers.reduce((sum, s) => sum + s.lines.join(" ").length, 0) / 1000)} тыс. симв.`);
  process.exit(0);
}

const { byTopic } = assignTopics(sections);
const MAX_CHARS = 42000;
const file = JSON.parse(fs.readFileSync(TARGET, "utf8"));
const existing = new Map(file.items.map((item) => [item.id, item]));
const items = [];
for (const topic of TOPICS) {
  const sections = byTopic.get(topic.id);
  const previous = existing.get(topic.id);
  if (!sections.length) {
    // Глав 19 и 21–28 в загруженных файлах Травеня нет — оставляем материал
    // на основе Тюкавкиной, честно помечая источник.
    if (previous) {
      items.push({
        ...previous,
        group: GROUP,
        source: "Тюкавкина (глава Травеня отсутствует в загруженных файлах)",
      });
      console.log(`${topic.id}: Травеня нет → оставлена основа Тюкавкиной`);
    } else {
      console.log(`пропуск ${topic.id}: нет источников`);
    }
    continue;
  }
  // Том содержит значительно больше, чем нужно занятию: берём параграфы
  // по порядку книги, пока лекция не достигнет разумного объёма.
  const chosen = [];
  let chars = 0;
  const ordered = [...sections].sort((a, b) => {
    const pa = a.number.split(".").map(Number);
    const pb = b.number.split(".").map(Number);
    for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
      const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
      if (diff) return diff;
    }
    return 0;
  });
  for (const section of ordered) {
    const size = section.lines.join(" ").length;
    if (chars + size > MAX_CHARS && chosen.length) continue;
    chosen.push(section);
    chars += size;
  }
  const travenHtml = chosen.map((section) => sectionHtml(section)).join("\n");
  // Сначала Травень (оригинальные формулировки), затем — дополнение
  // и упрощённое изложение по Тюкавкиной, если оно уже было.
  const html = previous?.html
    ? `${travenHtml}\n<h3>Дополнение и упрощённое изложение по Тюкавкиной</h3>\n${previous.html}`
    : travenHtml;
  items.push({
    id: topic.id,
    title: topic.title,
    group: GROUP,
    source: previous?.html
      ? "Травень + Тюкавкина (дополнение)"
      : "Травень «Органическая химия»",
    html,
    note:
      "Текст главы распознан из PDF автоматически; возможны артефакты распознавания.",
  });
  console.log(`${topic.id}: ${sections.length} параграфов → взято ${chosen.length}, ${Math.round(html.length / 1000)} тыс. симв. HTML`);
}
file.items = items;
file.group = GROUP;
file.subject = "Органическая химия";
fs.writeFileSync(TARGET, `${JSON.stringify(file, null, 1)}\n`);
console.log(`\nзаписано ${items.length} лекций в ${TARGET}`);
