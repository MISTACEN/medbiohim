import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settingsSource = await readFile(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
const academicSource = await readFile(new URL("../src/routes/academic.ts", import.meta.url), "utf8");

test("settings API uses the canonical Supabase preferences table", () => {
  assert.match(settingsSource, /from\("user_preferences"\)/);
  assert.doesNotMatch(settingsSource, /from\("user_settings"\)/);
  assert.match(settingsSource, /settings\.get\("\/account", requireAuth, readAccount\)/);
  assert.match(settingsSource, /settings\.put\("\/preferences", requireAuth, savePreferences\)/);
});

test("academic state does not embed topics through polymorphic target_id", () => {
  assert.match(
    academicSource,
    /from\("student_academic_states"\)\.select\([^\n]*subjects\(name\)\)/,
  );
  assert.doesNotMatch(
    academicSource,
    /from\("student_academic_states"\)\.select\([^\n]*topics\(title\)/,
  );
  assert.match(academicSource, /from\("topics"\)\.select\("id,title"\)\.in\("id", topicIds\)/);
  assert.match(academicSource, /state\.target_type === "topic"/);
});
