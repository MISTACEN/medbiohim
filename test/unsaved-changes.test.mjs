import test from "node:test";
import assert from "node:assert/strict";

import { clearDraft, formatDraftTime, readDraft, saveDraft } from "../src/lib/unsaved-changes.ts";

// Минимальная замена localStorage: в Node его нет, а утилита работает только с ним.
function installStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
  return store;
}

test("черновик сохраняется под своим пространством имён и читается обратно", () => {
  const store = installStorage();
  saveDraft("admin:sql", "SELECT 1");
  assert.equal(store.size, 1);
  const [key] = [...store.keys()];
  assert.equal(key, "mbh_draft:admin:sql");
  const draft = readDraft("admin:sql");
  assert.equal(draft?.data, "SELECT 1");
  assert.ok(draft?.savedAt);
});

test("объекты и массивы переживают запись и чтение", () => {
  installStorage();
  const payload = { items: [{ id: "a", title: "Занятие" }], weekStart: "2026-10-27T00:00:00.000Z" };
  saveDraft("admin:schedule:g1:3", payload);
  assert.deepEqual(readDraft("admin:schedule:g1:3")?.data, payload);
});

test("нет черновика — нет ошибки", () => {
  installStorage();
  assert.equal(readDraft("admin:missing"), null);
});

test("битый JSON не ломает страницу", () => {
  const store = installStorage();
  store.set("mbh_draft:admin:broken", "{не json");
  assert.equal(readDraft("admin:broken"), null);
});

test("черновик без поля data считается недействительным", () => {
  const store = installStorage();
  store.set("mbh_draft:admin:shape", JSON.stringify({ savedAt: "2026-10-27T10:00:00.000Z" }));
  assert.equal(readDraft("admin:shape"), null);
});

test("очистка удаляет только свой черновик", () => {
  const store = installStorage();
  saveDraft("admin:sql", "SELECT 1");
  saveDraft("admin:schedule", "grid");
  clearDraft("admin:sql");
  assert.equal(readDraft("admin:sql"), null);
  assert.ok(readDraft("admin:schedule"));
  assert.equal(store.size, 1);
});

test("время черновика показывается по-русски, мусор — как «неизвестно»", () => {
  assert.equal(formatDraftTime(""), "неизвестно");
  assert.equal(formatDraftTime("не дата"), "неизвестно");
  assert.match(formatDraftTime("2026-10-27T10:30:00.000Z"), /\d{2}\.\d{2}/);
});
