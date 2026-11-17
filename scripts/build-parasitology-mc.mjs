// Собирает MC-банк паразитологии (членистоногие) из текстового источника
// `вопросы.txt`: вопросы с вариантами А/Б/В/Г и строкой «Правильный ответ: X».
//
// В файле две части: первая — с ответами, вторая — тот же набор без ответов.
// Берём только вопросы, у которых есть ответ, поэтому дубль отбрасывается сам.
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3];
const INDEX = process.argv[4];
if (!SRC || !OUT || !INDEX) {
  console.error("usage: node build-parasitology-mc.mjs <вопросы.txt> <mc-*.json> <mc-index.json>");
  process.exit(2);
}

const LETTERS = ["А", "Б", "В", "Г"];
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);

let species = null;
let current = null;
const questions = [];

const flush = () => {
  if (!current) return;
  if (current.options.length >= 2 && current.correctLetter) {
    const idx = LETTERS.indexOf(current.correctLetter);
    if (idx >= 0 && idx < current.options.length) {
      questions.push({
        id: questions.length + 1,
        text: current.text,
        options: current.options,
        correct: idx,
        topic: current.species || undefined,
      });
    }
  }
  current = null;
};

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;

  // «1. Ixodes persulcatus (таёжный иксодовый клещ)» — заголовок вида,
  // но не «1.2. …» (это уже вопрос).
  const head = line.match(/^\d+\.\s+(?!\d)(.+)$/);
  if (head && !/^\d+\.\s/.test(head[1])) {
    flush();
    species = head[1].trim();
    continue;
  }

  const q = line.match(/^(?:Вопрос\s*)?\d+\.\d+[.)]?\s*(.+)$/);
  if (q) {
    flush();
    current = { species, text: q[1].trim(), options: [], correctLetter: null };
    continue;
  }

  if (!current) continue;

  const opt = line.match(/^([А-Г])\)\s*(.+)$/);
  if (opt && !current.correctLetter) {
    current.options.push(opt[2].trim());
    continue;
  }

  // Без \b: в JS граница слова строится по ASCII, после кириллической буквы не срабатывает.
  const ans = line.match(/^Правильный ответ:\s*([А-Г])/);
  if (ans) {
    current.correctLetter = ans[1];
    flush();
    continue;
  }
}
flush();

// уникальность по тексту вопроса
const seen = new Set();
const unique = questions.filter((q) => {
  const key = q.text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const bank = {
  id: "biology-parasitology-arthropods-mc",
  title: "Паразитология · членистоногие — тест",
  subject: "Биология",
  subjectId: "biology",
  topic: "Паразитология",
  questions: unique,
};

fs.writeFileSync(OUT, JSON.stringify(bank, null, 1) + "\n", "utf8");

// регистрация в индексе MC-тестов (замена существующей записи с тем же id)
const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
index.tests = index.tests.filter((t) => t.id !== bank.id);
index.tests.push({
  id: bank.id,
  title: bank.title,
  subject: bank.subject,
  subjectId: bank.subjectId,
  topic: bank.topic,
  count: bank.questions.length,
});
fs.writeFileSync(INDEX, JSON.stringify(index, null, 1) + "\n", "utf8");

const topics = new Set(unique.map((q) => q.topic).filter(Boolean));
console.log(`вопросов: ${unique.length} (отброшено дублей/без ответа: ${questions.length - unique.length})`);
console.log(`тем (видов): ${topics.size}`);
console.log(`вариантов на вопрос: ${[...new Set(unique.map((q) => q.options.length))].join(", ")}`);
console.log(`файл: ${path.basename(OUT)} (${fs.statSync(OUT).size} B)`);
console.log(`индекс: ${index.tests.length} тестов`);
