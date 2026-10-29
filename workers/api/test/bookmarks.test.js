import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("favorites: список hydrated — названия и ссылки пакетно, без N+1", async () => {
  const routes = await source("../src/routes/favorites.ts");
  assert.match(routes, /hydrateFavorites/);
  // Пакетные запросы по типам целей.
  for (const table of ["questions", "materials", "tests", "subjects", "modules", "topics"]) {
    assert.ok(routes.includes(`.from("${table}")`), "missing table: " + table);
  }
  assert.match(routes, /\.in\("id"/);
  // Ссылки строятся на существующие страницы.
  assert.match(routes, /\/practice\?subject_id=/);
  assert.match(routes, /tab=materials/);
  assert.match(routes, /tab=tests/);
  assert.match(routes, /tab=plan/);
  // Сбой гидрации не прячет сами закладки.
  assert.match(routes, /Гидрация — украшение/);
  assert.match(routes, /missing/);
});

test("notes: список hydrated, удаление только своей заметки", async () => {
  const routes = await source("../src/routes/notes.ts");
  assert.match(routes, /hydrateNotes/);
  assert.match(routes, /\.from\("questions"\)/);
  assert.match(routes, /\.from\("tests"\)/);
  assert.match(routes, /\.from\("materials"\)/);
  // DELETE: гейт + owner-фильтр + честные 404/422.
  assert.ok(routes.includes('notes.delete("/:id"'), "delete route missing");
  const start = routes.indexOf('notes.delete("/:id"');
  const body = routes.slice(start, start + 1600);
  assert.match(body, /requireAuth/);
  assert.match(body, /\.eq\("user_id", user\.id\)/);
  assert.match(body, /NOT_FOUND/);
  assert.match(body, /VALIDATION_ERROR/);
  // Ссылки для lecture/ticket не придумываются.
  assert.match(routes, /ссылку не придумываем/);
});
