import { adminRoutesSource } from "./helpers/admin-routes.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("методические карточки: чтение для админа и модератора, запись только для админа", async () => {
  const routes = await adminRoutesSource();
  assert.match(routes, /admin\.get\("\/preparation-guides", requireAuth/);
  assert.match(routes, /admin\.put\("\/preparation-guides\/:key", requireAuth/);
  assert.match(routes, /gate\(c, MANAGERS\)/);
  assert.match(routes, /gate\(c, STRICT_ADMINS\)/);
});

test("методические карточки сохраняются upsert-ом по ключу, без дублей", async () => {
  const routes = await adminRoutesSource();
  assert.match(routes, /from\("preparation_guides"\)/);
  assert.match(routes, /\.upsert\(normalized\.row, \{ onConflict: "key" \}\)/);
  assert.match(routes, /createServiceClient\(c\.env\)/);
});

test("методические карточки валидируют ключ, название и сложность", async () => {
  const routes = await adminRoutesSource();
  assert.match(routes, /const KEY_PATTERN = \/\^\[a-z0-9\]\[a-z0-9-\]\{0,79\}\$\//);
  assert.match(routes, /Нужно название препарата/);
  assert.match(routes, /Сложность — целое число от 1 до 3/);
  // Диапазон обязан совпадать с ограничением БД, иначе сохранение падает на constraint.
  const migration = await source("../../../database/migrations/20261120_preparation_guides.sql");
  assert.match(migration, /check \(difficulty between 1 and 3\)/);
  assert.match(migration, /difficulty\s+smallint not null default 1/);
  // Текстовые колонки not null: пустые поля отправляются как "", а не null.
  for (const field of ["section", "system", "organ", "tissue", "stain"]) {
    assert.match(routes, new RegExp(`${field}: shortText\\(input\\?\\.${field}\\) \\?\\? ""`));
  }
  assert.match(routes, /low_magnification: shortText\(input\?\.low_magnification, 500\) \?\? ""/);
  assert.match(routes, /high_magnification: shortText\(input\?\.high_magnification, 500\) \?\? ""/);
  assert.match(routes, /NOT_MIGRATED/);
});

test("редактор методичек размонтирован от второго каталога и читает тот же контракт", async () => {
  const page = await source("../../../src/app/admin/preparation-guides/page.tsx");
  const editor = await source("../../../src/components/admin/PreparationGuideEditor.tsx");
  const endpoints = await source("../../../src/lib/endpoints.ts");
  const nav = await source("../../../src/components/admin/AdminNav.tsx");
  assert.match(page, /PreparationGuideEditor/);
  assert.match(editor, /adminListPreparationGuides/);
  assert.match(editor, /adminSavePreparationGuide/);
  assert.doesNotMatch(editor, /supabase/i);
  assert.match(endpoints, /preparationGuide: \(key: string\)/);
  assert.match(nav, /href: "\/admin\/preparation-guides"/);
});
