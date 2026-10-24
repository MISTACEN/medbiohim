// Импорт мини-порталов (этап 6): химия-шпаргалка (sdf), латинский язык
// («100 рецептов»), HTML-лекции course/ → public/content/portals.
//
// Запуск: node tools/portals/import_mini_portals.mjs [srcDir]
// По умолчанию srcDir = <workspace>/на сайт

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(REPO, "public", "content", "portals");
const srcDir = process.argv[2] || path.join(path.dirname(REPO), "на сайт");

function stubWindow() {
  const noop = () => {};
  const elStub = new Proxy(function () {}, {
    get: () => elStub,
    apply: () => elStub,
    set: () => true,
  });
  return {
    document: {
      getElementById: () => elStub,
      querySelector: () => elStub,
      querySelectorAll: () => [],
      addEventListener: noop,
      createElement: () => elStub,
      body: elStub,
    },
    window: { addEventListener: noop, location: { href: "" } },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: "import" },
    alert: noop,
    console,
  };
}

function runIsolated(code, name, tail = "") {
  const sandbox = vm.createContext({ ...stubWindow(), result: undefined });
  vm.runInContext(`${code}\n;result = (${tail});`, sandbox, { filename: name });
  return sandbox.result;
}

function save(name, data) {
  fs.mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 1), "utf8");
  console.log(`  ${name}: ${(fs.statSync(file).size / 1024).toFixed(0)} КБ`);
}

// ---------- 1. Химия (sdf): шпаргалка + тесты с пояснениями + билеты ----------

function extractBodyHtml(html) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  let out = body ? body[1] : html;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  return out.trim();
}

function importSdf() {
  console.log("Химия: шпаргалка + тесты + билеты (sdf):");
  const code = fs.readFileSync(path.join(srcDir, "sdf", "script.js"), "utf8");
  const { testsRaw, ticketsRaw } = runIsolated(code, "sdf/script.js", "({ testsRaw: typeof tests !== 'undefined' ? tests : {}, ticketsRaw: typeof ticketsData !== 'undefined' ? ticketsData : {} })");

  const tests = Object.entries(testsRaw).map(([id, t]) => ({
    id: `sdf-test-${id}`,
    title: `Тест ${id}`,
    questions: (t?.questions || []).map((q, i) => ({
      id: `sdf-test-${id}-q${i + 1}`,
      text: q.text,
      options: (q.options || []).map((o) => o.text),
      correct: (q.options || []).findIndex((o) => o.value === q.correct),
      explanation: q.explanation || "",
    })),
  }));
  const tickets = Object.entries(ticketsRaw).map(([id, items]) => ({
    id: `sdf-ticket-${id}`,
    title: `Вариант ${id.replace("_", " · задание ")}`,
    items: (items || []).map((it) => ({ q: it.q, solution: it.solution || it.answer || "" })),
  }));
  const cheatHtml = extractBodyHtml(fs.readFileSync(path.join(srcDir, "sdf", "cheat.html"), "utf8"));

  save("chem-sdf.json", {
    subject: "Неорганическая химия · шпаргалка и рубежный контроль",
    tests,
    tickets,
    cheatHtml,
    stats: { tests: tests.length, questions: tests.reduce((n, t) => n + t.questions.length, 0), tickets: tickets.length, cheatSections: (cheatHtml.match(/<h2/g) || []).length },
  });
  console.log(`    тестов: ${tests.length}, вопросов: ${tests.reduce((n, t) => n + t.questions.length, 0)}, билетов: ${tickets.length}`);
}

// ---------- 2. Латинский язык: 100 рецептов ----------

function importLatin() {
  console.log("Латинский язык (100 рецептов):");
  const html = fs.readFileSync(path.join(srcDir, "ds[byj", "miniapp.html"), "utf8");
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? "";
  const recipes = runIsolated(script, "miniapp.html", "(typeof recipes !== 'undefined' ? recipes : [])") ?? [];
  const labelsMatch = /species:\s*'Сборы'[^}]*\}/.exec(html);
  let labels = {};
  if (labelsMatch) {
    try {
      const labelsBody = labelsMatch[0].replace(/\}\s*$/, "");
      labels = vm.runInNewContext(`({${labelsBody}})`);
    } catch (e) {
      console.log("    !! не удалось распарсить метки групп:", e.message);
    }
  }
  const groups = [...new Set(recipes.map((r) => r.group))];
  save("latin-recipes.json", {
    subject: "Латинский язык · 100 рецептов (по Чернявскому)",
    groups: groups.map((g) => ({ id: g, label: labels[g] || g })),
    recipes,
    stats: { recipes: recipes.length, groups: groups.length },
  });
  console.log(`    рецептов: ${recipes.length}, групп: ${groups.length}`);
}

// ---------- 3. HTML-лекции course/ ----------

const LECTURE_SETS = [
  { file: "lectures-bio.json", subject: "Биология", dir: "bio-lec", skip: ["topic9.html"], id: "bio" },
  { file: "lectures-math.json", subject: "Математика", dir: "math-lec", skip: [], id: "math" },
  { file: "lectures-chem.json", subject: "Физическая химия", dir: "chem-lec", skip: [], id: "chem" },
];

function cleanLectureHtml(html) {
  const body = extractBodyHtml(html);
  return body
    .replace(/<a[^>]*class="back-link"[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .trim();
}

function importLectures() {
  console.log("HTML-лекции course/:");
  const labFile = path.join(srcDir, "course", "chemlab", "lab1.html");
  const lab = fs.existsSync(labFile)
    ? [{ id: "chem-lab-1", title: "Лабораторная: константа диссоциации слабого электролита", html: cleanLectureHtml(fs.readFileSync(labFile, "utf8")) }]
    : [];
  for (const set of LECTURE_SETS) {
    const dir = path.join(srcDir, "course", set.dir);
    const items = [];
    for (const fname of fs.readdirSync(dir).filter((f) => f.endsWith(".html") && !set.skip.includes(f)).sort()) {
      const html = fs.readFileSync(path.join(dir, fname), "utf8");
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      const title = h1 ? h1[1].replace(/<[^>]+>/g, "").trim() : fname;
      items.push({ id: `${set.id}-${fname.replace(".html", "")}`, title, html: cleanLectureHtml(html) });
    }
    if (set.id === "chem") items.push(...lab);
    save(set.file, { subject: set.subject, items, stats: { lectures: items.length } });
    console.log(`    ${set.subject}: ${items.length} тем`);
  }
}

importSdf();
console.log();
importLatin();
console.log();
importLectures();
console.log("\nГотово → public/content/portals/");
