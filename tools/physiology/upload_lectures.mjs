// Загрузка лекций по физиологии из public/content/lectures/physiology/*.md
// в site_content(key=lectures) — тот же стор, откуда их читает /lectures.
//
// Формат файла: frontmatter (id, title, topic, summary, order) + markdown-тело.
// Идемпотентно: запись ищется по id и заменяется.
//
// Запуск: node tools/physiology/upload_lectures.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(REPO, "public", "content", "lectures", "physiology");
const DRY = process.argv.includes("--dry");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function parse(file) {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`нет frontmatter: ${file}`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: m[2].trim() };
}

function toLecture(meta, body) {
  return {
    id: meta.id,
    media: [],
    title: meta.title,
    topic: meta.topic,
    status: meta.status || "published",
    body_md: body,
    subject: "physiology",
    summary: meta.summary || "",
    body_html: "",
    attachments: [],
    lesson_type: "lecture",
    subject_slug: "physiology",
    related_learning: { files: [], methodics: [], preparations: [], electronograms: [] },
  };
}

(async () => {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env.local");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
  const fresh = files.map((f) => {
    const { meta, body } = parse(f);
    return toLecture(meta, body);
  });

  const res = await fetch(`${url}/rest/v1/site_content?key=eq.lectures&select=payload`, { headers });
  if (!res.ok) throw new Error(`select ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  const payload = rows[0]?.payload;
  const items = Array.isArray(payload) ? payload : payload?.items || [];
  const byId = new Map(items.map((x) => [String(x.id), x]));

  let added = 0;
  for (const lecture of fresh) {
    const existing = byId.get(lecture.id);
    if (!existing) added += 1;
    byId.set(lecture.id, {
      ...(existing || {}),
      ...lecture,
      created_at: existing?.created_at || new Date().toISOString(),
      created_by: existing?.created_by || null,
      reviewed_by: existing?.reviewed_by || null,
      published_at: existing?.published_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Порядок в ответе API = порядок в payload, поэтому группируем занятия
  // по модулю и номеру в теме, иначе свежие лекции липнут в конец списка.
  const merged = [...byId.values()].sort((a, b) => {
    const key = (x) => [String(x.subject_slug || x.subject || ""), String(x.topic || ""), String(x.title || "")];
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < ka.length; i += 1) {
      const cmp = ka[i].localeCompare(kb[i], "ru");
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  for (const l of fresh) {
    const blocks = (l.body_md.match(/^### /gm) || []).length;
    console.log(`${l.id} | ${blocks} блоков | ${l.body_md.length} знаков | ${l.title.slice(0, 70)}`);
  }
  console.log(`файлов: ${fresh.length}, новых: ${added}, всего лекций: ${merged.length}`);

  if (DRY) return;
  const body = JSON.stringify({ payload: Array.isArray(payload) ? merged : { ...payload, items: merged } });
  const patch = await fetch(`${url}/rest/v1/site_content?key=eq.lectures`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body,
  });
  if (!patch.ok) throw new Error(`patch ${patch.status}: ${await patch.text()}`);
  console.log("записано в site_content");
})();
