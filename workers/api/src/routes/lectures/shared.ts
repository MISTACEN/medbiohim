import { createServiceClient } from "../../lib/supabase";
import { workersAiComplete, workersAiConfigured } from "../../lib/workers-ai";
import { CLOZE_CACHE_PREFIX } from "../../lib/cloze-text";
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";

export const LECTURE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Внешние ИИ-провайдеры (groq/gigachat/mistral) в проде могут отказать все
 * сразу — тогда конспект отдавал 502, хотя тьютор в этот момент отвечал через
 * биндинг Workers AI. Тот же последний фолбэк, что у тьютора: промпт короче
 * (модель поменьше), цитаты тоже короче.
 */
export async function generateClozeDraft(
  env: any,
  prompt: string,
  compactPrompt: string,
): Promise<{ content: string; provider: string; model: string }> {
  try {
    const result = await generateAiCompletion(
      env,
      [{ role: "user", content: prompt.slice(0, 24000) }],
      "auto",
      fetch,
      { temperature: 0.2 },
    );
    return { content: String(result.content || ""), provider: result.provider, model: result.model };
  } catch (error) {
    if (!workersAiConfigured(env)) throw error;
    console.error("[lectures:cloze:workers-ai]", error instanceof Error ? error.message : String(error));
    const result = await workersAiComplete(
      env,
      [{ role: "user", content: compactPrompt }],
      { temperature: 0.2, maxTokens: 1200 },
    );
    return { content: String(result.content || ""), provider: result.provider, model: result.model };
  }
}

export async function loadLectureForCloze(supabase: any, id: string, userId?: string) {
  if (!LECTURE_ID.test(id)) return null;
  const { data, error } = await supabase
    .from("histology_lectures")
    .select("id,title,subject_slug,body_markdown,is_published")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  // Личная лекция автора: cloze/подкаст/слайды работают и для неё.
  return userId ? await loadPersonalLecture(supabase, id, userId) : null;
}

/**
 * Личные лекции авторов живут в store site_content (key="lectures") — открываем
 * свои и опубликованные по тому же адресу /lectures/<id>, что и кафедральные:
 * «Открыть лекцию» из импорта конспекта и из Мастерской раньше получала 404.
 * Для cloze/подкаста/слайдов форма та же, что у кафедральной лекции.
 */
export async function loadPersonalLecture(supabase: any, id: string, userId: string) {
  if (!LECTURE_ID.test(id)) return null;
  const { data: rows } = await supabase
    .from("site_content")
    .select("payload")
    .eq("key", "lectures")
    .limit(1);
  const items = Array.isArray(rows?.[0]?.payload?.items) ? rows[0].payload.items : [];
  const item = items.find((entry: any) => String(entry?.id || "") === id);
  if (!item) return null;
  const mine = String(item.created_by || "") === String(userId);
  const published = item.status === "published" || item.is_published === true;
  if (!mine && !published) return null;
  const body = String(item.body_md || item.body_markdown || "");
  if (!body.trim()) return null;
  return {
    id: String(item.id),
    title: String(item.title || ""),
    subject_slug: String(item.subject_slug || ""),
    body_markdown: body,
    is_published: true,
  };
}

export function clozeCache(c: any) {
  try {
    return createServiceClient(c.env);
  } catch {
    return null;
  }
}

// Ключ кэша привязан к хэшу текста лекции: правка лекции или версии разбора
// даёт новый ключ, а не устаревший набор пропусков из site_content.
export function clozeCacheKey(id: string, hash: string): string {
  return `${CLOZE_CACHE_PREFIX}${id}:${hash}`;
}

// GET /lectures/:id/cloze — только кэш: открытие без ожидания ИИ.

export function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1, bits = 16): Uint8Array {
  const blockAlign = (channels * bits) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Шпаргалка по лекции (аудит «Школы Сеченова», раздел cheat sheets):
 * сжатый конспект на один печатный лист, только факты из текста лекции.
 * Кэш привязан к хэшу тела, чтобы повторное открытие не тратило квоту.
 */

type SlideDraft = { title: string; bullets: string[] };

export function normalizeSlides(raw: unknown): SlideDraft[] | null {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.slides) ? (raw as any).slides : null;
  if (!list) return null;
  const slides: SlideDraft[] = [];
  for (const entry of list.slice(0, 16)) {
    const title = String((entry as any)?.title ?? "").trim().slice(0, 140);
    const bullets = (Array.isArray((entry as any)?.bullets) ? (entry as any).bullets : [])
      .map((bullet: unknown) => String(bullet ?? "").trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 6);
    if (!title || bullets.length < 1) continue;
    slides.push({ title, bullets });
  }
  return slides.length >= 5 ? slides : null;
}
