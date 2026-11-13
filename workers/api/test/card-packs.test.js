import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("card-packs mounted under gated subjects module", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import cardPacks from "\.\/routes\/card-packs"/);
  assert.match(index, /v1\.route\("\/card-packs", gatedModule\("subjects", cardPacks\)\)/);
});

test("every write is owner-scoped (RLS belt-and-suspenders on top of DB policies)", async () => {
  const route = await source("../src/routes/card-packs.ts");
  assert.match(route, /\.eq\("owner_id", c\.get\("user"\)\.id\)/);
  // Импорт чужого пака требует публикации.
  assert.match(route, /Импортировать можно только опубликованные паки/);
  assert.match(route, /is_published/);
  // Нельзя выдать себя за другого владельца.
  assert.doesNotMatch(route, /owner_id:\s*input/);
});

test("pack creation validates and caps payload", async () => {
  const route = await source("../src/routes/card-packs.ts");
  assert.match(route, /MAX_PACK_ITEMS = 100/);
  assert.match(route, /Нужен заголовок пака/);
  assert.match(route, /Нужны карточки \(front\/back\)/);
  assert.match(route, /input\?\.source === "ai" \? "ai" : "user"/);
});

test("AI generation quotes lectures verbatim and returns a draft only", async () => {
  const route = await source("../src/routes/card-packs.ts");
  assert.match(route, /ДОСЛОВНО из приведённых ниже фрагментов лекций/);
  assert.match(route, /Ничего не выдумывай/);
  assert.match(route, /buildLectureContext\(db, subjectSlug, topic\)/);
  assert.match(route, /NO_LECTURE_CONTEXT/);
  // Черновик не сохраняется в БД в этом эндпоинте.
  assert.doesNotMatch(route.split("ai-generate")[1].split("export default")[0], /\.from\("card_packs"\)\s*\.\s*insert/);
});

test("chunked item insert guards against pooler resets", async () => {
  const route = await source("../src/routes/card-packs.ts");
  assert.match(route, /const CHUNK = 25/);
});
