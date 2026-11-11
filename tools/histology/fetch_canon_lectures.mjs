// Выгрузка канонических лекций гистологии (hist-00…hist-08) из Supabase
// в markdown-исходники public/content/lectures/histology/<id>.md.
//
// Режим строго read-only: два SELECT (схема таблицы + строки), никаких записей.
//
// Запуск: node tools/histology/fetch_canon_lectures.mjs [--out=DIR]
//
// Окружение: DB_URL берётся из .env.local (см. loadEnv, паттерн
// tools/physiology/apply_recovered_answers.mjs). Значения никогда не печатаются.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.resolve(
  REPO,
  (process.argv.find((a) => a.startsWith("--out=")) || "--out=public/content/lectures/histology").slice("--out=".length),
);

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function slugTopic(id) {
  // hist-05 → занятие 05 (однозначно по двум последним цифрам id)
  const n = String(id).replace(/\D+/g, "").padStart(2, "0");
  return `Гистология · занятие ${n}`;
}

function htmlToMarkdown(html) {
  let s = String(html);
  s = s.replace(/\r\n?/g, "\n");
  // Часто используемые теги таблицы — в markdown
  s = s.replace(/<table[^>]*>/gi, "\n\n<table>\n");
  s = s.replace(/<\/table>/gi, "\n</table>\n\n");
  s = s.replace(/<br\s*\/?>(\s*\n)?/gi, "\n");
  s = s.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**");
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*");
  s = s.replace(/<li[^>]*>/gi, "- ");
  s = s.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  // Оставшиеся пары блочных тегов — вырезать теги, сохранив текст
  s = s.replace(/<[^>]+>/g, "");
  // Развёртка HTML-сущностей
  const ents = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&laquo;": "«", "&raquo;": "»", "&mdash;": "—", "&ndash;": "–", "&times;": "×", "&deg;": "°" };
  for (const [k, v] of Object.entries(ents)) s = s.split(k).join(v);
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  // Уборка лишних пустых строк
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function frontmatter(id, title, topic, summary) {
  const esc = (t) => String(t).replace(/\s+/g, " ").trim();
  return [
    "---",
    `id: ${esc(id)}`,
    `title: ${esc(title)}`,
    `topic: ${esc(topic)}`,
    `summary: ${esc(summary)}`,
    "---",
  ].join("\n");
}

(async () => {
  loadEnv();
  if (!process.env.DB_URL) throw new Error("нет DB_URL в .env.local");
  const client = new pg.Client({
    connectionString: process.env.DB_URL.replace(/\?sslmode=\w+/, ""),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // 1) Узнаём реальные колонки таблицы (read-only)
  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'histology_lectures' ORDER BY ordinal_position",
  );
  const colNames = cols.rows.map((r) => r.column_name);
  console.log("columns:", colNames.join(", "));

  const titleCol = ["title", "name", "topic_title"].find((c) => colNames.includes(c));
  const bodyCol = ["body_markdown", "body_md", "body", "content_md", "content"].find((c) => colNames.includes(c));
  const summaryCol = colNames.includes("summary") ? "summary" : colNames.includes("description") ? "description" : null;
  if (!titleCol || !bodyCol) throw new Error("не найдены колонки title/body: " + colNames.join(","));

  // 2) Канонические лекции hist-00…hist-08 (hist-09 — экзаменационные задачи,
  //    не является лекцией: убираем, чтобы не конфликтовать с лекцией недели 9)
  const rows = await client.query(
    `SELECT id, ${titleCol} AS title, ${summaryCol ? summaryCol + " AS summary," : "NULL AS summary,"} ${bodyCol} AS body
     FROM histology_lectures
     WHERE id ~ '^hist-0[0-8]'
     ORDER BY id`,
  );
  console.log(`rows fetched: ${rows.rows.length}`);

  fs.mkdirSync(OUT, { recursive: true });
  for (const r of rows.rows) {
    const id = String(r.id).trim();
    const title = String(r.title || id).trim();
    const summary = String(r.summary || title).replace(/\s+/g, " ").trim();
    const raw = String(r.body || "");
    const looksHtml = /<\/?(p|div|table|ul|ol|li|br|h[1-6]|strong|em)\b/i.test(raw);
    const body = looksHtml ? htmlToMarkdown(raw) : raw.replace(/\r\n?/g, "\n").trim();
    const md = frontmatter(id, title, slugTopic(id), summary) + "\n\n" + body + "\n";
    const file = path.join(OUT, `${id}.md`);
    fs.writeFileSync(file, md);
    console.log(`${id}.md — ${md.split("\n").length} lines, title: ${title}`);
  }

  await client.end();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
