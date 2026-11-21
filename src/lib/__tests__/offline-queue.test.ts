import { describe, expect, it } from "vitest";

import {
  OUTBOX_LIMIT,
  createOutbox,
  newClientId,
  type OutboxItem,
  type OutboxStore,
} from "@/lib/offline/queue";

function memoryStore(): OutboxStore & { items: OutboxItem[] } {
  let nextId = 1;
  const items: OutboxItem[] = [];
  return {
    items,
    async add(item) {
      const id = nextId++;
      items.push({ ...item, id });
      return id;
    },
    async all() {
      return [...items];
    },
    async remove(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
    },
  };
}

describe("офлайн-очередь", () => {
  it("помечает запись origin=user и даёт client_id", async () => {
    const outbox = createOutbox(memoryStore());
    const item = await outbox.enqueue("/trainers/feed/answer", { card_id: "card-1", option_id: "a" });

    const body = JSON.parse(item.body);
    expect(body.origin).toBe("user");
    expect(body.card_id).toBe("card-1");
    expect(body.client_id).toMatch(/^[0-9a-f-]{8,}$/i);
    expect(newClientId()).not.toBe(newClientId());
  });

  it("не перезаписывает client_id, если он уже передан", async () => {
    const outbox = createOutbox(memoryStore());
    const item = await outbox.enqueue("/x", { client_id: "cid-42" });
    expect(JSON.parse(item.body).client_id).toBe("cid-42");
  });

  it("отправляет по порядку и очищает успешные", async () => {
    const store = memoryStore();
    const outbox = createOutbox(store);
    await outbox.enqueue("/a", { n: 1 });
    await outbox.enqueue("/b", { n: 2 });

    const order: string[] = [];
    const report = await outbox.flush(async (item) => {
      order.push(item.path);
      return { ok: true };
    });

    expect(order).toEqual(["/a", "/b"]);
    expect(report).toEqual({ sent: 2, dropped: 0, pending: 0 });
    expect(store.items).toHaveLength(0);
  });

  it("при сетевой ошибке останавливается и сохраняет остаток", async () => {
    const store = memoryStore();
    const outbox = createOutbox(store);
    await outbox.enqueue("/a", { n: 1 });
    await outbox.enqueue("/b", { n: 2 });

    const tried: string[] = [];
    const report = await outbox.flush(async (item) => {
      tried.push(item.path);
      return { ok: false, retryable: true };
    });

    expect(tried).toEqual(["/a"]);
    expect(report).toEqual({ sent: 0, dropped: 0, pending: 2 });
  });

  it("окончательный отказ сервера снимает запись, а не копит её", async () => {
    const store = memoryStore();
    const outbox = createOutbox(store);
    await outbox.enqueue("/bad", {});
    await outbox.enqueue("/good", {});

    const report = await outbox.flush(async (item) =>
      item.path === "/bad" ? { ok: false, retryable: false } : { ok: true },
    );

    expect(report).toEqual({ sent: 1, dropped: 1, pending: 0 });
    expect(store.items).toHaveLength(0);
  });

  it("не растёт бесконечно: старые записи вытесняются", async () => {
    const store = memoryStore();
    const outbox = createOutbox(store);
    for (let index = 0; index < OUTBOX_LIMIT + 5; index += 1) {
      await outbox.enqueue(`/item-${index}`, { index });
    }
    expect(store.items).toHaveLength(OUTBOX_LIMIT);
    expect(JSON.parse(store.items[0].body).index).toBe(5);
  });

  it("pending считает текущее содержимое очереди", async () => {
    const outbox = createOutbox(memoryStore());
    expect(await outbox.pending()).toBe(0);
    await outbox.enqueue("/a", {});
    expect(await outbox.pending()).toBe(1);
  });
});
