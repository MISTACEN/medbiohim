/**
 * Deterministic helpers and an AI-backed classifier for Telegram group messages.
 *
 * Основной провайдер — Cloudflare Workers AI (без ключей и сертификатов).
 * GigaChat остаётся опциональным: его можно включить через AI_SORT_PROVIDER,
 * но по умолчанию бот не зависит от внешней TLS-цепочки.
 *
 * Модель решает категорию, заголовок, краткое описание, предмет и задачи;
 * сроки никогда не выдумываются — они извлекаются из текста `parseDueAt`
 * и принимаются только при явной дате/слове срока.
 */
import type { Env } from "../env";
import { GigaChatError, gigachatComplete, gigachatConfigured } from "./gigachat.ts";
import { WorkersAiError, workersAiComplete, workersAiConfigured } from "./workers-ai.ts";

export type TelegramCategory = "homework" | "material_candidate" | "schedule" | "other";

export type Classification = {
  category: TelegramCategory;
  confidence: number;
  title: string;
  summary: string;
  subjectHint: string | null;
  dueHint: string | null;
  tasks: string[];
  reason: string;
  provider: "cloudflare" | "gigachat" | "rules";
  model: string | null;
};

const HOMEWORK_SIGNALS = [
  "дз", "домашн", "задани", "сделать", "выучить", "прочитать", "решить", "подготовить",
  "написать", "составить", "сдать", "принести", "к следующ", "к семинар", "к практик",
  "к лаб", "контрольн", "коллоквиум", "экзамен", "зачёт", "зачет", "билет", "параграф",
  "упражн", "страниц", "ответить на вопрос", "прочитать главу", "рабочая тетрадь",
];
// Явное учебное действие + объект — сильный признак даже без слова «дз».
const ACTION_VERBS = ["сделать", "выучить", "прочитать", "решить", "написать", "подготовить", "сдать", "составить", "принести"];
const ACTION_OBJECTS = ["задани", "параграф", "конспект", "упражн", "страниц", "главу", "билет", "тему", "доклад", "реферат"];
const NEGATIVE_SIGNALS = [
  "кто знает", "кто-нибудь знает", "спасибо", "кто идёт", "кто идет", "во сколько",
  "перенесли", "отмена", "отменили", "где будет", "какая аудитория", "расписание",
];
const SCHEDULE_SIGNALS = ["расписание", "перенос", "аудитори", "во сколько", "пара начинается", "занятие перенес"];

function normalized(text: string): string {
  return String(text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function looksAcademic(text: string, hasAttachment: boolean): boolean {
  const value = normalized(text);
  if (hasAttachment) return true;
  if (!value) return false;
  return [...HOMEWORK_SIGNALS, ...SCHEDULE_SIGNALS].some((needle) => value.includes(needle));
}

function clampConfidence(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function cleanLine(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanTasks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanLine(item, 160))
    .filter(Boolean)
    .slice(0, 10);
}

function firstSentence(text: string, max: number): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const match = clean.match(/^(.+?[.!?])(?:\s|$)/);
  return (match ? match[1] : clean).slice(0, max);
}

export function ruleClassification(text: string, hasAttachment: boolean): Classification {
  const value = normalized(text);
  let score = hasAttachment ? 0.22 : 0;
  for (const signal of HOMEWORK_SIGNALS) if (value.includes(signal)) score += 0.16;
  if (ACTION_VERBS.some((verb) => value.includes(verb)) && ACTION_OBJECTS.some((object) => value.includes(object))) {
    score += 0.36;
  }
  for (const signal of NEGATIVE_SIGNALS) if (value.includes(signal)) score -= 0.22;
  const schedule = SCHEDULE_SIGNALS.some((signal) => value.includes(signal));
  score = Math.max(0, Math.min(0.98, score));

  let category: TelegramCategory = "other";
  if (score >= 0.55) category = "homework";
  else if (schedule && score < 0.45) category = "schedule";
  else if (hasAttachment) category = "material_candidate";

  const title = firstSentence(text, 120) || (hasAttachment ? "Материал из Telegram" : "Сообщение из Telegram");
  const dueHintMatch = String(text || "").match(/(?:до|к|срок[^:]{0,12}:?)\s+([^.,;\n]{3,48})/i);
  return {
    category,
    confidence: category === "homework" ? score : category === "schedule" ? 0.62 : hasAttachment ? 0.45 : 0.55,
    title,
    summary: String(text || "").replace(/\s+/g, " ").trim().slice(0, 400)
      || (hasAttachment ? "Приложен учебный материал без текстового описания." : "Сообщение без текста."),
    subjectHint: null,
    dueHint: dueHintMatch ? dueHintMatch[1].trim() : null,
    tasks: [],
    reason: category === "homework" ? "rules_homework_signals" : "rules_" + category,
    provider: "rules",
    model: null,
  };
}

export function parseAiClassification(raw: string, provider: "cloudflare" | "gigachat" = "cloudflare"): Classification | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const match = withoutFence.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const allowed: TelegramCategory[] = ["homework", "material_candidate", "schedule", "other"];
  const category = allowed.includes(parsed.category) ? parsed.category as TelegramCategory : null;
  if (!category) return null;
  return {
    category,
    confidence: clampConfidence(parsed.confidence, category === "homework" ? 0.6 : 0.5),
    title: cleanLine(parsed.title, 120),
    summary: cleanLine(parsed.summary, 500),
    subjectHint: cleanLine(parsed.subject, 120) || null,
    dueHint: cleanLine(parsed.due_hint, 120) || null,
    tasks: cleanTasks(parsed.tasks),
    reason: cleanLine(parsed.reason, 200) || "ai_semantic",
    provider,
    model: null,
  };
}

function vladivostokDate(now: Date): { year: number; month: number; day: number; weekday: number } {
  // Vladivostok has no DST; UTC+10 is safe for date arithmetic.
  const shifted = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = Date.parse(date + "T12:00:00Z");
  if (Number.isNaN(parsed)) return null;
  const check = new Date(parsed);
  if (check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  return `${date}T23:59:59+10:00`;
}

/** Only explicit dates and relative day words; no invented deadlines. */
export function parseDueAt(text: string, now = new Date()): string | null {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const today = vladivostokDate(now);
  const addDays = (days: number) => {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
    return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  };
  const lower = normalized(raw);

  if (/(^|\s)послезавтра(\s|$)/.test(lower)) return addDays(2);
  if (/(^|\s)завтра(\s|$)/.test(lower)) return addDays(1);
  if (/(^|\s)сегодня(\s|$)/.test(lower)) return addDays(0);

  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const value = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (value) return value;
  }

  const numeric = raw.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : today.year;
    if (year < 100) year += 2000;
    if (day <= 31 && month <= 12) {
      let value = isoDate(year, month, day);
      if (value && Date.parse(value) < now.getTime() - 24 * 60 * 60 * 1000 && !numeric[3]) {
        value = isoDate(year + 1, month, day);
      }
      if (value) return value;
    }
  }

  const months: Record<string, number> = {
    января: 1, февраль: 2, февраля: 2, март: 3, марта: 3, апрель: 4, апреля: 4,
    май: 5, мая: 5, июнь: 6, июня: 6, июль: 7, июля: 7, август: 8, августа: 8,
    сентябрь: 9, сентября: 9, октябрь: 10, октября: 10, ноябрь: 11, ноября: 11,
    декабрь: 12, декабря: 12,
  };
  const wordDate = lower.match(/\b(\d{1,2})\s+([а-я]+)(?:\s+(20\d{2}))?\b/);
  if (wordDate && months[wordDate[2]]) {
    const year = wordDate[3] ? Number(wordDate[3]) : today.year;
    let value = isoDate(year, months[wordDate[2]], Number(wordDate[1]));
    if (value && Date.parse(value) < now.getTime() - 24 * 60 * 60 * 1000 && !wordDate[3]) {
      value = isoDate(year + 1, months[wordDate[2]], Number(wordDate[1]));
    }
    if (value) return value;
  }

  const weekdays: Record<string, number> = {
    понедельник: 1, понедельника: 1, понедельнику: 1,
    вторник: 2, вторника: 2, вторнику: 2,
    среда: 3, среды: 3, среду: 3, среде: 3,
    четверг: 4, четверга: 4, четвергу: 4,
    пятница: 5, пятницы: 5, пятницу: 5, пятнице: 5,
    суббота: 6, субботы: 6, субботу: 6, субботе: 6,
    воскресенье: 7, воскресенья: 7, воскресенью: 7,
  };
  for (const [name, target] of Object.entries(weekdays)) {
    if (new RegExp(`(^|\\s)${name}(\\s|$)`, "i").test(lower)) {
      const current = today.weekday === 0 ? 7 : today.weekday;
      let delta = (target - current + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays(delta);
    }
  }

  return null;
}

export function buildHomeworkTitle(classification: Classification, text: string): string {
  const subject = classification.subjectHint ? classification.subjectHint.trim() + ": " : "";
  const base = classification.title || firstSentence(text, 120) || "Задание из Telegram";
  return (subject + base).replace(/\s+/g, " ").slice(0, 240);
}

export function buildHomeworkDescription(classification: Classification, text: string): string {
  const parts: string[] = [];
  if (classification.summary && classification.summary !== text.trim()) parts.push(classification.summary);
  if (text.trim()) parts.push(text.trim());
  if (classification.tasks.length) parts.push("Задачи:\n" + classification.tasks.map((task) => "• " + task).join("\n"));
  parts.push("Источник: Telegram · сортировка " + classificationProviderLabel(classification.provider));
  return parts.join("\n\n").slice(0, 10_000);
}

export function classificationProviderLabel(provider: string): string {
  if (provider === "cloudflare") return "Cloudflare AI";
  if (provider === "gigachat") return "GigaChat";
  return "правилами";
}

const SYSTEM_PROMPT = `Ты — сортировщик учебной Telegram-группы медицинского вуза для платформы MEDBIOHIM.
Верни ТОЛЬКО JSON без markdown:
{"category":"homework|material_candidate|schedule|other","confidence":0.0,"title":"","summary":"","subject":"","due_hint":"","tasks":[],"reason":""}

homework — конкретное задание студентам: что сделать, выучить, прочитать, решить, подготовить, принести, сдать.
material_candidate — учебный материал/файл/фото без понятного задания.
schedule — расписание, перенос, аудитория, время занятия.
other — обсуждение, вопрос, благодарность, объявление без задания.

title — короткая суть задания до 120 символов, без воды.
summary — 1–2 предложения по делу.
subject — предмет только если он явно или однозначно следует из сообщения, иначе пустая строка.
due_hint — точная фраза срока из сообщения (например «до пятницы», «25.09»), не вычисляй дату.
tasks — конкретные пункты задания, максимум 5, если они перечислены.
reason — короткое объяснение решения.
НИКОГДА не придумывай предмет, срок, детали задания или факты, которых нет в сообщении.`;

/**
 * Срок принимается только если модель процитировала его из сообщения.
 * Иначе «завтра», придуманное моделью, стало бы реальным дедлайном.
 */
export function verifiedDueHint(hint: string | null, text: string): string | null {
  if (!hint) return null;
  const needle = normalized(hint);
  if (!needle) return null;
  return normalized(text).includes(needle) ? hint : null;
}

type AiCompletion = { content: string; model: string; provider: "cloudflare" | "gigachat" };

/** Порядок провайдеров: Cloudflare AI по умолчанию, GigaChat — только явно. */
async function completeWithAi(
  env: Env,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  fetcher?: typeof fetch,
): Promise<AiCompletion> {
  const mode = String(env.AI_SORT_PROVIDER || "cloudflare").toLowerCase();
  const order: Array<"cloudflare" | "gigachat"> = mode === "gigachat"
    ? ["gigachat"]
    : mode === "auto"
      ? ["cloudflare", "gigachat"]
      : ["cloudflare"];

  let lastError: unknown = null;
  for (const provider of order) {
    try {
      if (provider === "cloudflare" && workersAiConfigured(env)) {
        const result = await workersAiComplete(env, messages, { temperature: 0.1, maxTokens: 900 });
        return { content: result.content, model: result.model, provider: "cloudflare" };
      }
      if (provider === "gigachat" && gigachatConfigured(env)) {
        const result = await gigachatComplete(env, messages, { temperature: 0.1, maxTokens: 900, fetcher });
        return { content: result.content, model: result.model, provider: "gigachat" };
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new WorkersAiError("NOT_CONFIGURED", "No sorting provider is configured");
}

/**
 * Сортирует любое содержательное сообщение, а не только то, где эвристика
 * увидела слово «дз». Нейросеть решает, что это: задание, материал,
 * расписание или обычный разговор. Правила остаются страховкой, когда
 * провайдер недоступен или вернул невалидный JSON.
 */
export async function classifyMessage(
  env: Env,
  input: { text: string; chatTitle?: string; hasAttachment: boolean; now?: Date; fetcher?: typeof fetch }
): Promise<Classification> {
  const text = String(input.text || "").trim().slice(0, 6000);
  const fallback = ruleClassification(text, input.hasAttachment);
  if (!text) {
    // Vision is not available in Workers without a trusted GigaChat transport,
    // so an attachment-only message is stored as a material candidate, not a
    // guessed homework.
    return fallback;
  }
  if (text.startsWith("/") || !/[\p{L}]/u.test(text)) return fallback;
  const mode = String(env.AI_SORT_PROVIDER || "cloudflare").toLowerCase();
  const attempted: "cloudflare" | "gigachat" = mode === "gigachat" ? "gigachat" : "cloudflare";
  try {
    const result = await completeWithAi(env, [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          chat_title: input.chatTitle || "",
          date: (input.now || new Date()).toISOString(),
          message: text,
          has_attachment: input.hasAttachment,
          heuristic: { category: fallback.category, confidence: fallback.confidence },
        }),
      },
    ], input.fetcher);
    const parsed = parseAiClassification(result.content, result.provider);
    if (!parsed) return { ...fallback, reason: `rules_${result.provider}_invalid_json` };
    parsed.model = result.model;
    parsed.dueHint = verifiedDueHint(parsed.dueHint, text);
    if (!parsed.title) parsed.title = fallback.title;
    if (!parsed.summary) parsed.summary = fallback.summary;
    return parsed;
  } catch (error) {
    const code = error instanceof GigaChatError || error instanceof WorkersAiError
      ? error.code
      : "NOT_AVAILABLE";
    return { ...fallback, reason: `rules_${attempted}_${code.toLowerCase()}` };
  }
}

export function classificationLabel(category: string): string {
  const labels: Record<string, string> = {
    homework: "Задание",
    material_candidate: "Материал",
    schedule: "Расписание",
    other: "Другое",
  };
  return labels[category] || category || "Без категории";
}
