import test from "node:test";
import assert from "node:assert/strict";
import { mimeTypeFor, safeObjectKey } from "../scripts/migrate-histology-blob.mjs";

test("object keys preserve existing atlas aliases and Unicode paths", () => {
  assert.equal(safeObjectKey("electronograms/images/apoptoz.png"), true);
  assert.equal(safeObjectKey("em/apoptoz.png"), true);
  assert.equal(safeObjectKey("5_Фотографии препаратов/Кровь/образец.jpg"), true);
});

test("object keys reject traversal, ambiguous separators and URL/control characters", () => {
  for (const key of ["", "/absolute.png", "../secret", "a/../b", "a//b", "a\\b", "a?x", "a#x", "a\u0000b"]) {
    assert.equal(safeObjectKey(key), false, `should reject ${JSON.stringify(key)}`);
  }
});

test("MIME type mapping covers media and study documents", () => {
  assert.equal(mimeTypeFor("slide.JPG"), "image/jpeg");
  assert.equal(mimeTypeFor("electronograms/apoptoz.png"), "image/png");
  assert.equal(mimeTypeFor("book.pdf"), "application/pdf");
  assert.equal(mimeTypeFor("lecture.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(mimeTypeFor("lecture.doc"), "application/msword");
  assert.equal(mimeTypeFor("unknown.bin"), "application/octet-stream");
});
