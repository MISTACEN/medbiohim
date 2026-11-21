import type { Env } from "../../../env";
import { ok } from "../../../lib/response";
import { decodeBase64Url } from "./text";
import type { ImageExtract } from "./text";
import { fetchWithTimeout } from "../../../lib/fetch-with-timeout";

/**
 * Расшифровка аудио в текст (roadmap 2.5.2 «конспект из записи»): Groq Whisper.
 * Расшифровка идёт в тот же конспект-промпт, что и PDF/фото. Groq выбран потому,
 * что whisper-large-v3 у него быстрый (×200 realtime) и ключ уже есть у воркера.
 * Без GROQ_API_KEY — честный 503 AUDIO_NOT_CONFIGURED.
 */
export async function transcribeAudio(env: Env, base64: string, mime: string, filename: string): Promise<ImageExtract> {
  const key = String(env.GROQ_API_KEY || "").trim();
  if (!key) {
    return { text: "", code: "AUDIO_NOT_CONFIGURED", message: "Расшифровка аудио не настроена на сервере" };
  }
  const bytes = decodeBase64Url(base64);
  const form = new FormData();
  form.append("file", new Blob([bytes as never], { type: mime || "audio/mpeg" }), filename || "audio.mp3");
  form.append("model", "whisper-large-v3");
  form.append("language", "ru");
  form.append("response_format", "json");
  form.append("temperature", "0");
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("[ai:transcribe]", res.status, detail);
    if (res.status === 401 || res.status === 403) {
      return { text: "", code: "AUDIO_NOT_CONFIGURED", message: "Расшифровка аудио недоступна (ключ отклонён)" };
    }
    return { text: "", code: "TRANSCRIBE_FAILED", message: "Не удалось расшифровать аудио — попробуйте другой формат (mp3/m4a/wav)" };
  }
  const payload = await res.json().catch(() => null) as { text?: string } | null;
  return { text: String(payload?.text || "").trim(), code: "ok", message: "" };
}

/**
 * Текст с фото: сначала мультимодальный Gemini (читает фото сам), при его
 * отсутствии — настроенный OCR-шлюз (тот же, что в Мастерской). Если не настроено
 * ничего — возвращаем подсказку, а не пустой ответ.
 */

/**
 * Текст с фото: сначала мультимодальный Gemini (читает фото сам), при его
 * отсутствии — настроенный OCR-шлюз (тот же, что в Мастерской). Если не настроено
 * ничего — возвращаем подсказку, а не пустой ответ.
 */
export async function extractImageText(env: Env, base64: string, mime: string): Promise<ImageExtract> {
  const region = String(env.AI_BACKEND_REGION || "ru").trim().toLowerCase();
  const proxyReady = Boolean(env.GEMINI_VERCEL_PROXY_URL && env.GEMINI_VERCEL_PROXY_SECRET);
  const model = String(env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  const prompt = "Это фото страницы конспекта/слайда/учебника по медицине. Перепиши весь видимый текст дословно в markdown: заголовки, списки, таблицы. Формулы — латиницей. Ничего не добавляй от себя, неразборчивые места помечай [неразборчиво].";
  if (env.GEMINI_API_KEY && (region !== "ru" || proxyReady)) {
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "x-goog-api-key": String(env.GEMINI_API_KEY).trim(), "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok) {
      const payload: any = await response.json().catch(() => null);
      const text = (payload?.candidates?.[0]?.content?.parts || []).map((part: any) => String(part?.text || "")).join("").trim();
      if (text) return { text, code: "", message: "" };
    } else {
      console.error("[ai:notes-gemini]", response.status);
    }
  }
  const ocrEndpoint = String(env.OCR_API_URL || "").trim();
  if (ocrEndpoint) {
    const response = await fetchWithTimeout(ocrEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.OCR_API_KEY ? { authorization: "Bearer " + String(env.OCR_API_KEY).trim() } : {}),
      },
      body: JSON.stringify({
        model: env.OCR_MODEL || "xiaomi-ocr-0",
        temperature: 0,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: "data:" + mime + ";base64," + base64 } },
        ] }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const payload: any = await response.json().catch(() => null);
    const text = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (text) return { text, code: "", message: "" };
    console.error("[ai:notes-ocr]", response.status);
  }
  return {
    text: "",
    code: "VISION_NOT_CONFIGURED",
    message: "Распознавание фото не настроено на сервере. Загрузите PDF с текстовым слоем или текстовый файл.",
  };
}

/**
 * Парсинг вердикта экзаменатора. Провайдеры иногда оборачивают JSON в
 * markdown-код-блок или добавляют прозу — вырезаем первое валидное вхождение.
 */
