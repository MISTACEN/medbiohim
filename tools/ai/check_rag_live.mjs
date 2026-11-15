// Живая проверка отбора RAG на том, что реально приходит из Supabase в
// buildLectureContext: строки histology_lectures (id, title, body_markdown,
// subject_slug) — с quiz-блоками, mermaid, base64 и прочей разметкой.
//
// Запуск: node tools/ai/check_rag_live.mjs [тема=physiology]
// Читает .env.local (DB_URL) — как остальные tools.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const subject = process.argv[2] || "physiology";

const env = {};
for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(
  "select id, title, body_markdown, subject_slug from histology_lectures where is_published = true and subject_slug = $1",
  [subject],
);
await client.end();

const { pathToFileURL: ptfu } = await import("node:url");
const { selectLectureExcerpts } = await import(ptfu(path.join(REPO, "workers/api/src/lib/lecture-rag.ts")).href);

const corpus = rows.map((r) => ({
  id: String(r.id),
  title: String(r.title || ""),
  body: String(r.body_markdown || ""),
  subjectSlug: r.subject_slug ?? null,
}));

console.log(`корпус ${subject}: ${corpus.length} лекций, средний размер ${Math.round(corpus.reduce((s, l) => s + l.body.length, 0) / Math.max(1, corpus.length))} знаков`);

const CHECKS = subject === "physiology"
  ? [
      ["Объясни механизм гемолиза эритроцитов", /лейкоцит|кров/i, /мышц|рефлекс|сокращени/i],
      ["Почему при гипотонии эритроциты набухают и разрушаются?", /кров|эритроцит/i, /мышц|рефлекс/i],
      ["Что происходит с пищей в желудке?", /пищевар|желуд/i, /кров|мышц/i],
      ["Что такое потенциал покоя и потенциал действия?", /потенциал|клетк|возбудим/i, /кров/i],
    ]
  : [
      ["Строение эритроцита и лейкоцита", /кров/i, /костн|лимф/i],
      ["Как устроен спинной мозг?", /нерв/i, /кров|мышц/i],
      ["Чем миелиновое нервное волокно отличается от безмиелинового?", /нерв/i, /кров/i],
    ];

let problems = 0;
for (const [query, wantRe, forbidRe] of CHECKS) {
  const picked = selectLectureExcerpts(corpus, query);
  const titles = picked.map((p) => `${p.title} (rel=${p.relevance.toFixed(2)}, anch=${p.anchor >= 0 ? "ok" : "нет"})`);
  const bad = picked.filter((p) => forbidRe.test(p.title) && !wantRe.test(p.title));
  if (bad.length) problems += 1;
  console.log(`\nQ: ${query}${bad.length ? "  ← ЛИШНИЙ ИСТОЧНИК" : ""}`);
  for (const t of titles) console.log(`  - ${t}`);
}

// Разметка БД не должна ломать якорь: якорь указывает на вхождение основы,
// а не внутрь ```quiz/mermaid JSON.
const quizHeavy = corpus.filter((l) => /```quiz|```mermaid|data:image/.test(l.body)).length;
console.log(`\nлекций со сложной разметкой (quiz/mermaid/data-uri): ${quizHeavy}`);
console.log(problems ? `ПРОБЛЕМЫ: ${problems}` : "все проверки пройдены");
process.exit(0);
