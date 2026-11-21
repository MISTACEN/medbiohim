/**
 * Офлайн-записи: попытка отправить сразу, при отсутствии сети — в очередь.
 *
 * Ответ сервера — единственный источник проверки (`is_correct` считает RPC),
 * поэтому офлайн мы не пытаемся угадать правильность: ответ уходит в очередь и
 * проверяется, когда сеть вернётся. `client_id` делает повтор идемпотентным.
 */
// Импорт из `api/client` напрямую: баррель `@/lib/api` тянет `content.ts`,
// который сам использует очередь — через баррель получился бы цикл.
import { api } from "@/lib/api/client";
import type { ApiResult } from "@/lib/api/types";
import { isTemporaryFailure } from "@/lib/retry";
import { createIndexedDbStore } from "./db";
import { createOutbox, newClientId, type FlushReport, type OutboxItem } from "./queue";

const store = createIndexedDbStore();
const outbox = store ? createOutbox(store) : null;

export const outboxAvailable = Boolean(outbox);

/** Ответ, отложенный в очередь: `{ queued: true }` вместо данных сервера. */
export function isQueuedResponse(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && (value as { queued?: boolean }).queued === true,
  );
}

export async function submitOrQueue<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<ApiResult<T>> {
  const body = JSON.stringify({
    ...payload,
    origin: "user",
    client_id: payload.client_id ?? newClientId(),
  });
  const result = await api<T>(path, { method: "POST", body });
  if (result.ok || !outbox) return result;
  // Ошибки валидации и авторизации повторять бессмысленно — отдаём как есть.
  if (!isTemporaryFailure(result.error.code)) return result;

  try {
    await outbox.enqueue(path, payload);
  } catch {
    return result;
  }
  return { ok: true, data: { queued: true } as unknown as T, requestId: "offline" };
}

let flushing: Promise<FlushReport> | null = null;

/** Отправляет очередь по порядку; параллельные вызовы переиспользуют один прогон. */
export function flushOutbox(): Promise<FlushReport> {
  if (!outbox) return Promise.resolve({ sent: 0, dropped: 0, pending: 0 });
  if (flushing) return flushing;

  flushing = outbox
    .flush(async (item: OutboxItem) => {
      const result = await api(item.path, { method: item.method, body: item.body });
      if (result.ok) return { ok: true as const };
      return { ok: false as const, retryable: isTemporaryFailure(result.error.code) };
    })
    .finally(() => {
      flushing = null;
    });

  return flushing;
}

export async function pendingWrites(): Promise<number> {
  if (!outbox) return 0;
  try {
    return await outbox.pending();
  } catch {
    return 0;
  }
}
