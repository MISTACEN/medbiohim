import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settingsSource = await readFile(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
const academicSource = await readFile(new URL("../src/routes/academic.ts", import.meta.url), "utf8");

test("settings API uses the canonical Supabase preferences table and protects account mutations", () => {
  for (const contract of [
    'from("user_preferences")',
    'settings.get("/account", requireAuth, readAccount)',
    'settings.put("/preferences", requireAuth, savePreferences)',
    'settings.patch("/profile", requireAuth, updateProfile)',
    'settings.post("/password", requireAuth, changePassword)',
    'settings.post("/identities/link", requireAuth, startIdentityLink)',
    'settings.post("/identities/unlink", requireAuth, unlinkIdentity)',
    'from("users").update(patch).eq("id", user.id).select("id").maybeSingle()',
    'authUrl = new URL("/auth/v1/user", c.env.SUPABASE_URL)',
    'identities.length <= 1',
  ]) assert.ok(settingsSource.includes(contract), `missing settings contract: ${contract}`);
  assert.ok(!settingsSource.includes('from("user_settings")'));
});

test("academic state avoids embedding topics through polymorphic target_id and surfaces query failures", () => {
  assert.ok(academicSource.includes('from("student_academic_states").select("id,target_type,target_id,subject_id,learning_status,academic_status,execution_status,manual_override,note,last_result,last_result_max,updated_at,subjects(name)")'));
  assert.ok(!academicSource.includes('topics(title)'));
  assert.ok(academicSource.includes('from("topics").select("id,title").in("id", topicIds)'));
  assert.ok(academicSource.includes('state.target_type === "topic"'));
  assert.ok(academicSource.includes('if (progressResult.error) throw progressResult.error;'));
  assert.ok(academicSource.includes('if (profileResult.error) throw profileResult.error;'));
});
