/**
 * Хранилище одноразовых SSO-кодов.
 *
 * Основной путь — Upstash Redis: `getdel` атомарно читает и удаляет ключ,
 * поэтому два параллельных обмена одним кодом не могут оба получить сессию.
 * Память процесса остаётся только как dev-фоллбек (нет Redis-секретов):
 * в production она не переживает второй изолят, и это осознанное ограничение,
 * а не рабочий режим.
 */
import type { Env } from "../../env";
import { getRedis } from "../../lib/redis";
import type { MentorCodePayload } from "./model";

const KEY_PREFIX = "mentor:sso:";

type MemoryEntry = { payload: MentorCodePayload; expiresAt: number };
const memory = new Map<string, MemoryEntry>();

function memoryTake(code: string): MentorCodePayload | null {
  const entry = memory.get(code);
  if (!entry) return null;
  memory.delete(code);
  return entry.expiresAt > Date.now() ? entry.payload : null;
}

/** `true` — код сохранён там, где его увидит второй инстанс. */
export async function storeMentorCode(
  env: Env,
  code: string,
  payload: MentorCodePayload,
  ttlSeconds: number,
): Promise<boolean> {
  const redis = getRedis(env);
  if (!redis) {
    memory.set(code, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
    // Чистим просроченные, чтобы dev-процесс не рос бесконечно.
    for (const [key, entry] of memory) {
      if (entry.expiresAt <= Date.now()) memory.delete(key);
    }
    return false;
  }
  await redis.set(KEY_PREFIX + code, payload, { ex: ttlSeconds });
  return true;
}

/**
 * Возвращает payload ровно один раз. Ошибка Redis — это «кода нет»: бридж
 * должен закрываться, а не пускать по недоказанной записи.
 */
export async function consumeMentorCode(env: Env, code: string): Promise<MentorCodePayload | null> {
  const redis = getRedis(env);
  if (!redis) return memoryTake(code);
  try {
    const value = await redis.getdel<MentorCodePayload>(KEY_PREFIX + code);
    return value ?? null;
  } catch (error) {
    console.error("[mentor:sso] redis getdel failed", { error: String(error) });
    return null;
  }
}
