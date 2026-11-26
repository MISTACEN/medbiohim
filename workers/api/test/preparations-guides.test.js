// Методические карточки микропрепаратов: тест держит три вещи, которые нельзя
// увидеть в UI — доступ только авторизованным, честное поведение до применения
// миграции и согласованность сида с генератором SQL.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

// test/ → workers/api → workers → корень репозитория
const MIGRATION = "../../../database/migrations/20261120_preparation_guides.sql";
// 19-я методичка «Осевые органы» добавлена отдельной сид-миграцией: базовые 18
// генерируются из сида целиком, а одна позиция — точечно, чтобы не перезаписать
// контент, уже отредактированный в админке.
const AXIAL_MIGRATION = "../../../database/migrations/20261126_axial_organs_guide.sql";

test("гиды и словарь структур закрыты авторизацией и не отдают 503 до миграции", async () => {
  const route = await source("../src/routes/preparations.ts");
  assert.match(route, /preparations\.get\("\/guides", requireAuth/);
  assert.match(route, /preparations\.get\("\/guides\/:key", requireAuth/);
  assert.match(route, /preparations\.get\("\/structures", requireAuth/);
  assert.match(route, /isMissingTable/);
  assert.match(route, /migrated: false/, "до применения миграции атлас получает пустой список, а не ошибку");
  assert.match(route, /KEY_PATTERN/, "ключ препарата валидируется до запроса в БД");

  const index = await source("../src/index.ts");
  assert.match(index, /import preparations from "\.\/routes\/preparations"/);
  assert.match(index, /v1\.route\("\/preparations", preparations\)/);
});

test("миграция идемпотентна и закрывает таблицы RLS", async () => {
  const sql = await source(MIGRATION);
  assert.match(sql, /create table if not exists public\.preparation_guides/);
  assert.match(sql, /create table if not exists public\.preparation_structures/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /create policy preparation_guides_read on public\.preparation_guides\s+for select to authenticated/);
  assert.match(sql, /grant select on public\.preparation_guides to authenticated/);
  assert.match(sql, /on conflict \(key\) do update/, "повторный прогон обновляет контент, а не падает");
});

test("сид покрывает все 19 препаратов первой диагностики", async () => {
  const [sql, axialSql, seed] = await Promise.all([
    source(MIGRATION),
    source(AXIAL_MIGRATION),
    source("../../../src/data/histology-preparations.json"),
  ]);
  const preparats = JSON.parse(seed);
  // 18 генерируемых позиций + «Осевые органы» (2.3), которая раньше стояла в
  // наборе как missing: см. docs/DIAGNOSTICUM-AUDIT-2026-11-26.md §19.
  assert.equal(preparats.length, 19, "первая диагностика — 18 позиций плюс осевые органы");

  for (const item of preparats) {
    assert.ok(
      sql.includes(`('${item.id}'`) || axialSql.includes(`'${item.id}'`),
      `гид ${item.id} отсутствует в миграциях`,
    );
    assert.ok(Array.isArray(item.steps) && item.steps.length >= 4, `у ${item.id} нет шагов поиска`);
    assert.ok(Array.isArray(item.structures) && item.structures.length > 0, `у ${item.id} нет структур`);
  }
});

test("все структуры препаратов есть в словаре", async () => {
  const [sql, axialSql, seed] = await Promise.all([
    source(MIGRATION),
    source(AXIAL_MIGRATION),
    source("../../../src/data/histology-preparations.json"),
  ]);
  const dictionary = new Set();
  for (const part of [sql, axialSql]) {
    for (const match of part.matchAll(/^\s*\('([a-z0-9-]+)', '[^']*', '(?:cell|structure|inclusion|layer)', \d+\),?$/gm)) {
      dictionary.add(match[1]);
    }
  }
  assert.ok(dictionary.size >= 30, `словарь структур слишком мал: ${dictionary.size}`);

  const used = new Set();
  for (const item of JSON.parse(seed)) for (const slug of item.structures) used.add(slug);
  const missing = [...used].filter((slug) => !dictionary.has(slug));
  assert.deepEqual(missing, [], "структуры препаратов должны быть в словаре");
});
