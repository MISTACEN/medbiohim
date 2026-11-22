/**
 * Админский редактор методических карточек препаратов.
 *
 * Контент живёт в `preparation_guides` (миграция
 * `20261120_preparation_guides.sql`). До появления этой ручки правка шла через
 * JSON-сид и генератор SQL — администратору это недоступно, поэтому здесь
 * минимальный, но валидирующий сохранение по одному ключу.
 *
 * Чтение — админ и модератор (RLS уже разрешает select авторизованным), запись —
 * только админ и только через service-role: политик на insert/update нет
 * специально, чтобы контент менялся лишь проверенным путём.
 */
import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { MANAGERS, STRICT_ADMINS, bodyJson, error, gate, type AdminApp } from "./shared";
import { bumpPrepContentVersion } from "../../lib/cache";
import { getRedis } from "../../lib/redis";

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

const MAX_ITEMS = 30;
const MAX_ITEM_LENGTH = 400;

function shortText(value: unknown, max = 200): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function stringList(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
    .map((item) => item.slice(0, MAX_ITEM_LENGTH));
  return items;
}

function structureList(value: unknown): string[] | null {
  const items = stringList(value);
  if (!items) return null;
  return items
    .map((item) => item.toLowerCase())
    .filter((item) => KEY_PATTERN.test(item))
    .slice(0, 60);
}

type Normalized = { row: Record<string, unknown> } | { message: string };

export function normalizeGuide(input: Record<string, unknown> | null, key: string): Normalized {
  const name = String(input?.name ?? "").trim();
  if (!name) return { message: "Нужно название препарата" };
  if (name.length > 200) return { message: "Название длиннее 200 символов" };

  // Диапазон совпадает с ограничением БД `check (difficulty between 1 and 3)`
  // и `not null default 1`: пустое значение — это 1, а не null, иначе upsert
  // падает на constraint, а не на понятной ошибке валидации.
  const rawDifficulty = input?.difficulty;
  let difficulty = 1;
  if (rawDifficulty !== undefined && rawDifficulty !== null && rawDifficulty !== "") {
    const value = Number(rawDifficulty);
    if (!Number.isInteger(value) || value < 1 || value > 3) {
      return { message: "Сложность — целое число от 1 до 3" };
    }
    difficulty = value;
  }

  const row: Record<string, unknown> = {
    key,
    name,
    // Текстовые колонки в БД — `not null default ''`: пустое поле — это "",
    // а не null, иначе upsert падает на constraint вместо сохранения.
    section: shortText(input?.section) ?? "",
    system: shortText(input?.system) ?? "",
    organ: shortText(input?.organ) ?? "",
    tissue: shortText(input?.tissue) ?? "",
    stain: shortText(input?.stain) ?? "",
    difficulty,
    low_magnification: shortText(input?.low_magnification, 500) ?? "",
    high_magnification: shortText(input?.high_magnification, 500) ?? "",
    steps: stringList(input?.steps) ?? [],
    features: stringList(input?.features) ?? [],
    inclusions: stringList(input?.inclusions) ?? [],
    differential: stringList(input?.differential) ?? [],
    mistakes: stringList(input?.mistakes) ?? [],
    structures: structureList(input?.structures) ?? [],
    updated_at: new Date().toISOString(),
  };

  return { row };
}

export function registerPreparationGuides(admin: AdminApp) {
  /** Список всех карточек — для выбора в редакторе. */
  admin.get("/preparation-guides", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, MANAGERS))) return;

    const { data, error: dbError } = await c
      .get("supabase")
      .from("preparation_guides")
      .select("*")
      .order("section", { ascending: true })
      .order("name", { ascending: true });

    if (dbError) {
      console.error("[admin:preparation-guides:list]", dbError.message);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Методические карточки недоступны");
    }
    return c.json(ok({ items: data || [] }, rid));
  });

  /** Сохранение одной карточки: upsert по `key`, без создания дублей. */
  admin.put("/preparation-guides/:key", requireAuth, async (c) => {
    const rid = requestId();
    if (!(await gate(c, STRICT_ADMINS))) return;

    const key = String(c.req.param("key") ?? "").trim().toLowerCase();
    if (!KEY_PATTERN.test(key)) {
      return error(c, rid, 422, "VALIDATION_ERROR", "Ключ карточки: латиница, цифры и дефис");
    }

    const input = await bodyJson(c);
    const normalized = normalizeGuide(input, key);
    if ("message" in normalized) {
      return error(c, rid, 422, "VALIDATION_ERROR", normalized.message);
    }

    const db = createServiceClient(c.env) ?? c.get("supabase");
    const { data, error: dbError } = await db
      .from("preparation_guides")
      .upsert(normalized.row, { onConflict: "key" })
      .select("*")
      .single();

    if (dbError) {
      const missing =
        String(dbError.code || "") === "42P01" ||
        String(dbError.message || "").toLowerCase().includes("does not exist");
      console.error("[admin:preparation-guides:save]", dbError.message);
      return error(
        c,
        rid,
        503,
        missing ? "NOT_MIGRATED" : "DB_UNAVAILABLE",
        missing ? "Сначала примените миграцию методических карточек" : "Не удалось сохранить карточку",
      );
    }

    // Содержимое изменилось: сдвигаем версию, чтобы кэш атласа не отдавал
    // старую методичку до истечения TTL (lib/cache.ts).
    await bumpPrepContentVersion(getRedis(c.env));

    return c.json(ok({ item: data }, rid));
  });
}
