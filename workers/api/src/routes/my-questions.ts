import { Hono } from "hono";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/**
 * Личный банк вопросов автора.
 *
 * Хранится в site_content:user_questions (payload.items) — как лекции, без
 * миграций. Каждый видит и правит только свои вопросы; в общий банк тестов
 * вопрос автоматически не уходит (это отдельная модерация).
 */
const myQuestions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const KINDS = new Set(["single", "multiple", "open"]);
const MAX_TEXT = 4000;
const MAX_OPTIONS = 10;

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

async function readStore(db: any) {
  const { data: rows, error: dbError } = await db
    .from("site_content")
    .select("key,payload")
    .eq("key", "user_questions")
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
      .eq("key", "user_questions");
    if (dbError) throw dbError;
    return;
  }
  const { error: dbError } = await db
    .from("site_content")
    .insert({ key: "user_questions", payload, updated_at: new Date().toISOString() });
  if (dbError) throw dbError;
}

function normalizeOptions(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((option) => String(option ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);
}

function validate(input: any): string {
  if (!String(input?.text || "").trim()) return "Текст вопроса обязателен";
  if (String(input.text).length > MAX_TEXT) return "Вопрос длиннее " + MAX_TEXT + " символов";
  const kind = String(input?.kind || "single");
  if (!KINDS.has(kind)) return "Тип вопроса: single, multiple или open";
  const options = normalizeOptions(input?.options);
  if (kind !== "open" && options.length < 2) return "Для теста нужно минимум два варианта ответа";
  if (kind !== "open" && !String(input?.answer || "").trim()) return "Укажите правильный ответ";
  return "";
}

function own(item: any, userId: string) {
  return String(item?.author_id || "") === String(userId);
}

myQuestions.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  try {
    const store = await readStore(db);
    const items = store.items
      .filter((item: any) => own(item, user.id))
      .sort((a: any, b: any) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, 500);
    return c.json(ok({ items, count: items.length }, rid));
  } catch (failure: any) {
    console.error("[my-questions:list]", failure?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Банк вопросов сейчас недоступен");
  }
});

myQuestions.post("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const input = await bodyJson(c);
  if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректное тело запроса");
  const problem = validate(input);
  if (problem) return error(c, rid, 422, "VALIDATION_ERROR", problem);
  const now = new Date().toISOString();
  const question = {
    id: "uq-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    author_id: user.id,
    subject_slug: String(input.subject_slug || "histology").slice(0, 100),
    topic: String(input.topic || "").slice(0, 200),
    kind: String(input.kind || "single"),
    text: String(input.text).slice(0, MAX_TEXT),
    options: normalizeOptions(input.options),
    answer: String(input.answer || "").slice(0, 500),
    explanation: String(input.explanation || "").slice(0, 2000),
    created_at: now,
    updated_at: now,
  };
  try {
    const store = await readStore(db);
    await writeStore(db, store, [question, ...store.items]);
    return c.json(ok({ question }, rid), 201);
  } catch (failure: any) {
    console.error("[my-questions:create]", failure?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить вопрос");
  }
});

myQuestions.patch("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = c.req.param("id") || "";
  const input = await bodyJson(c);
  if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректное тело запроса");
  try {
    const store = await readStore(db);
    const index = store.items.findIndex((item: any) => String(item.id) === id);
    if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
    if (!own(store.items[index], user.id)) return error(c, rid, 403, "FORBIDDEN", "Можно править только свои вопросы");
    const merged = { ...store.items[index], ...input, updated_at: new Date().toISOString() };
    merged.options = normalizeOptions(merged.options);
    const problem = validate(merged);
    if (problem) return error(c, rid, 422, "VALIDATION_ERROR", problem);
    store.items[index] = merged;
    await writeStore(db, store, store.items);
    return c.json(ok({ question: merged }, rid));
  } catch (failure: any) {
    console.error("[my-questions:update]", failure?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить вопрос");
  }
});

myQuestions.delete("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = c.req.param("id") || "";
  try {
    const store = await readStore(db);
    const index = store.items.findIndex((item: any) => String(item.id) === id);
    if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
    if (!own(store.items[index], user.id)) return error(c, rid, 403, "FORBIDDEN", "Можно удалять только свои вопросы");
    const items = store.items.filter((item: any) => String(item.id) !== id);
    await writeStore(db, store, items);
    return c.json(ok({ deleted: true }, rid));
  } catch (failure: any) {
    console.error("[my-questions:delete]", failure?.message);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить вопрос");
  }
});

export default myQuestions;
