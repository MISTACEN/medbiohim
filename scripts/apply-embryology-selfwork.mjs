/**
 * Применяет фенсы «Подготовка к самостоятельной» и «Режим экзамена» к лекции
 * hist-03-embriologiya в public.histology_lectures.
 *
 * В БД кладутся только фенсы (```selfwork / ```exam с lectureId) и заголовки
 * § 7/§ 8 — сам контент вопросов живёт в репозитории
 * (src/lib/histology/embryologySelfWork.ts) и подключается по lectureId.
 *
 * Поведение:
 *   node scripts/apply-embryology-selfwork.mjs          — dry-run (по умолчанию),
 *   node scripts/apply-embryology-selfwork.mjs --apply  — PATCH body_markdown.
 *
 * Идемпотентность: перед записью проверяется маркер
 * `<!-- MBH:SELFWORK:hist-03-embriologiya -->`. Если он уже есть — печатается
 * "already applied" и ничего не пишется.
 *
 * Секреты берутся из .env.local и НИКОГДА не печатаются.
 * Трогает ТОЛЬКО строку id = hist-03-embriologiya.
 */

const LECTURE_ID = "hist-03-embriologiya";
const TABLE = "histology_lectures";
const MARKER = `<!-- MBH:SELFWORK:${LECTURE_ID} -->`;

/** Текст добавки. Один и тот же в dry-run, --apply и SQL-миграции. */
const APPENDIX = [
  MARKER,
  `## § 7. Подготовка к самостоятельной (открытые вопросы)`,
  "",
  "Интерактив: только открытые вопросы без вариантов ответа — письменный ответ, проверка с разбором ошибок, образцовый ответ и повторное прохождение вопросов, где были ошибки.",
  "",
  "```selfwork",
  `{"lectureId": "${LECTURE_ID}"}`,
  "```",
  "",
  `## § 8. Режим экзамена (самостоятельная работа)`,
  "",
  "Интерактив: три задания как на реальной самостоятельной — осевые органы по памяти, электронограмма половой клетки (определить и подписать структуры) и развёрнутый теоретический вопрос; оценка 3/4/5 с пояснениями.",
  "",
  "```exam",
  `{"lectureId": "${LECTURE_ID}"}`,
  "```",
  "",
].join("\n");

/* ── аргументы ───────────────────────────────────────────────────────────── */

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const help = args.has("--help") || args.has("-h");

if (help) {
  console.log(`Использование: node scripts/apply-embryology-selfwork.mjs [--apply]

  без флагов  dry-run: показывает, что будет добавлено, и ничего не пишет;
  --apply     PATCH body_markdown для ${LECTURE_ID}.`);
  process.exit(0);
}

/* ── окружение (ключи не печатаем) ───────────────────────────────────────── */

function loadEnv() {
  const envFile = process.env.MBH_ENV_FILE || ".env.local";
  try {
    process.loadEnvFile(envFile);
    console.log(`env: загружен ${envFile}`);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : error?.message;
    console.log(`env: ${envFile} не загружен (${code}); использую переменные процесса`);
  }
}

function requireEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  console.error(`error: не задано ни одной из переменных: ${names.join(", ")} (см. .env.local)`);
  process.exit(1);
}

loadEnv();

const base = requireEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]).replace(/\/+$/, "");
const serviceKey = requireEnv(["SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"]);
const restBase = `${base}/rest/v1/${TABLE}`;

/* ── REST ────────────────────────────────────────────────────────────────── */

async function rest(query, { method = "GET", body, prefer } = {}) {
  const url = `${restBase}?${query}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: response.ok, status: response.status, data, text };
}

function failWithResponse(prefix, response) {
  console.error(`${prefix}: HTTP ${response.status}`);
  // Тело Supabase-ответа содержит только служебную информацию; ключи мы не печатаем.
  const body = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
  if (body) console.error(`body: ${body}`);
  process.exit(1);
}

/* ── основная логика ─────────────────────────────────────────────────────── */

const selectQuery = `id=eq.${encodeURIComponent(LECTURE_ID)}&select=id,body_markdown`;

console.log(`${apply ? "APPLY" : "DRY-RUN"} · таблица ${TABLE} · строка ${LECTURE_ID}`);
console.log(`GET ${restBase}?${selectQuery}`);

let current;
try {
  current = await rest(selectQuery);
} catch (error) {
  console.error(`error: не удалось выполнить GET: ${error?.message ?? error}`);
  process.exit(1);
}
if (!current.ok) failWithResponse("error: GET не удался", current);

const rows = Array.isArray(current.data) ? current.data : [];
if (rows.length === 0) {
  console.error(`error: строка id=${LECTURE_ID} не найдена в ${TABLE} — ничего не меняю`);
  process.exit(1);
}
if (rows.length > 1) {
  console.error(`error: id=${LECTURE_ID} вернул ${rows.length} строк — отказ от записи`);
  process.exit(1);
}

const before = String(rows[0].body_markdown ?? "");

if (before.includes(MARKER)) {
  console.log(`already applied: маркер ${MARKER} уже есть в body_markdown (${before.length} символов) — запись не нужна`);
  process.exit(0);
}

const separator = before.trim().length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
const after = `${before}${separator}${APPENDIX}`;
const delta = after.length - before.length;

if (!apply) {
  console.log("Маркер MBH:SELFWORK отсутствует — добавка будет записана в КОНЕЦ body_markdown.");
  console.log(`Длина body_markdown: до ${before.length} → после ${after.length} (+${delta} символов).`);
  console.log("");
  console.log("--- Начало добавляемых строк ---");
  console.log(APPENDIX);
  console.log("--- Конец добавляемых строк ---");
  console.log("");
  console.log("ЗАПИСЬ НЕ ВЫПОЛНЕНА (--dry-run по умолчанию).");
  console.log(`Для применения: node scripts/apply-embryology-selfwork.mjs --apply`);
  process.exit(0);
}

console.log(`PATCH ${restBase}?id=eq.${encodeURIComponent(LECTURE_ID)} (Prefer: return=minimal)`);
let patched;
try {
  patched = await rest(`id=eq.${encodeURIComponent(LECTURE_ID)}`, {
    method: "PATCH",
    // updated_at — как в SQL-миграции: правка контента должна быть видна в метаданных.
    body: { body_markdown: after, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
} catch (error) {
  console.error(`error: не удалось выполнить PATCH: ${error?.message ?? error}`);
  process.exit(1);
}
if (!patched.ok) failWithResponse("error: PATCH не удался", patched);

console.log(`✓ применено: ${LECTURE_ID}, body_markdown ${before.length} → ${after.length} (+${delta} символов)`);
console.log(`  маркер: ${MARKER}`);
