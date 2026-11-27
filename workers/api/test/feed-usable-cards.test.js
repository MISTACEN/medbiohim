import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("лента тренажёра не отдаёт нерешаемые карточки", async () => {
  const shared = await source("../src/routes/trainers/shared.ts");
  assert.match(shared, /export function isTrainableCard/);
  assert.match(shared, /card\.has_image === true && Array\.isArray\(card\.options\) && card\.options\.length > 0/);

  const feed = await source("../src/routes/trainers/01-feed.ts");
  // Фильтр применяется до нарезки offset/limit, иначе страницы «переезжают».
  // Каталог атласа (`catalog=1`) приходит без фильтра, но с флагом trainable.
  assert.match(feed, /mapped\.filter\(\(card\) => card\.trainable\)/);
  assert.match(feed, /\.map\(\(card\) => \(\{ \.\.\.card, trainable: isTrainableCard\(card\) \}\)\)/);
  assert.match(feed, /all\.slice\(offset, offset \+ limit\)/);
  assert.match(feed, /total: all\.length/);
});

test("снимок на статике сайта считается изображением карточки", async () => {
  const shared = await source("../src/routes/trainers/shared.ts");
  assert.match(shared, /preparation\.imageUrl \|\| preparation\.imagePath \|\| preparation\.imageStatic/);
  assert.match(shared, /const imageStatic = cleanLegacyPath/);

  const image = await source("../src/routes/trainers/03-image.ts");
  assert.match(image, /prep\.imageStatic/);
  // Редирект ведёт на origin сайта: `/library/...` лежит только там, а домен
  // воркера отдавал 404 и «Изображение недоступно».
  assert.match(image, /c\.env\.APP_ORIGIN \|\| "https:\/\/medbiohim\.vercel\.app"/);
  assert.match(image, /c\.redirect\(new URL\(staticImage, `\$\{siteOrigin\}\/`\)\.toString\(\), 302\)/);
  assert.doesNotMatch(image, /new URL\(c\.req\.url\)\.origin/);

  const model = await source("../src/routes/diagnosticum/model.ts");
  assert.match(model, /text\(preparation\?\.imagePath\) \|\| text\(preparation\?\.imageUrl\) \|\| text\(preparation\?\.imageStatic\)/);
});

test("серия собирается только из карточек со снимком и вариантами ответа", async () => {
  const sql = await source("../../../database/migrations/20261127_histology_training_usable_cards.sql");
  assert.match(sql, /create or replace function public\.histology_training_create/i);
  assert.match(sql, /c\.preparation->>'imagePath'/);
  assert.match(sql, /jsonb_array_length\(c\.question->'options'\) > 0/);
  assert.doesNotMatch(sql, /(^|\n)\s*delete\s+from/i);
  assert.doesNotMatch(sql, /(^|\n)\s*drop\s+(table|function)/i);
});

test("проверка ответа и подсказки пишут только серверным клиентом", async () => {
  const session = await source("../src/routes/diagnosticum/session.ts");
  assert.doesNotMatch(session, /c\s*\n?\s*\.get\("supabase"\)\s*\n?\s*\.from\("diagnosticum_attempts"\)\s*\n?\s*\.update/);

  const sql = await source("../../../database/migrations/20261127_diagnosticum_attempts_update_guard.sql");
  assert.match(sql, /revoke update on public\.diagnosticum_attempts from authenticated/);
  assert.match(sql, /grant select, insert on public\.diagnosticum_attempts to authenticated/);
});
