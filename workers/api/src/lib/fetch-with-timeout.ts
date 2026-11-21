/**
 * fetch с жёстким таймаутом: у Workers нет дефолтного дедлайна на upstream,
 * подвисший внешний вызов держит инвокацию и расходует бюджет subrequests.
 *
 * Если вызывающий сам передал signal — он приоритетен (кейс прерывания),
 * иначе ставится таймаут (по умолчанию 10 с: внешние API, не внутренние).
 */
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = init;
  return fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) });
}
