// Собирает public/content/portals/parasitology-tests.json из источника
// default-workspace/на сайт/паразиты/script.js (48 видов, 8 параметров).
// Старые тесты (из biotestkr) сохраняются как есть.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SRC = process.argv[2];
const BANK = process.argv[3];
if (!SRC || !BANK) {
  console.error("usage: node gen-parasitology-bank.mjs <script.js> <bank.json>");
  process.exit(2);
}

const src = fs.readFileSync(SRC, "utf8");
const cut = src.indexOf("function generateOptions");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src.slice(0, cut) + "\n;globalThis.__out=allParasites;", sandbox);

const raw = sandbox.__out;
const CLASS_LABEL = {
  trematoda: "Трематоды",
  cestoda: "Цестоды",
  nematoda: "Нематоды",
  arthropoda: "Членистоногие",
};

// Поля answers -> колонки таблицы. Порядок как в исходном «полном» разборе.
const PARAMS = [
  ["egg", "Яйца / диагностические признаки"],
  ["lifecycle", "Жизненный цикл"],
  ["route", "Путь заражения, фактор передачи"],
  ["invasive", "Инвазионная стадия"],
  ["location", "Локализация"],
  ["diag", "Методы диагностики"],
  ["distrib", "Распространение"],
  ["prevention", "Профилактика"],
];

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim() || "—";

// В источнике часть видов повторяется (haemaphysalis, dermacentor и т.п.):
// оставляем запись с наибольшим числом заполненных полей, при равенстве — первую.
const byId = new Map();
for (const item of raw) {
  const filled = Object.values(item.answers || {}).filter((v) => clean(v) !== "—").length;
  const quiz = (item.quizQuestions || []).length;
  const prev = byId.get(item.id);
  if (!prev || filled + quiz > prev.score) byId.set(item.id, { item, score: filled + quiz });
}
const species = [...byId.values()].map((v) => v.item);

function buildTest(id, title, items) {
  return {
    id,
    title,
    columns: [
      { key: "species", label: "Вид (возбудитель)" },
      { key: "group", label: "Класс" },
      ...PARAMS.map(([key, label]) => ({ key, label })),
    ],
    rows: items.map((p) => {
      const row = {
        species: clean(p.name) + (p.forExam ? " · КР" : ""),
        group: CLASS_LABEL[p.className] || clean(p.className),
      };
      for (const [key] of PARAMS) row[key] = clean(p.answers?.[key]);
      return row;
    }),
    quiz: items.flatMap((p) =>
      (p.quizQuestions || []).map((q) => ({
        species: clean(p.name),
        text: clean(q.text),
        options: (q.options || []).map(clean),
        correct: q.correct,
      })),
    ),
  };
}

const helminths = species.filter((p) => p.className !== "arthropoda");
const arthropods = species.filter((p) => p.className === "arthropoda");

const bank = JSON.parse(fs.readFileSync(BANK, "utf8"));
const KEEP = new Set(["parasitology-helminths", "parasitology-arthropods"]);
bank.tests = bank.tests.filter((t) => !KEEP.has(t.id));
bank.tests.push(buildTest("parasitology-helminths", "Гельминты · 18 видов", helminths));
bank.tests.push(buildTest("parasitology-arthropods", "Членистоногие · 30 видов", arthropods));

fs.writeFileSync(BANK, JSON.stringify(bank, null, 1) + "\n", "utf8");

// Отчёт
const totalQuiz = species.reduce((n, p) => n + (p.quizQuestions || []).length, 0);
console.log(`источник: ${raw.length} записей -> ${species.length} уникальных видов`);
console.log(`гельминты: ${helminths.length}, членистоногие: ${arthropods.length}`);
console.log(`видов с КР-вопросами: ${species.filter((p) => (p.quizQuestions || []).length).length}, вопросов: ${totalQuiz}`);
console.log(`банк: ${bank.tests.length} тестов, ${bank.tests.reduce((n, t) => n + t.rows.length, 0)} строк`);
console.log(`файл: ${path.basename(BANK)} (${fs.statSync(BANK).size} B)`);
