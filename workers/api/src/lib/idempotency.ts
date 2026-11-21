/**
 * Идемпотентные повторы офлайн-очереди.
 *
 * Клиент отправляет `client_id` вместе с записью. Если ответ уже был сохранён
 * (запрос дошёл, но ответ потерялся по дороге), повтор возвращает тот же
 * результат и не создаёт вторую запись. Хранилище — Redis с TTL; без Redis
 * остаётся память процесса, что честно работает только в dev.
 */
import type { Env } from "../env";
import { getRedis } from "./redis";

/** Столько живёт память о выполненной записи: недели хватает на офлайн-сессию. */
export const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

export const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const memory = new Map<string, { value: unknown; expiresAt: number }>();

export function normalizeClientId(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return CLIENT_ID_PATTERN.test(value) ? value : null;
}

function cacheKey(scope: string, userId: string, clientId: string): string {
  return `idem:${scope}:${userId}:${clientId}`;
}

export async function readIdempotent<T>(
  env: Env,
  scope: string,
  userId: string,
  clientId: string,
): Promise<T | null> {
  const key = cacheKey(scope, userId, clientId);
  const redis = getRedis(env);
  if (!redis) {
    const entry = memory.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value as T;
  }
  try {
    return (await redis.get<T>(key)) ?? null;
  } catch (error) {
    console.error("[idempotency:read]", String(error));
    return null;
  }
}

export async function writeIdempotent(
  env: Env,
  scope: string,
  userId: string,
  clientId: string,
  value: unknown,
): Promise<void> {
  const key = cacheKey(scope, userId, clientId);
  const redis = getRedis(env);
  if (!redis) {
    memory.set(key, { value, expiresAt: Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000 });
    for (const [storedKey, entry] of memory) {
      if (entry.expiresAt <= Date.now()) memory.delete(storedKey);
    }
    return;
  }
  try {
    await redis.set(key, value, { ex: IDEMPOTENCY_TTL_SECONDS });
  } catch (error) {
    // Не смогли запомнить — ответ всё равно отдаём: хуже потерять ответ.
    console.error("[idempotency:write]", String(error));
  }
}
