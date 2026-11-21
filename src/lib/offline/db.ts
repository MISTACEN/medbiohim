/**
 * Хранилище офлайн-очереди в IndexedDB.
 *
 * Если IndexedDB недоступна (SSR, приватный режим, запрет хранилища), фабрика
 * возвращает `null`: вызывающий код работает как раньше, без офлайн-очереди,
 * а не падает.
 */
import type { OutboxItem, OutboxStore } from "./queue";

const DB_NAME = "medbiohim-offline";
const DB_VERSION = 1;
const STORE = "outbox";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
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
    const probe = indexedDB.open(DB_NAME, DB_VERSION);
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
