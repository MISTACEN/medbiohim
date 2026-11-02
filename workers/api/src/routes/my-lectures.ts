import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/**
 * Авторские занятия: обычный пользователь видит, правит и публикует только
 * свои лекции. Полный редактор всех лекций остаётся в /admin/lectures.
 *
 * Хранилище то же, что у админки — site_content:lectures (payload.items),
 * поэтому опубликованное автором занятие сразу появляется в общем каталоге.
 */
const myLectures = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const EDITABLE = [
  "title",
  "subject",
  "subject_id",
  "subject_slug",
  "topic",
  "lesson_type",
  "body_md",
  "body_html",
  "summary",
  "media",
  "attachments",
  "related_learning",
];

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

function pick(input: any, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(input || {}, key)) out[key] = input[key];
  return out;
}

function validText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

async function readStore(db: any) {
  const { data: rows, error: dbError } = await db
    .from("site_content")
    .select("key,payload")
    .eq("key", "lectures")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (dbError) throw dbError;
  const payload = rows?.[0]?.payload;
  return { exists: !!rows?.length, items: Array.isArray(payload?.items) ? payload.items : [] };
}

async function writeStore(db: any, old: any, items: any[]) {
  const payload = { items };
  if (old.exists) {
    const { error: dbError } = await db
      .from("site_content")
      .update({ payload, updated_at: new Date().toISOString() })
      .eq("key", "lectures");
    if (dbError) throw dbError;
  } else {
    const { error: dbError } = await db
      .from("site_content")
      .insert({ key: "lectures", payload, updated_at: new Date().toISOString() });
    if (dbError) throw dbError;
  }
}

function ownerOf(item: any) {
  return String(item?.created_by || "");
}

/** Только свои занятия: фильтр по автору, свежие сверху. */
myLectures.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  try {
    const store = await readStore(db);
    const items = store.items
      .filter((item: any) => ownerOf(item) === String(user.id))
      .sort((a: any, b: any) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, 200);
    return c.json(ok({ items, count: items.length }, rid));
  } catch (dbError: any) {
    console.error("[my-lectures:list]", dbError?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Мои занятия сейчас недоступны");
  }
});

/** Черновик своего занятия — без генерации, текст приходит из редактора. */
myLectures.post("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const input = await bodyJson(c);
  if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректное тело запроса");
  if (!validText(input.title, 500)) return error(c, rid, 422, "VALIDATION_ERROR", "Название занятия обязательно");
  if (!validText(input.subject_slug, 100)) return error(c, rid, 422, "VALIDATION_ERROR", "Укажите предмет");
  if (input.body_md !== undefined && typeof input.body_md !== "string") {
    return error(c, rid, 422, "VALIDATION_ERROR", "body_md должен быть строкой");
  }
  const now = new Date().toISOString();
  const lecture = {
    ...pick(input, EDITABLE),
    id: "lec-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    status: "draft",
    created_by: user.id,
    reviewed_by: null,
    published_at: null,
    created_at: now,
    updated_at: now,
  };
  try {
    const store = await readStore(db);
    await writeStore(db, store, [lecture, ...store.items]);
    return c.json(ok({ lecture }, rid), 201);
  } catch (dbError: any) {
    console.error("[my-lectures:create]", dbError?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить занятие");
  }
});

/** Правка своего занятия. Чужие и служебные поля недоступны. */
myLectures.patch("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = c.req.param("id") || "";
  const input = await bodyJson(c);
  if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректное тело запроса");
  const patch = pick(input, EDITABLE);
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
  if (patch.title !== undefined && !validText(patch.title, 500)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Название занятия обязательно");
  }
  try {
    const store = await readStore(db);
    const index = store.items.findIndex((item: any) => String(item.id) === id);
    if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Занятие не найдено");
    if (ownerOf(store.items[index]) !== String(user.id)) {
      return error(c, rid, 403, "FORBIDDEN", "Можно править только свои занятия");
    }
    const updated = {
      ...store.items[index],
      ...patch,
      // Опубликованную лекцию правка не снимает с публикации: автор дорабатывает текст.
      updated_at: new Date().toISOString(),
    };
    store.items[index] = updated;
    await writeStore(db, store, store.items);
    return c.json(ok({ lecture: updated }, rid));
  } catch (dbError: any) {
    console.error("[my-lectures:update]", dbError?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить занятие");
  }
});

/** Публикация своего занятия в общий каталог. */
myLectures.post("/:id/publish", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = c.req.param("id") || "";
  try {
    const store = await readStore(db);
    const index = store.items.findIndex((item: any) => String(item.id) === id);
    if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Занятие не найдено");
    if (ownerOf(store.items[index]) !== String(user.id)) {
      return error(c, rid, 403, "FORBIDDEN", "Публиковать можно только свои занятия");
    }
    const now = new Date().toISOString();
    store.items[index] = {
      ...store.items[index],
      status: "published",
      published_at: now,
      updated_at: now,
    };
    await writeStore(db, store, store.items);
    return c.json(ok({ lecture: store.items[index] }, rid));
  } catch (dbError: any) {
    console.error("[my-lectures:publish]", dbError?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось опубликовать занятие");
  }
});

export default myLectures;
