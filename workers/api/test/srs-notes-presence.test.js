import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("SRS exposes the full legacy contract used by /cards", async () => {
  const srs = await source("../src/routes/srs.ts");
  for (const contract of [
    'srs.get("/summary"',
    'srs.post("/ensure"',
    'srs.get("/cards"',
    'srs.post("/cards"',
    'srs.post("/review"',
    'srs.delete("/cards/:id"',
    'srs.get("/due"',
  ]) {
    assert.ok(srs.includes(contract), "missing SRS contract: " + contract);
  }
  assert.match(srs, /requireAuth/);
  assert.match(srs, /\.eq\("user_id", user\.id\)/);
  assert.match(srs, /new_available/);
});

test("SRS review is bounded to four ratings and updates the card instead of a missing table", async () => {
  const srs = await source("../src/routes/srs.ts");
  assert.match(srs, /rating < 1 \|\| rating > 4/);
  assert.match(srs, /from\("srs_cards"\)/);
  assert.doesNotMatch(srs, /srs_reviews/);
  assert.match(srs, /due_at:/);
  assert.match(srs, /summary:/);
});

test("Notes are owner-scoped and mounted on the canonical API", async () => {
  const index = await source("../src/index.ts");
  const notes = await source("../src/routes/notes.ts");
  assert.match(index, /import notes from "\.\/routes\/notes"/);
  assert.match(index, /v1\.route\("\/notes", notes\)/);
  assert.match(notes, /notes\.get\("\/", requireAuth/);
  assert.match(notes, /notes\.post\("\/", requireAuth/);
  assert.match(notes, /\.eq\("user_id", user\.id\)/);
  assert.match(notes, /target_type/);
});

test("Admin presence is gated and reads heartbeat timestamps", async () => {
  const admin = await source("../src/routes/admin.ts");
  assert.match(admin, /admin\.get\("\/presence", requireAuth/);
  assert.match(admin, /gate\(c, MANAGERS\)/);
  assert.match(admin, /presence:/);
  assert.match(admin, /seconds_ago/);
});
