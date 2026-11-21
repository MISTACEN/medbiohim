/**
 * Методические карточки микропрепаратов (первый диагностикум).
 *
 * Гиды живут отдельно от карточек банка: одна методичка на препарат, сколько бы
 * фотографий ни было в `trainer_feed_cards`. Ключ гида — id препарата из программы
 * (`cytology-mitosis`), клиент сопоставляет его с названием карточки.
 *
 * Если миграция `20261120_preparation_guides.sql` ещё не применена, атлас должен
 * продолжать работать: отдаём пустой список и `migrated: false`, а не 503.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import type { Env } from "../env";

const preparations = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const LIST_COLUMNS = "key,name,section,system,organ,tissue,stain,difficulty,structures";
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

type SupabaseError = { code?: string; message?: string } | null;

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

/** Список гидов для атласа: без длинных текстов, только для фильтров и подписей. */
preparations.get("/guides", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("preparation_guides")
    .select(LIST_COLUMNS)
    .order("section", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      return c.json(ok({ items: [], total: 0, migrated: false }, rid));
    }
    console.error("[preparations:guides]", error.message);
    const { body, status } = fail("DB_UNAVAILABLE", "Методические карточки недоступны", 503, rid);
    return c.json(body, status as 503);
  }

  const items = data || [];
  return c.json(ok({ items, total: items.length, migrated: true }, rid));
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
  const { data, error } = await supabase
    .from("preparation_guides")
    .select("*")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      const { body, status } = fail("NOT_MIGRATED", "Методические карточки ещё не подключены", 503, rid);
      return c.json(body, status as 503);
    }
    console.error("[preparations:guide]", error.message);
    const { body, status } = fail("DB_UNAVAILABLE", "Методическая карточка недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  if (!data) {
    const { body, status } = fail("NOT_FOUND", "Методическая карточка не найдена", 404, rid);
    return c.json(body, status as 404);
  }

  return c.json(ok({ item: data, migrated: true }, rid));
});

/** Словарь диагностических структур: по нему строится сортировка атласа. */
preparations.get("/structures", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("preparation_structures")
    .select("slug,title,kind,sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      return c.json(ok({ items: [], migrated: false }, rid));
    }
    console.error("[preparations:structures]", error.message);
    const { body, status } = fail("DB_UNAVAILABLE", "Словарь структур недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  return c.json(ok({ items: data || [], migrated: true }, rid));
});

export default preparations;
