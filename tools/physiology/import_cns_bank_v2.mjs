// Синхронизация банка физиологии ЦНС v2 (294 задания с эталонами и
// РАЗВЁРНУТЫМИ пояснениями) из методички с банком платформы.
//
// Источник: Desktop-папка подготовки ЦНС, файл 05_Банк_тестов_294_с_ответами_и_пояснениями.md
// (тот же, из которого собран RAG-корпус тьютора).
//
// Что делает:
//   1. Парсит md: блоки «**N. вопрос** / ✅ **K) эталон** / 📖 пояснение».
//   2. Сопоставляет вопрос с существующей записью questions
//      (нормализация текста: без хвостовых «…»/«______»/пунктуации).
//   3. Совпавшим проставляет explanation (официальное пояснение кафедры:
//      механизм + почему остальные не подходят + 💡ловушки + ⚠спорные).
//   4. Проверяет эталон: если ключ md противоречит options в БД — помечает
//      в отчёте (не молча перезаписывает: ключ кафедры приоритетен только
//      вместе с вариантом).
//   5. Вопросы, которых нет в БД (294−279=15), в отчёт — вариантов в md нет,
//      импортировать MCQ без вариантов нельзя.
//
// Запуск: node tools/physiology/import_cns_bank_v2.mjs [--dir=<папка>] [--dry]

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");
const DIR = (process.argv.find((a) => a.startsWith("--dir=")) || "").slice("--dir=".length)
  || path.join(os.homedir(), "Desktop", "физиологии", "подготовка_ЦНС");
const FILE = path.join(DIR, "05_Банк_тестов_294_с_ответами_и_пояснениями.md");

// ЦНС-набор, который синхронизируем (Банк тестовых заданий по разделам физиологии ЦНС).
const CNS_TESTSET_KEY = "phys_testset:9186bbcba851";

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const ABBREV = {
  "пд": "потенциал действия", "впсп": "возбуждающий постсинаптический потенциал",
  "тпсп": "тормозной постсинаптический потенциал", "кбп": "кора больших полушарий",
  "рф": "ретикулярная формация", "внс": "вегетативная нервная система",
  "снс": "симпатическая нервная система", "пснс": "парасимпатическая нервная система",
  "ах": "ацетилхолин", "на": "норадреналин", "ахэ": "ацетилхолинэстераза",
  "кс": "кора больших полушарий", "цнс": "центральная нервная система",
  "ко": "канал обратной связи", "мос": "механизмы",
};

/** Нормализация + раскрытие аббревиатур + токены для словарного сопоставления. */
function normalize(text) {
  let t = String(text || "")
    .toLowerCase()
    .replace(/[«»„“”]/g, "")
    .replace(/[_\.…]+$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  for (const [abbr, full] of Object.entries(ABBREV)) {
    t = t.replace(new RegExp("\b" + abbr + "\b", "gu"), full);
  }
  return t;
}

/** Грубая основа слова для сверки падежных форм («дендриты»≈«дендритов»). */
function stem(text) {
  return normalize(text).split(" ").map((w) => w.slice(0, Math.max(4, Math.min(w.length, 7)))).join(" ");
}

function tokens(text) {
  return normalize(text).split(" ").filter((w) => w.length > 2);
}

/** Доля токенов md-вопроса, найденных в db-тексте (и наоборот, минимум). */
function similarity(mdText, dbText) {
  const a = tokens(mdText), b = new Set(tokens(dbText));
  if (!a.length || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit += 1;
  return hit / a.length;
}

/** Парсинг md-банка: номер → { text, keyNumber, keyLabel, explanation }. */
function parseBank(raw) {
  const items = [];
  const re = /\*\*(\d+)\.\s*([^*]+)\*\*\s*\n✅\s*\*\*(\d)\)\s*([^*]+)\*\*\s*\n📖\s*([\s\S]*?)(?=\n\n\*\*\d+\.|\n---|\n##|$)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const text = m[2].replace(/\s+/g, " ").trim();
    const keyNumber = Number(m[3]);
    const keyLabel = m[4].replace(/\s+/g, " ").trim();
    const explanation = m[5].replace(/\r\n/g, "\n").trim();
    if (text.length < 8) continue;
    items.push({ n: Number(m[1]), text, keyNumber, keyLabel, explanation });
  }
  return items;
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env.local");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const raw = fs.readFileSync(FILE, "utf8");
  const bank = parseBank(raw);
  console.log(`распознано вопросов в md: ${bank.length}`);

  // 1) все вопросы ЦНС-набора из БД
  const tRow = await fetch(`${url}/rest/v1/tests?select=id&source_key=eq.${CNS_TESTSET_KEY}&limit=1`, { headers }).then((r) => r.json());
  const testId = tRow?.[0]?.id;
  if (!testId) throw new Error(`ЦНС-набор не найден: ${CNS_TESTSET_KEY}`);
  const tq = await fetch(`${url}/rest/v1/test_questions?select=question_id,order_index&test_id=eq.${testId}&order=order_index`, { headers });
  if (!tq.ok) throw new Error(`test_questions: ${tq.status} ${await tq.text()}`);
  const links = await tq.json();
  const ids = links.map((l) => l.question_id);
  console.log(`в ЦНС-наборе связок: ${ids.length}`);

  const dbRows = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).map((id) => `"${id}"`).join(",");
    const r = await fetch(`${url}/rest/v1/questions?select=id,text,answer,options,explanation&id=in.(${chunk})`, { headers });
    if (!r.ok) throw new Error(`questions: ${r.status} ${await r.text()}`);
    dbRows.push(...await r.json());
  }
  console.log(`загружено вопросов из БД: ${dbRows.length}`);

  // 2) сопоставление: exact по нормализации, иначе лучший по словарному
  // пересечению (md-версия перефразирована: «ПД» vs «потенциал действия»).
  const byNorm = new Map();
  for (const row of dbRows) byNorm.set(normalize(row.text), row);

  let matched = 0, keyMismatch = 0, alreadyOk = 0, unmatched = [];
  const mismatchSamples = [];
  const updates = [];
  for (const item of bank) {
    let row = byNorm.get(normalize(item.text));
    if (!row) {
      let best = null, bestScore = 0;
      for (const dbRow of dbRows) {
        const score = similarity(item.text, dbRow.text);
        if (score > bestScore) { bestScore = score; best = dbRow; }
      }
      if (best && bestScore >= 0.55) row = best;
    }
    if (!row) { unmatched.push(item); continue; }
    const rawOpts = Array.isArray(row.options) ? row.options : [];
    const opts = rawOpts.map((o) => (typeof o === "string" ? { label: o, correct: false } : o));
    // ГЛАВНАЯ починка: в этом банке БД correct-флаги вариантов сдвинуты
    // (текст answer верен, а флаг стоит не на том варианте). Сопоставляем
    // md-эталон с вариантами по грубой основе слова и ПЕРЕСТАВЛЯЕМ флаг.
    // Если ни один вариант не сматчился — в отчёт (не угадываем).
    const keyStem = stem(item.keyLabel);
    // Иерархия сверки эталона с вариантами: точная основа → единственное
    // «содержит» → иначе не угадываем (в отчёт). Жадный includes ловил
    // «дендриты и аксон» вместе с «дендриты».
    const exactStem = opts.map((o) => stem(o.label || "") === keyStem);
    const exactCount = exactStem.filter(Boolean).length;
    let newOptions = null;
    if (exactCount === 1) {
      newOptions = opts.map((o, i) => ({ ...o, correct: exactStem[i] }));
    } else if (exactCount === 0) {
      const kw = keyStem.split(" ").filter((w) => w.length > 3);
      const fuzzy = opts.map((o) => {
        const ow = stem(o.label || "").split(" ");
        if (!ow.length) return false;
        const hit = kw.filter((w) => ow.some((x) => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))).length;
        return kw.length ? hit / kw.length >= 0.6 : false;
      });
      if (fuzzy.filter(Boolean).length === 1) newOptions = opts.map((o, i) => ({ ...o, correct: fuzzy[i] }));
    }
    const answerText = `Верный ответ: ${item.keyNumber}) ${item.keyLabel}`;
    if (!opts.length || !newOptions) {
      keyMismatch += 1;
      if (mismatchSamples.length < 200) mismatchSamples.push({ n: item.n, mdKey: item.keyLabel.slice(0, 34), dbCorrect: (opts.filter((o) => o.correct).map((o) => (o.label || "").slice(0, 22)).join(" | ") || "-"), text: item.text.slice(0, 60) });
      matched += 1;
      continue;
    }
    matched += 1;
    if (row.explanation && row.explanation.trim() === item.explanation && !newOptions.some((o, i) => JSON.stringify(o) !== JSON.stringify(opts[i])) && String(row.answer || "").trim() === answerText) { alreadyOk += 1; continue; }

    updates.push({
      id: row.id, n: item.n, explanation: item.explanation, options: newOptions, answerText,
      needsOptions: JSON.stringify(opts) !== JSON.stringify(newOptions),
      needsAnswer: String(row.answer || "").trim() !== answerText,
    });
  }

  console.log(`сопоставлено: ${matched}, уже с пояснением: ${alreadyOk}, эталон-расхождений: ${keyMismatch}, нет в БД: ${unmatched.length}`);
  if (mismatchSamples.length) {
    console.log("эталон-расхождения (md-ключ vs варианты БД) — проверить руками:");
    for (const s2 of mismatchSamples) console.log(`  #${s2.n} md=${s2.mdKey} db_correct=[${s2.dbCorrect}] ${s2.text}`);
  }
  if (unmatched.length) {
    console.log("нет в БД (вариантов в md нет — импорт MCQ невозможен):");
    for (const u of unmatched.slice(0, 20)) console.log(`  #${u.n}: ${u.text.slice(0, 70)}`);
  }

  if (DRY) { console.log("dry — без записи"); return; }

  // 3) запись explanation
  let written = 0, flagsFixed = 0, answerFixed = 0;
  for (const u of updates) {
    const patch = { explanation: u.explanation };
    if (u.needsOptions) { patch.options = u.options; flagsFixed += 1; }
    if (u.needsAnswer) { patch.answer = u.answerText; answerFixed += 1; }
    const r = await fetch(`${url}/rest/v1/questions?id=eq.${u.id}`, {
      method: "PATCH", headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (r.ok) written += 1;
    else console.error(`! не записан #${u.n}: ${r.status}`);
  }
  console.log(`записано вопросов: ${written} из ${updates.length}`);
  console.log(`починено correct-флагов: ${flagsFixed}, обновлено answer-строк: ${answerFixed}`);
  if (keyMismatch) console.log(`⚠ не сматчился эталон (варианты БД vs md): ${keyMismatch} — оставить как есть, проверить вручную`);
}

main().catch((e) => { console.error(e); process.exit(1); });
