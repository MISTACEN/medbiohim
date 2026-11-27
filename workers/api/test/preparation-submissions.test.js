import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("свои препараты можно править и отправить в атлас", async () => {
  const mine = await source("../src/routes/trainers/04-mine.ts");
  assert.match(mine, /trainers\.patch\("\/feed\/mine/);
  assert.match(mine, /trainers\.post\("\/feed\/mine\/:id\{\[0-9a-fA-F-\]\{36\}\}\/submit"/);
  // Статус модерации пишет service-клиент: у пользователя такого права нет.
  assert.match(mine, /submission_status: "pending"/);
  assert.match(mine, /Сначала добавьте фото препарата/);
  assert.match(mine, /submission_status,moderation_note,published_card_id/);
});

test("заявки в атлас решает только админ, публикуя обычную карточку", async () => {
  const admin = await source("../src/routes/admin/preparation-submissions.ts");
  assert.match(admin, /admin\.get\("\/preparation-submissions"/);
  assert.match(admin, /admin\.post\("\/preparation-submissions\/:id\/approve"/);
  assert.match(admin, /admin\.post\("\/preparation-submissions\/:id\/reject"/);
  assert.match(admin, /gate\(c, MANAGERS\)/);
  assert.match(admin, /gate\(c, STRICT_ADMINS\)/);
  assert.match(admin, /from\("trainer_feed_cards"\)\.insert/);
  assert.match(admin, /from\("trainer_card_images"\)\.insert/);
  assert.match(admin, /contributor: "student"/);
  assert.match(admin, /submission_status: "rejected"/);

  const index = await source("../src/routes/admin/index.ts");
  assert.match(index, /registerPreparationSubmissions\(admin\)/);
});

test("с методичкой одобренная карточка становится заданием тренажёра", async () => {
  const options = await source("../src/routes/admin/preparation-options.ts");
  assert.match(options, /export async function buildIdentifyQuestion/);
  assert.match(options, /from\("preparation_guides"\)/);
  assert.match(options, /correct: true/);
  assert.match(options, /correct: false/);
  assert.match(options, /DISTRACTORS = 3/);

  const admin = await source("../src/routes/admin/preparation-submissions.ts");
  assert.match(admin, /buildIdentifyQuestion\(service, guideKey\)/);
  assert.match(admin, /question,\n      hotspots: \[\]/);

  const mine = await source("../src/routes/trainers/04-mine.ts");
  // Правка доводится до атласа, удаление снимает публикацию.
  assert.match(mine, /syncPublishedCard\(c, updated\)/);
  assert.match(mine, /withdrawPublishedCard\(c, publishedCardId\)/);

  const publication = await source("../src/routes/trainers/mine-publication.ts");
  assert.match(publication, /is_published: false, is_archived: true/);
  assert.match(publication, /name: row\.name/);

  // Замена снимка после одобрения снимает публикацию: атлас показывает
  // проверенный кадр, а не автоматически новый.
  assert.match(mine, /resetPublicationAfterImageChange\(c, updated\)/);
  assert.match(publication, /export async function resetPublicationAfterImageChange/);
  assert.match(publication, /submission_status: "draft"/);
});

test("админ может создать карточку препарата из интерфейса", async () => {
  const create = await source("../src/routes/admin/trainer-card-create.ts");
  assert.match(create, /admin\.post\("\/trainer-cards"/);
  assert.match(create, /gate\(c, STRICT_ADMINS\)/);
  assert.match(create, /buildIdentifyQuestion\(service, guideKey\)/);
  assert.match(create, /contributor: "admin"/);
  assert.match(create, /from\("trainer_feed_cards"\)\s*\.insert/);

  const index = await source("../src/routes/admin/index.ts");
  assert.match(index, /registerTrainerCardCreate\(admin\)/);
});

test("health показывает, настроено ли хранилище снимков", async () => {
  const health = await source("../src/routes/health.ts");
  assert.match(health, /storageProvider: storageProviderName\(env\)/);

  const b2 = await source("../src/lib/b2.ts");
  assert.match(b2, /export function storageProviderName/);
  assert.match(b2, /return env\.UPSTASH_BLOB_TOKEN\?\.trim\(\) \? "upstash" : "none"/);
});

test("очередь заявок видна в сводке админки", async () => {
  const overview = await source("../src/routes/admin/overview.ts");
  // user_preparations под RLS владельца: без service-ключа счётчик был бы нулём.
  assert.match(overview, /createServiceClient/);
  assert.match(overview, /\.eq\("submission_status", "pending"\)/);
  assert.match(overview, /counts\.atlas_submissions =/);
});

test("статус модерации не подделывается из клиента", async () => {
  const migration = await source(
    "../../../database/migrations/20261127140000_user_preparation_submissions.sql",
  );
  assert.match(migration, /submission_status text NOT NULL DEFAULT 'draft'/);
  assert.match(migration, /NEW\.submission_status := OLD\.submission_status/);
  assert.match(migration, /coalesce\(auth\.role\(\), 'anon'\) <> 'service_role'/);
  assert.match(migration, /CREATE TRIGGER user_preparations_guard_submission/);
});

test("атлас видит карточки без вариантов ответа, тренажёр — нет", async () => {
  const feed = await source("../src/routes/trainers/01-feed.ts");
  assert.match(feed, /c\.req\.query\("catalog"\) === "1"/);
  assert.match(feed, /catalog \? mapped : mapped\.filter\(\(card\) => card\.trainable\)/);

  const image = await source("../src/routes/trainers/user-image.ts");
  assert.match(image, /getStorageBackend/);
  assert.match(image, /x-mbh-image-resolver": "user-file"/);
  const route = await source("../src/routes/trainers/03-image.ts");
  assert.match(route, /userPreparationImageResponse\(c, userFileId, rid\)/);
});
