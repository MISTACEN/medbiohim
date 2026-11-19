import { fail } from "../../lib/response";


export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_PACK_ITEMS = 100;
export const MAX_TITLE = 200;
export const MAX_CARD_TEXT = 2000;

export function relation(value: any) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export type PackItemInput = { front: string; back: string; image_file_id: string | null };

export function normalizeItems(raw: unknown): PackItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  const items: PackItemInput[] = [];
  for (const entry of raw.slice(0, MAX_PACK_ITEMS)) {
    const front = String((entry as any)?.front ?? "").trim();
    const back = String((entry as any)?.back ?? "").trim();
    const imageRaw = String((entry as any)?.image_file_id ?? "").trim();
    // image_file_id — необязательный UUID файла из files (кнопка «фото»).
    const image_file_id = imageRaw && UUID.test(imageRaw) ? imageRaw : null;
    if (!front && !image_file_id) return null;
    if (front.length > MAX_CARD_TEXT || back.length > MAX_CARD_TEXT) return null;
    items.push({ front, back, image_file_id });
  }
  return items;
}

/**
 * Картинки карточек не должны быть хотлинком произвольных файлов: разрешаем
 * только свои загрузки и публичные (visibility=public — так публикуются паки).
 */
export async function filterAllowedImageFiles(db: any, userId: string, items: PackItemInput[]): Promise<PackItemInput[]> {
  const ids = [...new Set(items.map((item) => item.image_file_id).filter(Boolean))] as string[];
  if (!ids.length) return items;
  const allowed = new Set<string>();
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db
      .from("files")
      .select("id,uploaded_by,visibility")
      .in("id", ids.slice(i, i + CHUNK))
      .eq("status", "active");
    if (error) throw error;
    for (const file of data || []) {
      if (file.uploaded_by === userId || file.visibility === "public") allowed.add(file.id);
    }
  }
  return items.map((item) => (item.image_file_id && !allowed.has(item.image_file_id) ? { ...item, image_file_id: null } : item));
}

export async function insertItems(db: any, packId: string, items: PackItemInput[]) {
  const rows = items.map((item, index) => ({
    pack_id: packId,
    front: item.front,
    back: item.back,
    image_file_id: item.image_file_id,
    order_index: index,
  }));
  // Пакетная вставка чанками — у пулера были обрывы на больших запросах.
  const CHUNK = 25;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("card_pack_items").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

// Список: свои паки (и опубликованные — через ?scope=shared).

export function extractCardsJson(raw: string): { cards?: Array<{ front?: string; back?: string; source?: string }> } | null {
  const text = String(raw || "").replace(/```(?:json)?/gi, "").trim();
  if (!text) return null;
  const candidates: string[] = [text];
  const start = text.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const cards = Array.isArray(parsed) ? parsed : parsed?.cards;
      if (Array.isArray(cards)) return { cards };
    } catch {
      /* следующий кандидат */
    }
  }
  return null;
}

export async function directLectureBlock(db: any, subjectSlug: string | null, topic: string): Promise<string> {
  // Без предмета искать нечего: генерация из своего текста сюда не доходит.
  if (!subjectSlug) return "";
  const words = topic.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3).slice(0, 3);
  if (!words.length) return "";
  try {
    const byTitle = await db.from("histology_lectures")
      .select("title,body_markdown")
      .eq("is_published", true).eq("subject_slug", subjectSlug)
      .ilike("title", `%${words[0]}%`).limit(3);
    let rows = (byTitle?.data || []) as Array<{ title?: string; body_markdown?: string }>;
    if (!rows.length) {
      const byBody = await db.from("histology_lectures")
        .select("title,body_markdown")
        .eq("is_published", true).eq("subject_slug", subjectSlug)
        .ilike("body_markdown", `%${words[0]}%`).limit(3);
      rows = (byBody?.data || []) as Array<{ title?: string; body_markdown?: string }>;
    }
    if (!rows.length) return "";
    return rows
      .map((row, index) => `[${index + 1}] Лекция «${row.title || ""}»:\n${String(row.body_markdown || "").slice(0, 1500)}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

export function err(c: any, rid: string, status: number, code: string, message: string) {
  const { body } = fail(code, message, status, rid);
  return c.json(body, status as any);
}
