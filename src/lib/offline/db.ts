/**
 * Хранилище офлайн-очереди в IndexedDB.
 *
 * Если IndexedDB недоступна (SSR, приватный режим, запрет хранилища), фабрика
 * возвращает `null`: вызывающий код работает как раньше, без офлайн-очереди,
 * а не падает.
 */
import type { OutboxItem, OutboxStore } from "./queue";

const DB_NAME = "medbiohim-offline";
// v2: первая выкладка создавала базу «пустым» probe-открытием без апгрейда —
// object store не возникал, и вся очередь падала с NotFoundError. Подъём
// версии лечит уже затронутые браузеры: апгрейд досоздаёт store.
const DB_VERSION = 2;
const STORE = "outbox";

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE)) {
    db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
  });
}

function request<T>(action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const result = action(tx.objectStore(STORE));
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error ?? new Error("indexedDB request failed"));
      }),
  );
}

export function createIndexedDbStore(): OutboxStore | null {
  if (typeof indexedDB === "undefined") return null;
  try {
    // Проверяем доступность сразу: Safari в приватном режиме бросает здесь.
    // Probe обязан нести тот же апгрейд: иначе первое открытие создаёт базу
    // без object store (прод-баг, пойманный playwright-смоком 2026-11-21).
    const probe = indexedDB.open(DB_NAME, DB_VERSION);
    probe.onupgradeneeded = () => upgrade(probe.result);
    probe.onerror = () => undefined;
    probe.onsuccess = () => probe.result.close();
  } catch {
    return null;
  }

  return {
    add(item: OutboxItem) {
      const { id: _ignored, ...row } = item;
      // IndexedDB возвращает IDBValidKey (число при autoIncrement) — приводим.
      return request<IDBValidKey>((store) => store.add(row)).then((key) => Number(key));
    },
    all() {
      return request<OutboxItem[]>((store) => store.getAll() as IDBRequest<OutboxItem[]>);
    },
    remove(id: number) {
      return request<undefined>((store) => store.delete(id) as IDBRequest<undefined>);
    },
  };
}
