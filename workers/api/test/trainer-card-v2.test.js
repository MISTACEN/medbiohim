import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminRoutesSource } from "./helpers/admin-routes.js";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const main = (path) => source(`../../../${path}`);

test("карточка v2: миграция аддитивная и с архивом вместо удаления", async () => {
  const sql = await source("../../../database/migrations/20261126_trainer_card_v2.sql");
  assert.match(sql, /add column if not exists is_archived boolean not null default false/i);
  assert.match(sql, /add column if not exists archived_at timestamptz/i);
  assert.match(sql, /create table if not exists public\.trainer_card_images/i);
  assert.match(sql, /references public\.trainer_feed_cards\(id\) on delete cascade/i);
  // Ровно один источник картинки: ключ хранилища или https-ссылка.
  assert.match(sql, /num_nonnulls\(object_key, external_url\) = 1/);
  assert.match(sql, /external_url ~ '\^https:\/\//);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /create policy trainer_card_images_public_select/i);
  // Публичное представление не должно отдавать архивные карточки.
  assert.match(sql, /and c\.is_archived = false/i);
  // Миграция не удаляет и не меняет существующие строки.
  assert.doesNotMatch(sql, /delete from/i);
  assert.doesNotMatch(sql, /drop table/i);
});

test("лента тренажёра отдаёт картинки и не отдаёт архивные карточки", async () => {
  const feed = await source("../src/routes/trainers/01-feed.ts");
  assert.match(feed, /trainer_card_images\(id,object_key,external_url,caption,hotspots,sort_order\)/);
  assert.match(feed, /\.eq\("is_archived", false\)/);
  const shared = await source("../src/routes/trainers/shared.ts");
  assert.match(shared, /export function normalizeHotspots/);
  assert.match(shared, /images,/);
  assert.match(shared, /archived: row\.is_archived === true/);
});

test("нормализатор указателей ограничивает координаты, длину и число меток", async () => {
  const shared = await source("../src/routes/trainers/shared.ts");
  assert.match(shared, /export const HOTSPOT_LIMIT = 60/);
  // Координаты — доли 0..1: выход за диапазон и NaN отбрасываются.
  assert.match(shared, /!Number\.isFinite\(x\) \|\| !Number\.isFinite\(y\) \|\| x < 0 \|\| x > 1 \|\| y < 0 \|\| y > 1/);
  assert.match(shared, /slice\(0, HOTSPOT_LIMIT\)/);
  assert.match(shared, /slice\(0, HOTSPOT_LABEL_LIMIT\)/);
  // Подпись обязательна: метка без текста не сохраняется.
  assert.match(shared, /if \(!label\) continue;/);
});

test("дополнительное изображение отдаётся только у опубликованной и неархивной карточки", async () => {
  const image = await source("../src/routes/trainers/03-image.ts");
  assert.match(image, /trainers\.get\("\/feed\/:id\/images\/:imageId"/);
  assert.match(image, /\.eq\("is_published", true\)/);
  assert.match(image, /\.eq\("is_archived", false\)/);
  // Источник проверяется по карточке, а не только по id изображения.
  assert.match(image, /\.eq\("card_id", cardId\)/);
  assert.match(image, /safeObjectKey/);
  assert.match(image, /x-mbh-image-resolver/);
});

test("админский редактор карточек: права, валидация и service-role", async () => {
  const routes = await adminRoutesSource();
  assert.match(routes, /admin\.get\("\/trainer-cards", requireAuth/);
  assert.match(routes, /admin\.patch\("\/trainer-cards\/:id", requireAuth/);
  assert.match(routes, /admin\.post\("\/trainer-cards\/:id\/images", requireAuth/);
  assert.match(routes, /admin\.patch\("\/trainer-cards\/:id\/images\/:imageId", requireAuth/);
  assert.match(routes, /admin\.delete\("\/trainer-cards\/:id\/images\/:imageId", requireAuth/);
  assert.match(routes, /gate\(c, MANAGERS\)/);
  assert.match(routes, /gate\(c, STRICT_ADMINS\)/);
  assert.match(routes, /createServiceClient\(c\.env\)/);
  assert.match(routes, /Укажите либо ключ хранилища, либо https-ссылку, но не оба/);
  assert.match(routes, /MAX_IMAGES_PER_CARD/);
  assert.match(routes, /archived_at = input\.is_archived \? new Date\(\)\.toISOString\(\) : null/);
  // Регистрация в сборке админ-маршрутов.
  assert.match(routes, /registerTrainerCards\(admin\)/);
  // Архив и указатели не должны трогать содержимое методички: редактор карточки
  // работает только со своими таблицами.
  const cardRoutes = await source("../src/routes/admin/trainer-cards.ts");
  assert.doesNotMatch(cardRoutes, /\.from\("preparation_guides"\)/);
  assert.match(cardRoutes, /trainer_card_images/);
});

test("фронтенд: редактор карточек, навигация и галерея в просмотрщике", async () => {
  const page = await main("src/app/admin/trainer-cards/page.tsx");
  const editor = await main("src/components/admin/TrainerCardEditor.tsx");
  const viewer = await main("src/components/trainers/TrainerImageViewer.tsx");
  const atlas = await main("src/components/trainers/HistologyAtlas.tsx");
  const endpoints = await main("src/lib/endpoints.ts");
  const nav = await main("src/components/admin/AdminNav.tsx");

  assert.match(page, /TrainerCardEditor/);
  assert.match(editor, /adminGetTrainerCard/);
  assert.match(editor, /adminUpdateTrainerCard/);
  assert.match(editor, /adminAddTrainerCardImage/);
  assert.doesNotMatch(editor, /supabase/i);
  assert.match(endpoints, /trainerFeedImageItem: \(id: string, imageId: string\)/);
  assert.match(endpoints, /trainerCards: \(query\?: string\)/);
  assert.match(nav, /href: "\/admin\/trainer-cards"/);
  assert.match(viewer, /activeHotspots/);
  assert.match(viewer, /getTrainerCardImageUrl/);
  assert.match(atlas, /hotspots=\{atlasHotspots\(viewerCard\)\}/);
  assert.match(atlas, /images=\{atlasImages\(viewerCard\)\}/);
  // Хелперы вынесены в lib: компонент обязан оставаться в бюджете 600 строк.
  const atlasLib = await main("src/lib/histologyAtlas.ts");
  assert.match(atlasLib, /export function atlasHotspots/);
  assert.match(atlasLib, /export function atlasImages/);
  const atlasLines = (await main("src/components/trainers/HistologyAtlas.tsx")).split(/\r?\n/).length;
  assert.ok(atlasLines <= 600, `HistologyAtlas.tsx: ${atlasLines} строк > 600`);
});