/**
 * Кэш методических карточек: версия контента в ключе.
 *
 * Проверяется то, чего не видно в UI: правка админа должна делать старый кэш
 * недостижимым сразу, а не через TTL, и отсутствие Redis не должно ломать ни
 * чтение, ни сохранение.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CACHE_POLICIES,
  bumpPrepContentVersion,
  cacheKey,
  prepContentVersion,
} from "../src/lib/cache.ts";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

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

test("политики кэша методичек заданы и не превышают сутки", () => {
  for (const name of ["preparations:guides", "preparations:guide", "preparations:structures"]) {
    const policy = CACHE_POLICIES[name];
    assert.ok(policy, `${name} должен быть в CACHE_POLICIES`);
    assert.ok(policy.ttlSeconds > 0 && policy.ttlSeconds <= 300, `${name}: короткий ttl`);
    assert.ok(policy.staleSeconds > 0, `${name}: stale задан`);
  }
});

test("версия контента сдвигается при сохранении и меняет ключ кэша", async () => {
  const store = memoryStore();
  assert.equal(await prepContentVersion(store), "0");

  await bumpPrepContentVersion(store);
  assert.equal(await prepContentVersion(store), "1");

  const before = cacheKey("preparations:guide", { key: "cytology-mitosis", v: "0" });
  const after = cacheKey("preparations:guide", { key: "cytology-mitosis", v: "1" });
  assert.notEqual(before, after, "правка админа не должна попадать в старый ключ");

  await bumpPrepContentVersion(store);
  assert.equal(await prepContentVersion(store), "2");
});

test("без Redis версия нейтральна и бамп ничего не роняет", async () => {
  assert.equal(await prepContentVersion(null), "0");
  await bumpPrepContentVersion(null);

  const broken = {
    async get() {
      throw new Error("redis down");
    },
    async set() {
      throw new Error("redis down");
    },
  };
  assert.equal(await prepContentVersion(broken), "0");
  await bumpPrepContentVersion(broken);
});

test("маршруты читают методички через канонический cached() с версией", async () => {
  const route = await source("../src/routes/preparations.ts");
  assert.match(route, /cached<ListPayload>\("preparations:guides", \{ v: version \}/);
  assert.match(route, /cached<GuidePayload>\("preparations:guide", \{ key, v: version \}/);
  assert.match(route, /cached<ListPayload>\("preparations:structures", \{ v: version \}/);
  assert.match(route, /await prepContentVersion\(store\)/);
});

test("сохранение карточки админом сдвигает версию кэша", async () => {
  const admin = await source("../src/routes/admin/preparation-guides.ts");
  assert.match(admin, /bumpPrepContentVersion\(getRedis\(c\.env\)\)/);
});
