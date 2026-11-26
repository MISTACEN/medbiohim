/**
 * Админский редактор карточки препарата v2 (приоритет 1, шаги 3–4).
 *
 * Карточка = изображение + принадлежность к препарату. Учебное содержание
 * (признаки, структуры, дифференциал) живёт в `preparation_guides` и правится
 * соседним редактором; здесь только то, чего в гиде нет: архив вместо удаления,
 * дополнительные изображения одного объекта, подписи и указатели на них.
 *
 * Чтение — админ и модератор, запись — только админ и только service-role:
 * политик на insert/update у таблиц нет специально.
 */
import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { HOTSPOT_LIMIT, normalizeHotspots, safeObjectKey } from "../trainers/shared";
import { MANAGERS, STRICT_ADMINS, bodyJson, error, gate, type AdminApp } from "./shared";

const CARD_ID = /^[A-Za-z0-9_-]{1,80}$/;
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CAPTION = 200;
const MAX_IMAGES_PER_CARD = 8;
const PREPARATION_TEXT_FIELDS = ["name", "organ", "stain"] as const;

type ImageSource = { object_key: string | null; external_url: string | null };

function text(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function isMissingTable(dbError: { code?: string; message?: string }): boolean {
  return String(dbError.code || "") === "42P01" || String(dbError.message || "").toLowerCase().includes("does not exist");
}

/** Ровно один источник: ключ в Blob либо публичный https-URL. */
function readSource(input: Record<string, unknown>): ImageSource | { message: string } {
  const rawKey = input.object_key === undefined ? "" : String(input.object_key ?? "").trim();
  const rawUrl = input.external_url === undefined ? "" : String(input.external_url ?? "").trim();
  if (rawKey && rawUrl) return { message: "Укажите либо ключ хранилища, либо https-ссылку, но не оба" };
  if (!rawKey && !rawUrl) return { message: "Нужен ключ хранилища или https-ссылка" };
  if (rawUrl) {
    if (!/^https:\/\/[^\s]+$/i.test(rawUrl) || rawUrl.length > 2000) {
      return { message: "Ссылка должна начинаться с https:// и быть короче 2000 символов" };
    }
    return { object_key: null, external_url: rawUrl };
  }
  const key = safeObjectKey(rawKey);
  if (!key) return { message: "Ключ хранилища: без ведущего слэша, «..» и пробелов" };
  return { object_key: key, external_url: null };
}

function readHotspots(input: Record<string, unknown>): { value: unknown } | { message: string } {
  if (input.hotspots === undefined) return { value: undefined };
  if (!Array.isArray(input.hotspots)) return { message: "Указатели — это массив" };
  if (input.hotspots.length > HOTSPOT_LIMIT) return { message: `Больше ${HOTSPOT_LIMIT} указателей на изображение не сохраняем` };
  return { value: normalizeHotspots(input.hotspots) };
}

function readSortOrder(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const order = Number(value);
  if (!Number.isInteger(order) || order < 0 || order > 999) return NaN;
  return order;
}

export function registerTrainerCards(admin: AdminApp) {
  /** Список карточек для выбора в редакторе: поиск по названию и органу. */
  admin.get("/trainer-cards", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, MANAGERS))) return;

    const subject = String(c.req.query("subject") || "histology");
    const query = String(c.req.query("q") || "").trim().toLocaleLowerCase("ru-RU");
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 50);

    const db = createServiceClient(c.env) ?? c.get("supabase");
    const { data, error: dbError } = await db
      .from("trainer_feed_cards")
      .select("id,preparation,mode_set,is_published,is_archived,subject_slug,trainer_card_images(id)")
      .eq("subject_slug", subject)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (dbError) {
      console.error("[admin:trainer-cards:list]", dbError.message);
      return error(c, rid, 503, isMissingTable(dbError) ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Карточки тренажёра недоступны");
    }

    const items = (data || [])
      .map((row: any) => {
        const preparation = (row.preparation || {}) as Record<string, unknown>;
        const name = text(preparation.name || preparation.organ, MAX_CAPTION);
        return {
          id: String(row.id),
          name,
          organ: text(preparation.organ, MAX_CAPTION),
          mode_set: row.mode_set || null,
          is_published: row.is_published !== false,
          is_archived: row.is_archived === true,
          images: Array.isArray(row.trainer_card_images) ? row.trainer_card_images.length : 0,
        };
      })
      .filter((item: any) => {
        if (!query) return true;
        return item.name.toLocaleLowerCase("ru-RU").includes(query) || item.organ.toLocaleLowerCase("ru-RU").includes(query);
      })
      .slice(0, limit);

    return c.json(ok({ items, limit, subject }, rid));
  });

  /** Одна карточка со всеми изображениями — для редактора. */
  admin.get("/trainer-cards/:id", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, MANAGERS))) return;
    const id = String(c.req.param("id") ?? "");
    if (!CARD_ID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный id карточки");

    const db = createServiceClient(c.env) ?? c.get("supabase");
    const { data, error: dbError } = await db
      .from("trainer_feed_cards")
      .select("id,preparation,hotspots,mode_set,is_published,is_archived,archived_at,subject_slug,updated_at,trainer_card_images(id,object_key,external_url,caption,hotspots,sort_order,updated_at)")
      .eq("id", id)
      .maybeSingle();
    if (dbError) {
      console.error("[admin:trainer-cards:get]", dbError.message);
      return error(c, rid, 503, isMissingTable(dbError) ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Карточка недоступна");
    }
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Карточка не найдена");

    return c.json(ok({ item: mapAdminCard(data) }, rid));
  });

  /** Архив, подписи основной картинки и текстовые поля препарата. */
  admin.patch("/trainer-cards/:id", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;
    const id = String(c.req.param("id") ?? "");
    if (!CARD_ID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный id карточки");

    const input = (await bodyJson(c)) as Record<string, unknown> | null;
    if (!input || typeof input !== "object") return error(c, rid, 422, "VALIDATION_ERROR", "Нужно тело запроса");

    const db = createServiceClient(c.env) ?? c.get("supabase");
    const { data: current, error: readError } = await db
      .from("trainer_feed_cards")
      .select("id,preparation,hotspots")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("[admin:trainer-cards:patch:read]", readError.message);
      return error(c, rid, 503, isMissingTable(readError) ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Карточка недоступна");
    }
    if (!current) return error(c, rid, 404, "NOT_FOUND", "Карточка не найдена");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof input.is_archived === "boolean") {
      patch.is_archived = input.is_archived;
      patch.archived_at = input.is_archived ? new Date().toISOString() : null;
    }

    const hotspots = readHotspots(input);
    if ("message" in hotspots) return error(c, rid, 422, "VALIDATION_ERROR", hotspots.message);
    if (hotspots.value !== undefined) patch.hotspots = hotspots.value;

    if (input.preparation !== undefined) {
      if (!input.preparation || typeof input.preparation !== "object" || Array.isArray(input.preparation)) {
        return error(c, rid, 422, "VALIDATION_ERROR", "Поле preparation должно быть объектом");
      }
      const incoming = input.preparation as Record<string, unknown>;
      const preparation: Record<string, unknown> = { ...((current.preparation || {}) as Record<string, unknown>) };
      for (const field of PREPARATION_TEXT_FIELDS) {
        if (incoming[field] === undefined) continue;
        const value = text(incoming[field], MAX_CAPTION);
        if (field === "name" && !value) return error(c, rid, 422, "VALIDATION_ERROR", "Нужно название препарата");
        preparation[field] = value;
      }
      if (incoming.captions !== undefined) {
        if (!Array.isArray(incoming.captions)) return error(c, rid, 422, "VALIDATION_ERROR", "Подписи — это массив строк");
        preparation.captions = incoming.captions
          .slice(0, HOTSPOT_LIMIT)
          .map((item) => text(item, MAX_CAPTION))
          .filter(Boolean);
      }
      patch.preparation = preparation;
    }

    if (Object.keys(patch).length === 1) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для сохранения");

    const { data, error: writeError } = await db
      .from("trainer_feed_cards")
      .update(patch)
      .eq("id", id)
      .select("id,preparation,hotspots,mode_set,is_published,is_archived,archived_at,subject_slug,updated_at,trainer_card_images(id,object_key,external_url,caption,hotspots,sort_order,updated_at)")
      .single();
    if (writeError) {
      console.error("[admin:trainer-cards:patch]", writeError.message);
      return error(c, rid, 503, isMissingTable(writeError) ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Не удалось сохранить карточку");
    }

    return c.json(ok({ item: mapAdminCard(data) }, rid));
  });

  /** Добавить изображение к карточке. */
  admin.post("/trainer-cards/:id/images", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;
    const cardId = String(c.req.param("id") ?? "");
    if (!CARD_ID.test(cardId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный id карточки");

    const input = (await bodyJson(c)) as Record<string, unknown> | null;
    if (!input || typeof input !== "object") return error(c, rid, 422, "VALIDATION_ERROR", "Нужно тело запроса");

    const source = readSource(input);
    if ("message" in source) return error(c, rid, 422, "VALIDATION_ERROR", source.message);
    const hotspots = readHotspots(input);
    if ("message" in hotspots) return error(c, rid, 422, "VALIDATION_ERROR", hotspots.message);
    const sortOrder = readSortOrder(input.sort_order);
    if (Number.isNaN(sortOrder)) return error(c, rid, 422, "VALIDATION_ERROR", "Порядок — целое число от 0 до 999");

    const db = createServiceClient(c.env) ?? c.get("supabase");
    const { count, error: countError } = await db
      .from("trainer_card_images")
      .select("id", { count: "exact", head: true })
      .eq("card_id", cardId);
    if (countError) {
      console.error("[admin:trainer-cards:image:count]", countError.message);
      return error(c, rid, 503, isMissingTable(countError) ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Изображения недоступны");
    }
    if ((count || 0) >= MAX_IMAGES_PER_CARD) {
      return error(c, rid, 422, "VALIDATION_ERROR", `У карточки уже ${MAX_IMAGES_PER_CARD} дополнительных изображений`);
    }

    const { data, error: insertError } = await db
      .from("trainer_card_images")
      .insert({
        card_id: cardId,
        object_key: source.object_key,
        external_url: source.external_url,
        caption: text(input.caption, MAX_CAPTION),
        hotspots: hotspots.value ?? [],
        sort_order: sortOrder ?? 0,
        updated_at: new Date().toISOString(),
      })
      .select("id,object_key,external_url,caption,hotspots,sort_order,updated_at")
      .single();
    if (insertError) {
      console.error("[admin:trainer-cards:image:create]", insertError.message);
      const missing = isMissingTable(insertError);
      return error(c, rid, missing ? 503 : 422, missing ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Не удалось добавить изображение");
    }

    return c.json(ok({ item: mapAdminImage(data) }, rid));
  });

  /** Изменить источник, подпись, указатели или порядок изображения. */
  admin.patch("/trainer-cards/:id/images/:imageId", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;
    const cardId = String(c.req.param("id") ?? "");
    const imageId = String(c.req.param("imageId") ?? "");
    if (!CARD_ID.test(cardId) || !IMAGE_ID.test(imageId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный id");

    const input = (await bodyJson(c)) as Record<string, unknown> | null;
    if (!input || typeof input !== "object") return error(c, rid, 422, "VALIDATION_ERROR", "Нужно тело запроса");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.object_key !== undefined || input.external_url !== undefined) {
      const source = readSource(input);
      if ("message" in source) return error(c, rid, 422, "VALIDATION_ERROR", source.message);
      patch.object_key = source.object_key;
      patch.external_url = source.external_url;
    }
    if (input.caption !== undefined) patch.caption = text(input.caption, MAX_CAPTION);
    const hotspots = readHotspots(input);
    if ("message" in hotspots) return error(c, rid, 422, "VALIDATION_ERROR", hotspots.message);
    if (hotspots.value !== undefined) patch.hotspots = hotspots.value;
    const sortOrder = readSortOrder(input.sort_order);
    if (Number.isNaN(sortOrder)) return error(c, rid, 422, "VALIDATION_ERROR", "Порядок — целое число от 0 до 999");
    if (sortOrder !== undefined) patch.sort_order = sortOrder;
    if (Object.keys(patch).length === 1) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для сохранения");

    const db = createServiceClient(c.env) ?? c.get("supabase");
    const { data, error: writeError } = await db
      .from("trainer_card_images")
      .update(patch)
      .eq("id", imageId)
      .eq("card_id", cardId)
      .select("id,object_key,external_url,caption,hotspots,sort_order,updated_at")
      .maybeSingle();
    if (writeError) {
      console.error("[admin:trainer-cards:image:patch]", writeError.message);
      return error(c, rid, 503, isMissingTable(writeError) ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Не удалось сохранить изображение");
    }
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Изображение не найдено");

    return c.json(ok({ item: mapAdminImage(data) }, rid));
  });

  /** Удалить дополнительное изображение (файл в хранилище не трогаем). */
  admin.delete("/trainer-cards/:id/images/:imageId", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;
    const cardId = String(c.req.param("id") ?? "");
    const imageId = String(c.req.param("imageId") ?? "");
    if (!CARD_ID.test(cardId) || !IMAGE_ID.test(imageId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный id");

    const db = createServiceClient(c.env) ?? c.get("supabase");
    const { data, error: deleteError } = await db
      .from("trainer_card_images")
      .delete()
      .eq("id", imageId)
      .eq("card_id", cardId)
      .select("id")
      .maybeSingle();
    if (deleteError) {
      console.error("[admin:trainer-cards:image:delete]", deleteError.message);
      return error(c, rid, 503, isMissingTable(deleteError) ? "NOT_MIGRATED" : "DB_UNAVAILABLE", "Не удалось удалить изображение");
    }
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Изображение не найдено");

    return c.json(ok({ deleted: true, id: imageId }, rid));
  });
}

function mapAdminImage(row: any) {
  return {
    id: String(row.id),
    object_key: row.object_key ?? null,
    external_url: row.external_url ?? null,
    caption: String(row.caption ?? ""),
    hotspots: normalizeHotspots(row.hotspots),
    sort_order: Number(row.sort_order ?? 0),
    updated_at: row.updated_at ?? null,
  };
}

function mapAdminCard(row: any) {
  const images = (Array.isArray(row.trainer_card_images) ? row.trainer_card_images : [])
    .slice()
    .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map(mapAdminImage);
  const preparation = (row.preparation || {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(preparation.name ?? ""),
    organ: String(preparation.organ ?? ""),
    stain: String(preparation.stain ?? ""),
    captions: Array.isArray(preparation.captions) ? preparation.captions.map((item) => String(item)) : [],
    preparation,
    hotspots: normalizeHotspots(row.hotspots),
    mode_set: row.mode_set ?? null,
    is_published: row.is_published !== false,
    is_archived: row.is_archived === true,
    archived_at: row.archived_at ?? null,
    subject_slug: row.subject_slug ?? null,
    updated_at: row.updated_at ?? null,
    images,
  };
}