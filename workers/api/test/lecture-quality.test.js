import test from "node:test";
import assert from "node:assert/strict";
import {
  checkLectureForPublish,
  lectureBodyLength,
  normalizeLectureTitle,
  MIN_PUBLISH_CHARS,
} from "../src/lib/lecture-quality.ts";

const body = (chars) => "# Раздел\n\n" + "Морфология клетки и тканей. ".repeat(Math.ceil(chars / 28));
const full = { id: "lec-full", title: "Основы общей эмбриологии. Половые клетки", subject_slug: "histology", topic: "Эмбриология", body_md: body(30000) };

test("короткий конспект не публикуется как заглушка", () => {
  const issue = checkLectureForPublish({ id: "lec-stub", title: "Кожа", body_md: body(1200) }, [full]);
  assert.equal(issue?.code, "LECTURE_TOO_SHORT");
});

test("дубль по названию блокируется, даже если текст большой", () => {
  const copy = { ...full, id: "lec-copy" };
  const issue = checkLectureForPublish(copy, [full]);
  assert.equal(issue?.code, "DUPLICATE_LECTURE");
  assert.equal(issue?.conflictId, "lec-full");
});

test("запись, помеченная как перенесённая, не публикуется", () => {
  const merged = { id: "lec-merged", title: "Другая тема", body_md: "<!-- MBH:MERGED:INTO hist-03 -->\n" + body(30000) };
  const issue = checkLectureForPublish(merged, []);
  assert.equal(issue?.code, "LECTURE_MERGED_DUPLICATE");
});

test("короткий конспект по теме с полной лекцией — тоже дубль", () => {
  const thin = { id: "lec-thin", title: "Кроветворение", topic: "Эмбриология", body_md: body(4000) };
  const issue = checkLectureForPublish(thin, [full]);
  assert.equal(issue?.code, "DUPLICATE_TOPIC");
});

test("полная уникальная лекция публикуется", () => {
  assert.equal(checkLectureForPublish(full, [{ id: "other", title: "Другое", body_md: body(30000) }]), null);
});

test("название сравнивается без «Неделя 3 · Лекция 3» и регистра", () => {
  assert.equal(normalizeLectureTitle("Неделя 3–4 · Лекция 3 · Общая эмбриология"), normalizeLectureTitle("общая ЭМБРИОЛОГИЯ"));
});

test("объём считается по тексту без разметки", () => {
  assert.ok(lectureBodyLength({ body_md: body(MIN_PUBLISH_CHARS + 500) }) > MIN_PUBLISH_CHARS);
});
