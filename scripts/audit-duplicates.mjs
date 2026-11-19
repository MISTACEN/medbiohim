#!/usr/bin/env node
/**
 * Аудит дублирования и битого контента (public/content/portals + public/content/lectures).
 *
 * Проверяет то, что уже приводило к «двойным лекциям» и пустым экранам:
 *   1. индекс MC-тестов ↔ файлы (запись без файла и файл вне индекса);
 *   2. вопросы с пустым текстом (в интерфейсе выглядят как пустая карточка);
 *   3. одинаковые вопросы в разных банках — тема дублируется у студента дважды;
 *   4. лекции с одинаковой темой внутри портальных наборов и против CMS markdown;
 *   5. сырой LaTeX вне блоков .lec-math — формулы не рендерятся, видно «\\rightarrow»;
 *   6. текст-артефакт в начале лекции (случайно вставленная просьба, а не материал);
 *   7. вкладка легаси-портала, подключённая к нескольким предметам с одним набором лекций.
 *
 * Только читает. Использование: node scripts/audit-duplicates.mjs
 * Код выхода 1, если найдены проблемы.
 */
import fs from "node:fs";
import path from "node:path";

const BS = String.fromCharCode(92);
const PORTALS = "public/content/portals";
const CMS = "public/content/lectures";

const problems = [];
const report = (kind, message) => problems.push({ kind, message });

const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();

const STOP = new Set(
  [
    // служебные слова
    "для как это при или что также может быть всех этих между после через более менее только если тогда имеет имеют который которые является являются",
    // общие предметные слова: без них «Системы линейных уравнений» и «Функции одной переменной» ложно совпадают
    "системы нервной функции переменной соединительные ткани лексический минимум презентация формулы часть тема полный конспект слайды основные определения",
  ]
    .join(" ")
    .split(" ")
    .filter(Boolean),
);
const topicKey = (title) =>
  new Set(
    normalize(title)
      .split(" ")
      .filter((word) => word.length > 3 && !STOP.has(word)),
  );
const sharedCount = (a, b) => {
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared;
};
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  return sharedCount(a, b) / Math.min(a.size, b.size);
};

/* 1. Индекс MC ↔ файлы */
const indexPath = path.join(PORTALS, "mc-index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const bankIds = new Set();
for (const entry of index.tests) {
  bankIds.add(entry.id);
  const file = path.join(PORTALS, `mc-${entry.id}.json`);
  if (!fs.existsSync(file)) report("MC-индекс", `запись «${entry.id}» без файла ${file}`);
}
for (const name of fs.readdirSync(PORTALS)) {
  if (/^mc-.*\.json$/.test(name) && name !== "mc-index.json") {
    const id = name.replace(/^mc-/, "").replace(/\.json$/, "");
    if (!bankIds.has(id)) report("MC-индекс", `файл ${name} не входит в mc-index.json`);
  }
}

/* 2–3. Пустые вопросы и дубли вопросов между банками */
const banks = [];
for (const entry of index.tests) {
  const file = path.join(PORTALS, `mc-${entry.id}.json`);
  if (!fs.existsSync(file)) continue;
  const bank = JSON.parse(fs.readFileSync(file, "utf8"));
  const questions = bank.questions || [];
  const empty = questions.filter((question) => !String(question.text ?? "").trim());
  if (empty.length) {
    report("Пустые вопросы", `${entry.id}: ${empty.length} из ${questions.length} без текста`);
  }
  banks.push({
    id: entry.id,
    title: bank.title,
    questions: questions
      .filter((question) => String(question.text ?? "").trim())
      .map((question) => ({ text: question.text, key: normalize(question.text) })),
  });
}
for (let i = 0; i < banks.length; i += 1) {
  for (let j = i + 1; j < banks.length; j += 1) {
    const right = new Set(banks[j].questions.map((question) => question.key));
    const shared = banks[i].questions.filter((question) => right.has(question.key));
    if (shared.length >= 3) {
      report(
        "Дубли вопросов",
        `${banks[i].id} ∩ ${banks[j].id}: ${shared.length} одинаковых вопросов`,
      );
    }
  }
}

/* 4. Дубли лекций по теме */
const lectureSets = [];
for (const name of fs.readdirSync(PORTALS).filter((file) => file.startsWith("lectures-"))) {
  const set = JSON.parse(fs.readFileSync(path.join(PORTALS, name), "utf8"));
  for (const item of set.items || []) {
    lectureSets.push({
      origin: name.replace(/^lectures-|\.json$/g, ""),
      id: item.id,
      title: item.title,
      keys: topicKey(item.title),
      html: item.html || "",
    });
  }
}
const cmsLectures = [];
if (fs.existsSync(CMS)) {
  for (const subject of fs.readdirSync(CMS)) {
    const dir = path.join(CMS, subject);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".md"))) {
      const raw = fs.readFileSync(path.join(dir, name), "utf8");
      const title = ((raw.match(/^title:\s*(.+)$/m) || [])[1] || name).trim();
      cmsLectures.push({ origin: `cms:${subject}`, id: name, title, keys: topicKey(title), html: raw });
    }
  }
}
const allLectures = [...lectureSets, ...cmsLectures];
for (let i = 0; i < allLectures.length; i += 1) {
  for (let j = i + 1; j < allLectures.length; j += 1) {
    const a = allLectures[i];
    const b = allLectures[j];
    if (a.id === b.id && a.origin === b.origin) continue;
    if (sharedCount(a.keys, b.keys) >= 2 && overlap(a.keys, b.keys) >= 0.6) {
      report(
        "Дубли лекций",
        `${a.origin}:${a.id} «${a.title}» ⟷ ${b.origin}:${b.id} «${b.title}»`,
      );
    }
  }
}

/* 5. Сырой LaTeX вне .lec-math */
const latexCommand = new RegExp(`${BS}${BS}[a-zA-Z]{2,}`, "g");
for (const lecture of allLectures) {
  const withoutMath = lecture.html
    .replace(/<div class="lec-math">[\s\S]*?<\/div>/g, " ")
    .replace(/<span class="lec-math">[\s\S]*?<\/span>/g, " ");
  const commands = (withoutMath.match(latexCommand) || []).length;
  if (commands) {
    report("Формулы не рендерятся", `${lecture.origin}:${lecture.id}: ${commands} команд вне .lec-math`);
  }
}

/* 6. Текст-артефакт в начале лекции */
const ARTIFACT = /^(можешь|распиши|распиать|сделай|напиши|помоги)/i;
for (const lecture of allLectures) {
  const text = lecture.html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (ARTIFACT.test(text) || /распиать|ппример|рвзобратьс/i.test(text.slice(0, 400))) {
    report("Артефакт в лекции", `${lecture.origin}:${lecture.id}: «${text.slice(0, 70)}…»`);
  }
}

/* 7. Одна вкладка портала на несколько предметов */
const portalSource = fs.readFileSync("src/lib/portalContent.ts", "utf8");
const block = portalSource.match(/LEGACY_PORTALS[^{]*\{([\s\S]*?)\n\};/);
if (block) {
  const entries = [...block[1].matchAll(/([a-z_]+):\s*\{([^}]*)\}/g)].map((m) => ({
    slug: m[1],
    body: m[2],
    lectures: (m[2].match(/lectures:\s*"([a-z-]+)"/) || [])[1] || null,
    organic: /lecturesOrganic:\s*true/.test(m[2]),
  }));
  const byLectures = new Map();
  for (const entry of entries) {
    const key = `${entry.lectures ?? "-"}|${entry.organic}`;
    const list = byLectures.get(key) ?? [];
    list.push(entry.slug);
    byLectures.set(key, list);
  }
  for (const [key, slugs] of byLectures) {
    if (key === "-|false" || slugs.length < 2) continue;
    report("Дубль вкладки", `набор лекций ${key} подключён к предметам: ${slugs.join(", ")}`);
  }
}

/* Итог */
if (!problems.length) {
  console.log("Дубли и битый контент: не найдены");
  process.exit(0);
}
const byKind = new Map();
for (const problem of problems) {
  const list = byKind.get(problem.kind) ?? [];
  list.push(problem.message);
  byKind.set(problem.kind, list);
}
for (const [kind, messages] of byKind) {
  console.log(`\n${kind} (${messages.length}):`);
  for (const message of messages) console.log(`  - ${message}`);
}
console.log(`\nВсего проблем: ${problems.length}`);
process.exit(1);
