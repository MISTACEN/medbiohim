#!/usr/bin/env node
/**
 * Аудит каталога лекций: заглушки, дубли и записи, которые не дошли до студентов.
 *
 * Повод: в публичном каталоге накопились короткие конспекты (1–3 заголовка) и
 * повторы тем, а опубликованное в редакторе (site_content:lectures) вообще не
 * попадало в таблицу, из которой читают студенты (histology_lectures).
 *
 * Запуск:  node scripts/audit-lecture-catalog.mjs
 * Лечение: node scripts/audit-lecture-catalog.mjs --fix
 *
 * --fix снимает с публикации только заглушки и дубли (is_published = false),
 * данные не удаляются. Ключи берутся из .env.local и не печатаются.
 */
import fs from "node:fs";

const FIX = process.argv.includes("--fix");
// --sync переносит опубликованное в редакторе в каталог студентов (без заглушек).
const SYNC = process.argv.includes("--sync");
const MIN_CHARS = 8000;
const MIN_HEADINGS = 3;

function loadEnv() {
  const env = {};
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^(?:неделя|недели)\s*[\d\s.,–\-—/]*/i, "")
    .replace(/(?:лекция|лекции|практика|семинар)\s*[\d\s.,–\-—/·]*/gi, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

const stats = (body) => {
  const text = String(body || "");
  return {
    chars: text.replace(/<!--[\s\S]*?-->/g, "").replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim().length,
    headings: (text.match(/^#{1,6} /gm) || []).length,
  };
};

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY_EXTRA || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY в .env.local");
    process.exit(2);
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const publicRows = await (await fetch(`${url}/rest/v1/histology_lectures?select=id,subject_slug,title,body_markdown,is_published&limit=500`, { headers })).json();
  if (!Array.isArray(publicRows)) throw new Error("histology_lectures: " + JSON.stringify(publicRows).slice(0, 200));
  const editorRows = await (await fetch(`${url}/rest/v1/site_content?key=eq.lectures&select=payload`, { headers })).json();
  const editorItems = editorRows?.[0]?.payload?.items || [];

  const published = publicRows.filter((row) => row.is_published !== false);
  const stubs = published.filter((row) => {
    const s = stats(row.body_markdown);
    return row.subject_slug === "histology" && s.chars < MIN_CHARS && s.headings <= MIN_HEADINGS;
  });

  const byTitle = new Map();
  for (const row of published) {
    const k = normalizeTitle(row.title);
    if (!k) continue;
    byTitle.set(k, [...(byTitle.get(k) || []), row]);
  }
  const duplicates = [...byTitle.entries()].filter(([, rows]) => rows.length > 1);

  const mergedStillPublished = published.filter((row) => /MBH:MERGED:INTO/i.test(String(row.body_markdown || "")));

  const publicIds = new Set(publicRows.map((row) => String(row.id)));
  const unpublishedEditorLectures = editorItems.filter(
    (item) => item.status === "published" && !publicIds.has(String(item.id))
  );

  console.log(`Всего строк: ${publicRows.length} | опубликовано: ${published.length} | в редакторе: ${editorItems.length}`);
  console.log(`\nЗаглушки (histology, < ${MIN_CHARS} символов и <= ${MIN_HEADINGS} заголовков): ${stubs.length}`);
  for (const row of stubs) {
    const s = stats(row.body_markdown);
    console.log(`  - ${row.id} · ${s.chars} симв. · ${s.headings} заг. · ${String(row.title).slice(0, 60)}`);
  }

  console.log(`\nДубли по названию: ${duplicates.length}`);
  for (const [title, rows] of duplicates) {
    console.log(`  - «${title}»: ${rows.map((r) => r.id).join(", ")}`);
  }

  console.log(`\nС маркером переноса, но опубликованы: ${mergedStillPublished.length}`);
  for (const row of mergedStillPublished) console.log(`  - ${row.id}`);

  console.log(`\nОпубликованы в редакторе, но отсутствуют в каталоге студентов: ${unpublishedEditorLectures.length}`);
  for (const item of unpublishedEditorLectures.slice(0, 20)) {
    console.log(`  - ${item.id} · ${String(item.title).slice(0, 60)}`);
  }

  if (SYNC && unpublishedEditorLectures.length) {
    const ready = unpublishedEditorLectures.filter((item) => {
      const s = stats(item.body_md || item.body_markdown);
      return s.chars >= MIN_CHARS;
    });
    const skipped = unpublishedEditorLectures.length - ready.length;
    if (ready.length) {
      const rows = ready.map((item) => ({
        id: String(item.id),
        subject_slug: String(item.subject_slug || "histology"),
        title: String(item.title || "").slice(0, 500),
        body_markdown: String(item.body_md || item.body_markdown || ""),
        kind: "written_lecture",
        is_published: true,
        updated_at: new Date().toISOString(),
      }));
      const res = await fetch(`${url}/rest/v1/histology_lectures`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(rows),
      });
      const saved = await res.json();
      console.log(`
--sync: перенесено в каталог ${Array.isArray(saved) ? saved.length : 0} из ${rows.length}`);
    }
    if (skipped) console.log(`--sync: пропущено коротких записей ${skipped} (сначала дополните текст)`);
  }

  const problems = stubs.length + duplicates.length + mergedStillPublished.length;
  if (FIX && problems) {
    const ids = [...stubs, ...mergedStillPublished, ...duplicates.flatMap(([, rows]) => rows)].map((row) => row.id);
    const unique = [...new Set(ids)];
    const res = await fetch(`${url}/rest/v1/histology_lectures?id=in.(${unique.map(encodeURIComponent).join(",")})`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ is_published: false, updated_at: new Date().toISOString() }),
    });
    const patched = await res.json();
    console.log(`\n--fix: снято с публикации ${Array.isArray(patched) ? patched.length : 0} из ${unique.length}`);
  }

  if (problems && !FIX) console.log("\nЕсть проблемы. Лечение: node scripts/audit-lecture-catalog.mjs --fix");
  process.exit(problems ? 1 : 0);
}

main().catch((error) => {
  console.error("Аудит не выполнен:", error?.message || error);
  process.exit(2);
});
