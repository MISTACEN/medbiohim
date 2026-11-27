/**
 * ИИ-проверка свободного ответа (Gemini, бесплатный тариф).
 *
 * Правило из концепции (§12) и реестра требований (CHEM-10): ИИ помогает
 * разобрать формулировку, но не заменяет точную проверку и не выдаёт ложную
 * точность. Поэтому здесь только узкая задача «ответ и эталон — одно и то же?»
 * с обязательным JSON-ответом и уверенностью; вызывается лишь когда
 * детерминированные правила уже сказали «не совпало».
 */
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

type AiEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
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
  return Boolean(String(env.GEMINI_API_KEY || "").trim());
}

const SYSTEM = [
  "Ты проверяешь ответ студента по гистологии.",
  "Тебе дают эталонное название препарата (или структуры) и ответ студента.",
  "Задача: решить, называет ли студент ТОТ ЖЕ объект, пусть другими словами.",
  "Правила: другой препарат, другая ткань или пустой ответ — incorrect;",
  "тот же объект с иной формулировкой/опечаткой/порядком слов — correct;",
  "сомневаешься — unsure и confidence ниже 0.6.",
  "Ответ строго JSON без пояснений вокруг:",
  '{"verdict":"correct|partial|incorrect|unsure","confidence":0.0,"reason":"кратко по-русски"}',
].join(" ");

function parseJson(raw: string): AiTextGrade | null {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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

/** `null` — ИИ недоступен или ответил мусором; вызывающий код остаётся при правилах. */
export async function aiCompareAnswer(input: {
  answer: string;
  target: string;
  prompt: string;
  env: AiEnv;
}): Promise<AiTextGrade | null> {
  if (!aiGradingEnabled(input.env)) return null;
  const model = String(input.env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  const key = String(input.env.GEMINI_API_KEY || "").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      // Ответ студента — данные, а не инструкции: он приходит одним абзацем
      // вместе с эталоном, поэтому выполнить его как команду нельзя.
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  `Задание: ${input.prompt}`,
                  `Эталон: ${input.target}`,
                  `Ответ студента: ${input.answer}`,
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 200 },
      }),
      timeoutMs: 9000,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => String(part.text || "")).join("") || "";
    return parseJson(text);
  } catch {
    return null;
  }
}
