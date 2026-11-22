import test from "node:test";
import assert from "node:assert/strict";

import { pickAnswerImages, wantsCourseImage } from "../src/routes/ai/helpers/images.ts";
import { readAiDomain } from "./ai-source.js";

const cards = [
  { id: "feed-prep-1", mode_set: "preparation", preparation: { name: "Трахея", organ: "Трахея" }, tags: ["respiratory"] },
  { id: "feed-prep-2", mode_set: "preparation", preparation: { name: "Трахея", organ: "Трахея" }, tags: ["respiratory"] },
  { id: "feed-prep-3", mode_set: "preparation", preparation: { name: "Почка", organ: "Почка" }, tags: ["urinary"] },
  { id: "feed-em-1", mode_set: "electronogram", preparation: { name: "Митохондрия", organ: "Митохондрия" }, tags: ["cell"] },
];

test("фото прикладывается только при совпадении названия препарата", () => {
  assert.deepEqual(
    pickAnswerImages(cards, "Чем трахея отличается от бронха?").map((image) => image.card_id),
    ["feed-prep-1"],
  );
  // Ни одного названия из банка — ни одной картинки, а не «что-то по теме».
  assert.deepEqual(pickAnswerImages(cards, "Как работает буферная система крови?"), []);
});

test("один препарат — одно фото, даже если снимков в банке несколько", () => {
  const picked = pickAnswerImages(cards, "Трахея и почка: сравни строение", 5);
  assert.deepEqual(picked.map((image) => image.card_id), ["feed-prep-1", "feed-prep-3"]);
});

test("электронограмма помечается своим типом", () => {
  const picked = pickAnswerImages(cards, "Что видно на электронограмме митохондрии?");
  assert.equal(picked.length, 1);
  assert.equal(picked[0].kind, "electronogram");
});

test("для гистологии фото ищем всегда, для других предметов — только по явной просьбе", () => {
  assert.equal(wantsCourseImage("histology", "щелочной резерв крови"), true);
  assert.equal(wantsCourseImage("physiology", "щелочной резерв крови"), false);
  assert.equal(wantsCourseImage("physiology", "объясни микропрепарат трахеи"), true);
  assert.equal(wantsCourseImage(null, "что изображено на снимке"), true);
});

test("маршрут чата отдаёт картинки и просит модель на них сослаться", async () => {
  const route = await readAiDomain();
  assert.match(route, /selectAnswerImages\(c\.get\("supabase"\), subjectSlug, lastQuestion\)/);
  assert.match(route, /К ответу будут приложены изображения курса/);
  assert.match(route, /images: answerImages/);
});
