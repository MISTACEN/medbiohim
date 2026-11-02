import { Hono } from "hono";
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/**
 * Инструменты автора: извлечение текста из PDF и OCR сканов.
 *
 * PDF разбирается здесь же (unpdf уже используется в Мастерской). OCR — это
 * внешний шлюз: Xiaomi-OCR-0 не запускается в Workers, и у модели нет hosted
 * API, поэтому Worker только проксирует запрос к своему vLLM/Ollama
 * (OpenAI-совместимый `/v1/chat/completions`). Без OCR_API_URL ручка честно
 * отвечает 503 и подсказывает, что настроить.
 */
const myTools = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_BASE64 = 12_000_000;
const DEFAULT_OCR_PROMPT =
  "Convert this page to Markdown. Keep reading order, headings, lists and tables. " +
  "Write formulas as LaTeX inside $...$. Return only the document, no commentary.";

function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

async function bodyJson(c: any) {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Текст PDF для импорта в лекцию: страницы склеиваются, пустые символы убираются. */
myTools.post("/extract-pdf", requireAuth, async (c) => {
  const rid = requestId();
  const input = await bodyJson(c);
  const base64 = String(input?.content_base64 || "").replace(/^data:[^,]+,/, "");
  if (!base64) return error(c, rid, 422, "VALIDATION_ERROR", "Передайте PDF в content_base64");
  if (base64.length > MAX_BASE64) return error(c, rid, 413, "PAYLOAD_TOO_LARGE", "PDF больше 8 МБ — разбейте его на части");
  try {
    const document = await getDocumentProxy(decodeBase64(base64));
    const { text } = await extractText(document, { mergePages: true });
    const cleaned = String(text || "").replace(/\u0000/g, "").trim();
    if (!cleaned) {
      return error(c, rid, 422, "EMPTY_DOCUMENT", "В PDF нет текстового слоя. Это скан — используйте OCR по изображению.");
    }
    return c.json(ok({ text: cleaned.slice(0, 400000), chars: cleaned.length }, rid));
  } catch (failure: any) {
    console.error("[my-tools:extract-pdf]", failure?.message);
    return error(c, rid, 422, "PDF_PARSE_FAILED", "Не удалось прочитать PDF: файл повреждён или защищён паролем");
  }
});

/** OCR изображения через настроенный внешний шлюз (vLLM / Ollama с Xiaomi-OCR-0). */
myTools.post("/ocr", requireAuth, async (c) => {
  const rid = requestId();
  const input = await bodyJson(c);
  const image = String(input?.image_base64 || "").replace(/^data:[^,]+,/, "");
  if (!image) return error(c, rid, 422, "VALIDATION_ERROR", "Передайте изображение в image_base64");
  if (image.length > 8_000_000) return error(c, rid, 413, "PAYLOAD_TOO_LARGE", "Изображение больше 6 МБ — уменьшите его");

  const endpoint = String(c.env.OCR_API_URL || "").trim();
  if (!endpoint) {
    return error(
      c,
      rid,
      503,
      "OCR_NOT_CONFIGURED",
      "OCR-шлюз не настроен. Xiaomi-OCR-0 работает только на своём GPU-сервере: задайте OCR_API_URL (vLLM/Ollama, /v1/chat/completions) и OCR_API_KEY."
    );
  }

  const mime = String(input?.mime || "image/png");
  const dataUrl = "data:" + mime + ";base64," + image;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(c.env.OCR_API_KEY ? { authorization: "Bearer " + c.env.OCR_API_KEY } : {}),
      },
      body: JSON.stringify({
        model: c.env.OCR_MODEL || "xiaomi-ocr-0",
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: String(input?.prompt || DEFAULT_OCR_PROMPT) },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[my-tools:ocr]", response.status, String(payload?.error?.message || "").slice(0, 200));
      return error(c, rid, 502, "OCR_FAILED", "OCR-сервер вернул ошибку " + response.status);
    }
    const text = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (!text) return error(c, rid, 502, "OCR_EMPTY", "OCR не вернул текст — попробуйте другое фото или угол съёмки");
    return c.json(ok({ text: text.slice(0, 400000), chars: text.length }, rid));
  } catch (failure: any) {
    console.error("[my-tools:ocr]", failure?.message);
    return error(c, rid, 502, "OCR_FAILED", "Не удалось связаться с OCR-сервером");
  }
});

export default myTools;
