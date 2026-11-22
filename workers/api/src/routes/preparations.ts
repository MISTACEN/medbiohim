/**
 * Методические карточки микропрепаратов (первый диагностикум).
 *
 * Гиды живут отдельно от карточек банка: одна методичка на препарат, сколько бы
 * фотографий ни было в `trainer_feed_cards`. Ключ гида — id препарата из программы
 * (`cytology-mitosis`), клиент сопоставляет его с названием карточки.
 *
 * Если миграция `20261120_preparation_guides.sql` ещё не применена, атлас должен
 * продолжать работать: отдаём пустой список и `migrated: false`, а не 503.
 *
 * Кэш: контент одинаков для всех пользователей и меняется точечно, поэтому он
 * идёт через канонический `cached()` (lib/cache.ts) с версией в ключе. Версию
 * сдвигает админское сохранение (`bumpPrepContentVersion`), так что правка
 * методички видна сразу, а не через TTL. Нет Redis — работаем как без кэша.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import type { Env } from "../env";
import { cached, prepContentVersion } from "../lib/cache";
import { getRedis } from "../lib/redis";

const preparations = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const LIST_COLUMNS = "key,name,section,system,organ,tissue,stain,difficulty,structures";
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

type SupabaseError = { code?: string; message?: string } | null;
type ListPayload = { items: any[]; migrated: boolean };
type GuidePayload =
  | { kind: "ok"; item: any }
  | { kind: "missing" }
  | { kind: "not_migrated" };

function isMissingTable(error: SupabaseError): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

/** `waitUntil` есть только в реальном Worker; в тестах контекста нет. */
function waitUntilOf(c: any) {
  try {
    return (task: Promise<unknown>) => c.executionCtx.waitUntil(task);
  } catch {
    return undefined;
  }
}

/** Список гидов для атласа: без длинных текстов, только для фильтров и подписей. */
preparations.get("/guides", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const store = getRedis(c.env);
  const version = await prepContentVersion(store);

  try {
    const payload = await cached<ListPayload>("preparations:guides", { v: version }, async () => {
      const { data, error } = await supabase
        .from("preparation_guides")
        .select(LIST_COLUMNS)
        .order("section", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        if (isMissingTable(error)) return { items: [], migrated: false };
        throw new Error(error.message || "preparation guides unavailable");
      }
      return { items: data || [], migrated: true };
    }, { store, waitUntil: waitUntilOf(c) });

    return c.json(ok({
      items: payload.items,
      total: payload.items.length,
      migrated: payload.migrated,
    }, rid));
  } catch (error: any) {
    console.error("[preparations:guides]", error?.message || error);
    const { body, status } = fail("DB_UNAVAILABLE", "Методические карточки недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

/** Один гид целиком: шаги поиска, признаки, дифференциал, частые ошибки. */
preparations.get("/guides/:key", requireAuth, async (c) => {
  const rid = requestId();
  const key = String(c.req.param("key") || "").trim().toLowerCase();
  if (!KEY_PATTERN.test(key)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ключ препарата", 422, rid);
    return c.json(body, status as 422);
  }

  const supabase = c.get("supabase");
  const store = getRedis(c.env);
  const version = await prepContentVersion(store);

  try {
    const payload = await cached<GuidePayload>("preparations:guide", { key, v: version }, async () => {
      const { data, error } = await supabase
        .from("preparation_guides")
        .select("*")
        .eq("key", key)
        .maybeSingle();
      if (error) {
        if (isMissingTable(error)) return { kind: "not_migrated" as const };
        throw new Error(error.message || "preparation guide unavailable");
      }
      if (!data) return { kind: "missing" as const };
      return { kind: "ok" as const, item: data };
    }, { store, waitUntil: waitUntilOf(c) });

    if (payload.kind === "not_migrated") {
      const { body, status } = fail("NOT_MIGRATED", "Методические карточки ещё не подключены", 503, rid);
      return c.json(body, status as 503);
    }
    if (payload.kind === "missing") {
      const { body, status } = fail("NOT_FOUND", "Методическая карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }

    return c.json(ok({ item: payload.item, migrated: true }, rid));
  } catch (error: any) {
    console.error("[preparations:guide]", error?.message || error);
    const { body, status } = fail("DB_UNAVAILABLE", "Методическая карточка недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

/** Словарь диагностических структур: по нему строится сортировка атласа. */
preparations.get("/structures", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const store = getRedis(c.env);
  const version = await prepContentVersion(store);

  try {
    const payload = await cached<ListPayload>("preparations:structures", { v: version }, async () => {
      const { data, error } = await supabase
        .from("preparation_structures")
        .select("slug,title,kind,sort_order")
        .order("sort_order", { ascending: true });
      if (error) {
        if (isMissingTable(error)) return { items: [], migrated: false };
        throw new Error(error.message || "preparation structures unavailable");
      }
      return { items: data || [], migrated: true };
    }, { store, waitUntil: waitUntilOf(c) });

    return c.json(ok({ items: payload.items, migrated: payload.migrated }, rid));
  } catch (error: any) {
    console.error("[preparations:structures]", error?.message || error);
    const { body, status } = fail("DB_UNAVAILABLE", "Словарь структур недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default preparations;
