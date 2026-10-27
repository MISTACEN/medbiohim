/**
 * Повторы только там, где они безопасны: идемпотентные чтения и временные сбои.
 * 4xx и ошибки проверки данных не повторяются никогда — иначе один сбой
 * превращается в шторм запросов.
 */
const TEMPORARY_FAILURES = new Set([
  "NETWORK",
  "TIMEOUT",
  "BAD_RESPONSE",
  "UPSTREAM",
  "DB_UNAVAILABLE",
  "AUTH_UPSTREAM",
  "AUTH_ERROR",
]);

export function isTemporaryFailure(code: string | undefined | null): boolean {
  return TEMPORARY_FAILURES.has(String(code || "").toUpperCase());
}

/** Историческое имя: профиль пользователя и refresh пробуют ещё раз при таких кодах. */
export const isTemporaryAuthFailure = isTemporaryFailure;

export type RetryOptions = {
  /** Общее число попыток, включая первую. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Инъекция для тестов; по умолчанию — setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

/**
 * Экспоненциальная задержка с джиттером: 0.5–1.0 от 2^n * base, но не больше max.
 * Джиттер разводит параллельные запросы, чтобы они не ударили по серверу вместе.
 */
export function retryDelay(attempt: number, options: RetryOptions = {}): number {
  const base = options.baseDelayMs ?? 400;
  const max = options.maxDelayMs ?? 4000;
  const random = options.random ?? Math.random;
  const exponential = Math.min(max, base * 2 ** attempt);
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  shouldRetry: (result: T, attempt: number) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let result = await task(0);
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (!shouldRetry(result, attempt)) return result;
    await sleep(retryDelay(attempt - 1, options));
    result = await task(attempt);
  }
  return result;
}
