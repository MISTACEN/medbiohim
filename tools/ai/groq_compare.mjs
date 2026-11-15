// Сравнение Groq openai/gpt-oss-20b и openai/gpt-oss-120b на учебных вопросах
// физиологии: качество, соблюдение сносок [N], время ответа.
//
// Запуск: node tools/ai/groq_compare.mjs [кол-во вопросов]
// Ключ читается из .env.local (GROQ_API_KEY), как в остальных tools.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COUNT = Number(process.argv[2] || 6);

const env = {};
for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
if (!env.GROQ_API_KEY) throw new Error("нет GROQ_API_KEY в .env.local");

const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
await client.connect();
// Берём лекцию «Возбудимые ткани» как RAG-контекст + 6 вопросов по ней.
const lectures = await client.query(
  "select id, title, body_markdown from histology_lectures where is_published = true and subject_slug = 'physiology' and title ilike '%возбудим%' limit 1",
);
const lecture = lectures.rows[0];
if (!lecture) throw new Error("лекция «Возбудимые ткани» не найдена");
const fragment = String(lecture.body_markdown || "").replace(/```[\s\S]*?```/g, " ").slice(0, 2500);

const questions = await client.query(
  "select text from questions where subject_id = (select id from subjects where slug='physiology') and is_published and type='mcq' and (text ilike '%потенциал покоя%' or text ilike '%потенциал действия%' or text ilike '%деполяризация%') limit $1",
  [COUNT],
);
await client.end();
if (!questions.rows.length) throw new Error("вопросы не найдены");

const SYSTEM = "Ты — AI-тьютор платформы «Медбиохим». Отвечай по-русски. Если ниже «Материалы курса», опирайся на них и ставь маркер [1] после утверждений из фрагмента. Не выдумывай. Кратко.";

async function ask(model, question) {
  const started = Date.now();
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM + "\n\nМатериалы курса:\n[1] Лекция «" + lecture.title + "»:\n" + fragment },
        { role: "user", content: question },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const ms = Date.now() - started;
  if (!response.ok) return { ms, ok: false, status: response.status };
  const payload = await response.json();
  const text = String(payload?.choices?.[0]?.message?.content || "").trim();
  return {
    ms,
    ok: true,
    cites: (text.match(/\[\d+\]/g) || []).length,
    length: text.length,
    text,
  };
}

const MODELS = [
  { name: "gpt-oss-20b (текущая)", id: "openai/gpt-oss-20b" },
  { name: "gpt-oss-120b", id: "openai/gpt-oss-120b" },
];

const results = {};
for (const model of MODELS) {
  results[model.id] = [];
  for (const q of questions.rows) {
    try {
      const r = await ask(model.id, String(q.text).slice(0, 300));
      results[model.id].push({ question: String(q.text).slice(0, 70), ...r });
    } catch (e) {
      results[model.id].push({ question: String(q.text).slice(0, 70), ok: false, error: String(e.message).slice(0, 80) });
    }
  }
}

for (const model of MODELS) {
  const rows = results[model.id];
  const okRows = rows.filter((r) => r.ok);
  const avgMs = Math.round(okRows.reduce((s, r) => s + r.ms, 0) / Math.max(1, okRows.length));
  const withCites = okRows.filter((r) => r.cites > 0).length;
  console.log(`\n=== ${model.name} ===`);
  console.log(`ответов: ${okRows.length}/${rows.length}, среднее время: ${avgMs} мс, ответов со сносками [N]: ${withCites}`);
  for (const r of rows) {
    console.log(`  [${r.ms} мс, сносок ${r.cites ?? "—"}, ${r.length ?? r.error ?? ""} зн] ${r.question}`);
  }
}

// Пример ответа 120b на первый вопрос — для eyeball-сравнения качества.
const first = questions.rows[0];
console.log(`\n=== Пример ответа 120b на: ${String(first.text).slice(0, 70)}`);
console.log(results[MODELS[1].id][0]?.text?.slice(0, 700) || "(нет)");
