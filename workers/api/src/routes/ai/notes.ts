/** Конспект из файла: PDF с текстовым слоем, фото и аудио. */
import { Hono } from "hono";
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../../env";
import { ok, fail, requestId } from "../../lib/response";
import { requireAuth, type AuthVariables } from "../../middleware/auth";

import { rateLimit } from "../../lib/redis";

import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection } from "../../lib/ai-usage";

// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";
// Корпус «Подготовка к ЦНС» для RAG тьютора (только physiology, вне лекций).

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
import { decodeBase64Url, decodeBase64Text, transcribeAudio, extractImageText, trackedGeneration } from "./helpers";
import type { ChatMessage } from "./helpers";

/**
 * Конспект из файла (roadmap 2.5 MVP): фото или PDF → структурный конспект
 * markdown. PDF с текстовым слоем разбирается локально (unpdf) и конспектируется
 * любым доступным провайдером; фото требует мультимодального Gemini или
 * OCR-шлюза — без них честная 503 с подсказкой. Ответ на сервере не хранится:
 * студент сам сохраняет конспект как личную лекцию.
 */
const NOTES_MAX_BASE64 = 12_000_000;
// Аудио ограничено жёстче: тело идёт через Vercel-прокси (лимит ~4.5 МБ),
// поэтому принимаем до ~4 МБ бинарно ≈ 5.6 МБ base64.
const NOTES_AUDIO_MAX_BASE64 = 5_600_000;
/** Аудио-запись превращается в конспект (Groq Whisper) — квота в день. */
const NOTES_AUDIO_DAILY_LIMIT = 5;

ai.post("/notes-from-file", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const rl = await rateLimit(c.env, `ai:notes:${user.id}`, 10, 600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много конспектов подряд. Подождите несколько минут.", 429, rid);
    return c.json(body, status as 429);
  }
  let payload: { content_base64?: string; mime?: string; filename?: string } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const base64 = String(payload.content_base64 || "").replace(/^data:[^,]+,/, "");
  if (!base64) {
    const { body, status } = fail("VALIDATION", "Передайте файл в content_base64", 400, rid);
    return c.json(body, status as 400);
  }
  const mime = String(payload.mime || "").trim().toLowerCase();
  const filename = String(payload.filename || "").slice(0, 120);
  const isAudio = /^audio\//.test(mime) || /\.(mp3|m4a|ogg|wav|webm|mpga|flac)$/i.test(filename) || mime === "video/webm";
  if (base64.length > (isAudio ? NOTES_AUDIO_MAX_BASE64 : NOTES_MAX_BASE64)) {
    const { body, status } = fail(
      "PAYLOAD_TOO_LARGE",
      isAudio ? "Аудио больше 4 МБ — сожмите запись (mp3 64 кбит/с ≈ 8 минут в 4 МБ) и попробуйте снова" : "Файл больше 8 МБ — разбейте его на части",
      413,
      rid,
    );
    return c.json(body, status as 413);
  }
  if (isAudio) {
    // Отдельная дневная квота: расшифровка дороже чтения PDF.
    const audioQuota = await aiDailyQuota(c.env, "notes_audio", user.id);
    if (!audioQuota.allowed) {
      await logAiQuotaRejection(c.env, {
        route: "POST /ai/notes-from-file",
        feature: "notes_audio",
        userId: user.id,
        requestId: rid,
      });
      const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(audioQuota, "notes_audio"), 429, rid);
      return c.json(body, status as 429);
    }
  }

  // 1) Извлечь текст источника.
  let sourceText = "";
  let sourceKind = mime;
  try {
    if (mime === "application/pdf" || /\.pdf$/i.test(filename)) {
      const document = await getDocumentProxy(decodeBase64Url(base64));
      const { text } = await extractText(document, { mergePages: true });
      sourceText = String(text || "").replace(/\u0000/g, "").trim();
      sourceKind = "pdf";
      if (!sourceText) {
        const { body, status } = fail("EMPTY_DOCUMENT", "В PDF нет текстового слоя (это скан). Конспект из сканов пока недоступен.", 422, rid);
        return c.json(body, status as 422);
      }
    } else if (/^image\//.test(mime)) {
      const extracted = await extractImageText(c.env, base64, mime);
      sourceText = extracted.text;
      sourceKind = "image";
      if (!sourceText) {
        const { body, status } = fail(extracted.code, extracted.message, 503, rid);
        return c.json(body, status as 503);
      }
    } else if (isAudio) {
      const extracted = await transcribeAudio(c.env, base64, mime, filename);
      sourceText = extracted.text;
      sourceKind = "audio";
      if (!sourceText) {
        const { body, status } = fail(extracted.code, extracted.message, 503, rid);
        return c.json(body, status as 503);
      }
    } else if (/^text\//.test(mime) || /\.(txt|md|markdown)$/i.test(filename)) {
      sourceText = decodeBase64Text(base64).trim();
      sourceKind = "text";
    } else {
      const { body, status } = fail("UNSUPPORTED_TYPE", "Поддерживаются PDF, изображения (JPG/PNG/WebP), аудио (mp3/m4a/ogg/wav) и текстовые файлы", 422, rid);
      return c.json(body, status as 422);
    }
  } catch (error) {
    console.error("[ai:notes-extract]", error instanceof Error ? error.message : String(error));
    const { body, status } = fail("EXTRACT_FAILED", "Не удалось прочитать файл: он повреждён или защищён", 422, rid);
    return c.json(body, status as 422);
  }

  if (sourceText.length < 200) {
    const { body, status } = fail("TEXT_TOO_SHORT", "В файле слишком мало текста для конспекта", 422, rid);
    return c.json(body, status as 422);
  }
  sourceText = sourceText.slice(0, 60000);

  // 2) Конспект любым доступным провайдером (текст уже извлечён — мультимодальность не нужна).
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "Ты — редактор студенческих конспектов по медицине.",
        "Из чернового текста (распознанного фото/PDF или файла) собери структурный конспект в markdown:",
        "заголовки по смыслу, списки, таблицы в markdown, формулы — латиницей.",
        "Сохраняй ВСЕ факты и цифры источника, ничего не придумывай; неразборчивые места помечай [неразборчиво].",
        "В конце добавь раздел «Ключевые термины» — 10-15 терминов с краткими определениями.",
        "Верни только markdown конспекта, без вступлений и пояснений.",
      ].join("\n"),
    },
    { role: "user", content: "Источник (" + sourceKind + ", " + (filename || "без имени") + "):\n\n" + sourceText },
  ];
  try {
    const result = await trackedGeneration(c.env, messages, "auto", 0.2, {
      route: "POST /ai/notes-from-file",
      feature: "notes_file",
      userId: user.id,
      requestId: rid,
      metadata: { source_kind: sourceKind, source_chars: sourceText.length },
    });
    return c.json(ok({
      notes_markdown: result.text,
      source_chars: sourceText.length,
      provider: result.provider,
      model: result.model,
    }, rid));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    const reportedStatus = Number((error as any)?.status);
    const status = reportedStatus === 429 || reportedStatus === 503 ? reportedStatus
      : reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(String((error as any)?.code || (status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM")), error instanceof Error ? error.message : "ИИ-провайдеры временно недоступны", status, rid);
    return c.json(body, responseStatus as 502 | 503);
  }
});

export default ai;
