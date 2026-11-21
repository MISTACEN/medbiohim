/**
 * Очередь офлайн-записей (outbox).
 *
 * Правила, которые фиксирует очередь:
 * - каждая запись помечается `origin: "user"` и получает `client_id`, чтобы
 *   повтор отправки не создал второй ответ;
 * - отправка идёт в исходном порядке: сетевая ошибка останавливает очередь и
 *   сохраняет остаток, а окончательный отказ сервера (422/401) снимает запись;
 * - очередь не растёт бесконечно — храним последние `OUTBOX_LIMIT` записей.
 *
 * Здесь нет ни IndexedDB, ни сети: хранилище и отправка передаются снаружи,
 * поэтому правила очереди проверяются обычным тестом.
 */

export const OUTBOX_ORIGIN = "user";
export const OUTBOX_LIMIT = 200;

export type OutboxMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export type OutboxItem = {
  id?: number;
  path: string;
  method: OutboxMethod;
  /** Тело уже сериализовано: повтор отправляет ровно то, что видел пользователь. */
  body: string;
  created_at: string;
  attempts: number;
};

export type OutboxStore = {
  add(item: OutboxItem): Promise<number>;
  all(): Promise<OutboxItem[]>;
  remove(id: number): Promise<void>;
};

export type SendOutcome = { ok: true } | { ok: false; retryable: boolean };

export type FlushReport = { sent: number; dropped: number; pending: number };

/** UUID для идемпотентного повтора; запасной вариант — без crypto.randomUUID. */
export function newClientId(): string {
  const randomUuid = typeof crypto !== "undefined" ? crypto.randomUUID : undefined;
  if (typeof randomUuid === "function") return randomUuid.call(crypto);
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createOutbox(store: OutboxStore, now: () => number = Date.now) {
  async function enqueue(
    path: string,
    payload: Record<string, unknown>,
    method: OutboxMethod = "POST",
  ): Promise<OutboxItem> {
    const item: OutboxItem = {
      path,
      method,
      body: JSON.stringify({
        ...payload,
        origin: OUTBOX_ORIGIN,
        client_id: payload.client_id ?? newClientId(),
      }),
      created_at: new Date(now()).toISOString(),
      attempts: 0,
    };
    item.id = await store.add(item);

    const items = await store.all();
    if (items.length > OUTBOX_LIMIT) {
      for (const stale of items.slice(0, items.length - OUTBOX_LIMIT)) {
        if (stale.id != null) await store.remove(stale.id);
      }
    }
    return item;
  }

  async function flush(send: (item: OutboxItem) => Promise<SendOutcome>): Promise<FlushReport> {
    let sent = 0;
    let dropped = 0;
    for (const item of await store.all()) {
      const outcome = await send(item);
      if (outcome.ok) {
        sent += 1;
        if (item.id != null) await store.remove(item.id);
        continue;
      }
      // Сеть лежит — остаток остаётся в очереди в том же порядке.
      if (outcome.retryable) break;
      dropped += 1;
      if (item.id != null) await store.remove(item.id);
    }
    return { sent, dropped, pending: (await store.all()).length };
  }

  async function pending(): Promise<number> {
    return (await store.all()).length;
  }

  return { enqueue, flush, pending };
}

export type Outbox = ReturnType<typeof createOutbox>;
