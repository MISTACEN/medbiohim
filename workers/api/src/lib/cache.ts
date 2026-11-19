/**
 * Кэш списочных ответов в Upstash Redis: TTL + stale-while-revalidate.
 *
 * Зачем: каталог предметов и другие списки читаются почти каждой страницей и
 * меняются редко. Свежий ответ отдаётся из кэша, устаревший — сразу из кэша, а
 * обновление уходит в `waitUntil`, поэтому пользователь не ждёт Supabase.
 *
 * Правила, которые держит этот модуль:
 * - нет Redis (локально, инцидент, лимит) → вызываем загрузчик, как будто кэша нет;
 * - ошибка чтения/записи Redis → тоже загрузчик, кэш не может ронять запрос;
 * - в ключ попадают только явно переданные параметры, порядок ключей не важен;
 * - значения хранятся в конверте `{ at, value }`, поэтому «свежесть» считается
 *   по времени записи, а не по TTL Redis (TTL = ttl + stale).
 *
 * Модуль намеренно не знает про `Env`: клиент Redis передаётся снаружи
 * (`getRedis(c.env)`), так его можно тестировать без сети.
 */

export type CachePolicy = {
  /** Сколько секунд ответ считается свежим. */
  ttlSeconds: number;
  /** Сколько секунд после этого его ещё можно отдать, обновляя в фоне. */
  staleSeconds: number;
};

export const CACHE_POLICIES = {
  // Каталог предметов: админ меняет его редко, страницы читают постоянно.
  "subjects:catalog": { ttlSeconds: 120, staleSeconds: 1800 },
  // Резолвер PubChem: одинаковый query → одинаковый ответ; экономит внешний
  // вызов. Отрицательный результат (null = «не найдено») кэшируется тоже.
  "chem:resolve": { ttlSeconds: 3600, staleSeconds: 86400 },
  // Агрегат переходов на внешние платформы: публичный, одинаковый для всех,
  // каждый запрос без кэша читал до 5000 строк Supabase.
  "external:stats": { ttlSeconds: 60, staleSeconds: 600 },
} as const satisfies Record<string, CachePolicy>;

export type CachePolicyName = keyof typeof CACHE_POLICIES;

/** Минимальная поверхность Upstash-клиента, которая нужна кэшу. */
export type CacheStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<unknown>;
};

type CacheEnvelope<T> = { at: number; value: T };

export type CacheEntry<T> = { at: number; value: T };

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Сериализация с сортировкой ключей: одинаковые параметры → одинаковый ключ. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

/** Ключ версионирован: смена формы значения требует новой версии, а не flush. */
export function cacheKey(policy: CachePolicyName, parts: Record<string, unknown> = {}): string {
  const payload = stableStringify(parts);
  return `cache:v1:${policy}:${fnv1a(payload)}`;
}

export function isFresh(at: number, policy: CachePolicy, now = Date.now()): boolean {
  return now >= at && now - at < policy.ttlSeconds * 1000;
}

function parseEnvelope<T>(raw: unknown): CacheEntry<T> | null {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const envelope = parsed as Partial<CacheEnvelope<T>>;
  if (typeof envelope.at !== "number" || !("value" in envelope)) return null;
  return { at: envelope.at, value: envelope.value as T };
}

export async function readCacheEntry<T>(store: CacheStore, key: string): Promise<CacheEntry<T> | null> {
  return parseEnvelope<T>(await store.get(key));
}

export type CachedOptions = {
  /** Клиент Redis; `null` отключает кэш (как и отсутствие секретов). */
  store: CacheStore | null;
  /** Момент времени для проверки свежести (тесты). */
  now?: number;
  /** Планировщик фонового обновления: `c.executionCtx.waitUntil`. */
  waitUntil?: (task: Promise<unknown>) => void;
};

/**
 * Прочитать из кэша или загрузить.
 *
 * - свежая запись → отдаём её, загрузчик не вызывается;
 * - устаревшая запись → отдаём её сразу, обновление в `waitUntil` (если его нет,
 *   обновление выполняется синхронно, но ответ всё равно остаётся прежним);
 * - промах → загрузчик, запись кладётся в кэш (ожидание записи не скрываем).
 */
export async function cached<T>(
  policyName: CachePolicyName,
  parts: Record<string, unknown>,
  loader: () => Promise<T>,
  options: CachedOptions,
): Promise<T> {
  const policy = CACHE_POLICIES[policyName];
  const store = options.store;
  if (!store) return loader();

  const key = cacheKey(policyName, parts);
  const now = options.now ?? Date.now();

  let hit: CacheEntry<T> | null = null;
  try {
    hit = await readCacheEntry<T>(store, key);
  } catch {
    hit = null;
  }
  if (hit && isFresh(hit.at, policy, now)) return hit.value;

  const refresh = (async () => {
    const value = await loader();
    try {
      await store.set(key, { at: Date.now(), value } satisfies CacheEnvelope<T>, {
        ex: policy.ttlSeconds + policy.staleSeconds,
      });
    } catch {
      // Redis недоступен: значение уже получено, его и отдаём.
    }
    return value;
  })();

  if (!hit) return refresh;

  const background = refresh.catch(() => hit?.value);
  if (options.waitUntil) {
    options.waitUntil(background);
    return hit.value;
  }
  await background;
  return hit.value;
}
