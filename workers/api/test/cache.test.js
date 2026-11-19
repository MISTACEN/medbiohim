import test from "node:test";
import assert from "node:assert/strict";

import {
  CACHE_POLICIES,
  cacheKey,
  cached,
  isFresh,
  readCacheEntry,
  stableStringify,
} from "../src/lib/cache.ts";

/** Upstash-подобное хранилище в памяти: тесты не ходят в сеть. */
function memoryStore(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    async get(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    async set(key, value) {
      entries.set(key, value);
      return "OK";
    },
  };
}

const policy = CACHE_POLICIES["subjects:catalog"];

test("ключ кэша не зависит от порядка параметров", () => {
  const a = cacheKey("subjects:catalog", { course: 2, semester: 3, includeInactive: false });
  const b = cacheKey("subjects:catalog", { includeInactive: false, semester: 3, course: 2 });
  assert.equal(a, b);
  assert.match(a, /^cache:v1:subjects:catalog:[0-9a-f]{8}$/);
});

test("ключ различает разные параметры и не содержит сырых значений", () => {
  const a = cacheKey("subjects:catalog", { course: 2 });
  const b = cacheKey("subjects:catalog", { course: 3 });
  assert.notEqual(a, b);
  assert.equal(a.includes("course"), false);
});

test("undefined не участвует в ключе, null участвует", () => {
  assert.equal(
    cacheKey("subjects:catalog", { course: undefined, semester: 3 }),
    cacheKey("subjects:catalog", { semester: 3 }),
  );
  assert.notEqual(
    cacheKey("subjects:catalog", { course: null }),
    cacheKey("subjects:catalog", {}),
  );
});

test("стабильная сериализация сортирует ключи вложенных объектов", () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
  assert.equal(stableStringify([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
});

test("свежесть считается по времени записи и TTL политики", () => {
  const at = 1_000_000;
  assert.equal(isFresh(at, policy, at + policy.ttlSeconds * 1000 - 1), true);
  assert.equal(isFresh(at, policy, at + policy.ttlSeconds * 1000), false);
  // Часы «назад» не делают запись вечной.
  assert.equal(isFresh(at, policy, at - 1), false);
});

test("свежая запись отдаётся без вызова загрузчика", async () => {
  const now = 5_000_000;
  const store = memoryStore();
  await store.set(cacheKey("subjects:catalog", {}), { at: now, value: [{ id: "cached" }] });

  let calls = 0;
  const value = await cached(
    "subjects:catalog",
    {},
    async () => {
      calls += 1;
      return [{ id: "fresh" }];
    },
    { store, now },
  );

  assert.deepEqual(value, [{ id: "cached" }]);
  assert.equal(calls, 0);
});

test("устаревшая запись отдаётся сразу, обновление уходит в waitUntil", async () => {
  const now = 9_000_000;
  const key = cacheKey("subjects:catalog", {});
  const store = memoryStore({ [key]: { at: now - (policy.ttlSeconds + 5) * 1000, value: ["old"] } });

  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = [];
  const value = await cached(
    "subjects:catalog",
    {},
    async () => {
      await gate;
      return ["new"];
    },
    { store, now, waitUntil: (task) => pending.push(task) },
  );

  assert.deepEqual(value, ["old"]);
  assert.equal(pending.length, 1, "обновление запланировано в waitUntil");

  release();
  await pending[0];
  const entry = await readCacheEntry(store, key);
  assert.deepEqual(entry.value, ["new"]);
});

test("без waitUntil устаревшая запись всё равно обновляется к следующему запросу", async () => {
  const now = 7_000_000;
  const key = cacheKey("subjects:catalog", { course: 1 });
  const store = memoryStore({ [key]: { at: now - (policy.ttlSeconds + 1) * 1000, value: ["old"] } });

  const value = await cached("subjects:catalog", { course: 1 }, async () => ["new"], { store, now });
  assert.deepEqual(value, ["old"]);
  const entry = await readCacheEntry(store, key);
  assert.deepEqual(entry.value, ["new"]);
});

test("ошибка загрузчика при обновлении не ломает ответ из кэша", async () => {
  const now = 3_000_000;
  const store = memoryStore({
    [cacheKey("subjects:catalog", {})]: { at: now - 10_000_000, value: ["old"] },
  });
  const value = await cached(
    "subjects:catalog",
    {},
    async () => {
      throw new Error("db down");
    },
    { store, now },
  );
  assert.deepEqual(value, ["old"]);
});

test("промах: значение загружается и кладётся в кэш с TTL = ttl + stale", async () => {
  const store = memoryStore();
  const seen = [];
  const set = store.set.bind(store);
  store.set = async (key, value, options) => {
    seen.push(options);
    return set(key, value, options);
  };

  const value = await cached("subjects:catalog", {}, async () => ["fresh"], { store, now: 1 });
  assert.deepEqual(value, ["fresh"]);
  assert.deepEqual(seen, [{ ex: policy.ttlSeconds + policy.staleSeconds }]);
});

test("без Redis работает как без кэша (fail-open)", async () => {
  let calls = 0;
  const value = await cached("subjects:catalog", {}, async () => {
    calls += 1;
    return ["direct"];
  }, { store: null });
  assert.deepEqual(value, ["direct"]);
  assert.equal(calls, 1);
});

test("ошибка чтения Redis не роняет запрос", async () => {
  const store = {
    async get() {
      throw new Error("redis down");
    },
    async set() {
      throw new Error("redis down");
    },
  };
  const value = await cached("subjects:catalog", {}, async () => ["direct"], { store });
  assert.deepEqual(value, ["direct"]);
});

test("битое значение в кэше считается промахом", async () => {
  const key = cacheKey("subjects:catalog", {});
  const store = memoryStore({ [key]: "{not json" });
  assert.equal(await readCacheEntry(store, key), null);
  const value = await cached("subjects:catalog", {}, async () => ["fresh"], { store });
  assert.deepEqual(value, ["fresh"]);
});

test("политики кэша заданы осмысленно", () => {
  for (const [name, item] of Object.entries(CACHE_POLICIES)) {
    assert.ok(item.ttlSeconds > 0, `${name}: ttl > 0`);
    assert.ok(item.staleSeconds > 0, `${name}: stale > 0`);
    assert.ok(item.ttlSeconds < 86_400, `${name}: ttl меньше суток`);
  }
});
