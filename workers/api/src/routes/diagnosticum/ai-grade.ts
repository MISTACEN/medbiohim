/**
 * ИИ-проверка свободного ответа.
 *
 * Правило из концепции (§12) и реестра требований (CHEM-10): ИИ помогает
 * разобрать формулировку, но не заменяет точную проверку и не выдаёт ложную
 * точность. Задача узкая — «ответ и эталон называют один объект?» — с ответом
 * в JSON и уверенностью; вызывается только когда правила уже сказали «не совпало».
 *
 * Порядок провайдеров: сначала Workers AI (работает внутри Cloudflare, без
 * внешнего egress и ключей), затем Gemini — и только если регион не RU, иначе
 * запрос к Google блокируется и время тратится зря.
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

/** Маленькие модели надёжнее отвечают одним словом, чем JSON: сначала слово. */
function parseVerdict(raw: string): AiTextGrade | null {
  const asJson = parseJson(raw);
  if (asJson) return asJson;
  const word = String(raw || "")
    .toUpperCase()
    .replace(/[^А-ЯЁA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!word) return null;
  // Границы слов: `\b` не работает для кириллицы (в JS \w — только латиница).
  if (/^ДА(?![А-ЯЁ])|^YES(?![A-Z])/.test(word)) {
    return { verdict: "correct", confidence: 0.8, reason: "ИИ: тот же объект другими словами" };
  }
  if (/^НЕ\s*ЗНА/.test(word) || /^UNSURE(?![A-Z])/.test(word)) {
    return { verdict: "unsure", confidence: 0.5, reason: "ИИ: нужна ручная проверка" };
  }
  if (/^НЕТ(?![А-ЯЁ])|^NO(?![A-Z])/.test(word)) {
    return { verdict: "incorrect", confidence: 0.8, reason: "ИИ: назван другой объект" };
  }
  return null;
}

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

function userPrompt(input: { answer: string; target: string; prompt: string }): string {
  return [`Задание: ${input.prompt}`, `Эталон: ${input.target}`, `Ответ студента: ${input.answer}`].join("\n");
}

/**
 * Workers AI напрямую через биндинг: без импорта `lib/workers-ai`, чтобы этот
 * модуль оставался чистым (его импортируют и тесты, которым не нужен Env).
 */
async function viaWorkersAi(input: { answer: string; target: string; prompt: string; env: AiEnv }) {
  const ai = input.env.AI as
    | { run?: (model: string, payload: unknown) => Promise<unknown> }
    | undefined;
  if (!ai || typeof ai.run !== "function") return null;
  const model = String(input.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fp8").trim();
  try {
    const request = ai.run(model, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt(input) },
      ],
      temperature: 0,
      max_tokens: 16,
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
    return parseVerdict(content);
  } catch {
    return null;
  }
}

async function viaGemini(input: { answer: string; target: string; prompt: string; env: AiEnv }) {
  const key = String(input.env.GEMINI_API_KEY || "").trim();
  if (!key) return null;
  const model = String(input.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(input) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 16 },
      }),
      timeoutMs: 8000,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => String(part.text || "")).join("") || "";
    return parseVerdict(text);
  } catch {
    return null;
  }
}

/** `null` — ИИ недоступен или ответил мусором; вызывающий код остаётся при правилах. */
export async function aiCompareAnswer(input: {
  answer: string;
  target: string;
  prompt: string;
  env: AiEnv;
}): Promise<AiTextGrade | null> {
  if (!aiGradingEnabled(input.env)) return null;

  const workers = await viaWorkersAi(input);
  if (workers) return workers;

  const region = String(input.env.AI_BACKEND_REGION || "ru").trim().toLowerCase();
  if (region === "ru" && !input.env.GEMINI_VERCEL_PROXY_URL) return null;
  return viaGemini(input);
}
