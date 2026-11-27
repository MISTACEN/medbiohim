/**
 * ИИ-проверка свободного ответа.
 *
 * Правило из концепции (§12) и реестра требований (CHEM-10): ИИ помогает разобрать
 * формулировку, но не заменяет точную проверку и не выдаёт ложную точность.
 *
 * Провайдеры: сначала Workers AI (внутри Cloudflare, без egress и ключей), затем
 * Gemini — и только если регион не RU, иначе запрос к Google блокируется.
 *
 * Ответ модели разбирается терпимо: маленькие модели добавляют «Ответ:» и точки,
 * поэтому ищем слово ДА/НЕТ/НЕЗНАЮ в любом месте, а JSON поддерживаем отдельно.
 */
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

export type AiEnv = {
  AI?: unknown;
  CLOUDFLARE_AI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_VERCEL_PROXY_URL?: string;
  AI_BACKEND_REGION?: string;
  AI_TEXT_GRADING?: string;
};

export type AiTextGrade = {
  verdict: "correct" | "partial" | "incorrect" | "unsure";
  confidence: number;
  reason: string;
};

/** Диагностика одного вызова: нужна, чтобы отличить «нет ИИ» от «не разобрали ответ». */
export type AiDebug = {
  provider: "workers-ai" | "gemini" | "none";
  ok: boolean;
  /** Сырой ответ модели (обрезан): только про ответ студента, без секретов. */
  raw?: string;
  error?: string;
};

export type AiResult = { grade: AiTextGrade | null; debug: AiDebug };

/** Флаг окружения: `off` отключает ИИ, не трогая остальную проверку. */
export function aiGradingEnabled(env: AiEnv): boolean {
  const flag = String(env.AI_TEXT_GRADING ?? "on").trim().toLowerCase();
  if (["off", "0", "false", "no"].includes(flag)) return false;
  const workersAi = Boolean(env.AI && typeof (env.AI as { run?: unknown }).run === "function");
  return workersAi || Boolean(String(env.GEMINI_API_KEY || "").trim());
}

const SYSTEM = [
  "Ты проверяешь ответ студента по гистологии.",
  "Тебе дают эталонное название препарата (или структуры) и ответ студента.",
  "Реши, называют ли они ОДИН И ТОТ ЖЕ объект.",
  "Ответь одним словом, без пояснений и без кавычек:",
  "ДА — тот же объект, пусть другими словами, с опечаткой или иным порядком слов;",
  "НЕТ — другой препарат, другая ткань или пустой ответ;",
  "НЕЗНАЮ — если сомневаешься.",
].join(" ");

function parseJson(raw: string): AiTextGrade | null {
  const cleaned = String(raw || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const verdict = String(value.verdict || "").toLowerCase();
    if (!["correct", "partial", "incorrect", "unsure"].includes(verdict)) return null;
    const confidence = Number(value.confidence);
    return {
      verdict: verdict as AiTextGrade["verdict"],
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
      reason: String(value.reason || "").slice(0, 240),
    };
  } catch {
    return null;
  }
}

/**
 * Разбор ответа модели. Порядок важен: «НЕ ЗНАЮ» содержит «ЗНАЮ», а «НЕТ» —
 * короткое слово, которое легко встретить в пояснении, поэтому смотрим на первое
 * смысловое слово, а при прозе вокруг — на маркер в начале строки.
 */
export function parseVerdict(raw: string): AiTextGrade | null {
  const asJson = parseJson(raw);
  if (asJson) return asJson;

  const word = String(raw || "")
    .toUpperCase()
    .replace(/[^А-ЯЁA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!word) return null;

  // Берём первые три слова: «ОТВЕТ ДА», «ДА ЭТО МИТОЗ» тоже должны сработать.
  const head = word.split(" ").slice(0, 3).join(" ");
  if (/^НЕ\s*ЗНА|^UNSURE|НЕ\s*ЗНА/.test(head)) {
    return { verdict: "unsure", confidence: 0.5, reason: "ИИ: нужна ручная проверка" };
  }
  if (/(^|\s)ДА(\s|$)|(^|\s)YES(\s|$)/.test(head)) {
    return { verdict: "correct", confidence: 0.8, reason: "ИИ: тот же объект другими словами" };
  }
  if (/(^|\s)НЕТ(\s|$)|(^|\s)NO(\s|$)/.test(head)) {
    return { verdict: "incorrect", confidence: 0.8, reason: "ИИ: назван другой объект" };
  }
  return null;
}

function userPrompt(input: { answer: string; target: string; prompt: string }): string {
  return [`Задание: ${input.prompt}`, `Эталон: ${input.target}`, `Ответ студента: ${input.answer}`].join("\n");
}

/**
 * Кандидаты моделей: Cloudflare выводит старые из эксплуатации (например,
 * `llama-3.1-8b-instruct-fp8` отключён 2026-11-20), а `CLOUDFLARE_AI_MODEL`
 * в проде может остаться прежним. Пробуем по порядку и берём первый живой.
 */
const WORKERS_AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.2-3b-instruct",
];

async function viaWorkersAi(input: {
  answer: string;
  target: string;
  prompt: string;
  env: AiEnv;
}): Promise<AiResult> {
  const ai = input.env.AI as
    | { run?: (model: string, payload: unknown) => Promise<unknown> }
    | undefined;
  if (!ai || typeof ai.run !== "function") {
    return { grade: null, debug: { provider: "none", ok: false, error: "AI binding missing" } };
  }
  const configured = String(input.env.CLOUDFLARE_AI_MODEL || "").trim();
  const models = [configured, ...WORKERS_AI_MODELS].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index,
  );
  let lastError = "run failed";
  for (const model of models) {
    try {
      const request = ai.run(model, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(input) },
        ],
        temperature: 0,
        max_tokens: 32,
        stream: false,
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000),
      );
      const response = (await Promise.race([request, timeout])) as
        | string
        | { response?: string }
        | null;
      const content = typeof response === "string" ? response : String(response?.response || "");
      const grade = parseVerdict(content);
      if (grade) {
        return {
          grade,
          debug: { provider: "workers-ai", ok: true, raw: `${model}: ${content.slice(0, 120)}` },
        };
      }
      lastError = `unparsed (${model})`;
    } catch (error) {
      lastError = `${model}: ${error instanceof Error ? error.message.slice(0, 100) : "run failed"}`;
    }
  }
  return { grade: null, debug: { provider: "workers-ai", ok: false, error: lastError.slice(0, 180) } };
}

async function viaGemini(input: {
  answer: string;
  target: string;
  prompt: string;
  env: AiEnv;
}): Promise<AiResult> {
  const key = String(input.env.GEMINI_API_KEY || "").trim();
  if (!key) return { grade: null, debug: { provider: "none", ok: false, error: "no key" } };
  const model = String(input.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(input) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32 },
      }),
      timeoutMs: 8000,
    });
    if (!response.ok) {
      return { grade: null, debug: { provider: "gemini", ok: false, error: `http ${response.status}` } };
    }
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => String(part.text || "")).join("") || "";
    const grade = parseVerdict(text);
    return {
      grade,
      debug: {
        provider: "gemini",
        ok: Boolean(grade),
        raw: text.slice(0, 160),
        ...(grade ? {} : { error: "unparsed" }),
      },
    };
  } catch (error) {
    return {
      grade: null,
      debug: {
        provider: "gemini",
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 120) : "fetch failed",
      },
    };
  }
}

/** `grade: null` — ИИ недоступен или не разобрали ответ; правила остаются в силе. */
export async function aiCompareAnswer(input: {
  answer: string;
  target: string;
  prompt: string;
  env: AiEnv;
}): Promise<AiResult> {
  if (!aiGradingEnabled(input.env)) {
    return { grade: null, debug: { provider: "none", ok: false, error: "disabled" } };
  }

  const workers = await viaWorkersAi(input);
  if (workers.grade) return workers;

  const region = String(input.env.AI_BACKEND_REGION || "ru").trim().toLowerCase();
  if (region === "ru" && !input.env.GEMINI_VERCEL_PROXY_URL) {
    return workers.debug.provider === "none" ? workers : { grade: null, debug: workers.debug };
  }
  return viaGemini(input);
}
