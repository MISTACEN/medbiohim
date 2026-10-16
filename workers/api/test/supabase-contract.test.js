import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settingsSource = await readFile(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
const academicSource = await readFile(new URL("../src/routes/academic.ts", import.meta.url), "utf8");
const groupsSource = await readFile(new URL("../src/routes/groups.ts", import.meta.url), "utf8");
const authSource = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const meSource = await readFile(new URL("../src/routes/me.ts", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../src/routes/dashboard.ts", import.meta.url), "utf8");
const mySource = await readFile(new URL("../src/routes/my.ts", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");

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

test("group and profile APIs use real Supabase group-membership columns", () => {
  for (const source of [groupsSource, authSource, meSource, dashboardSource, mySource]) {
    assert.ok(source.includes("role_in_group"), "membership role must use role_in_group");
    assert.ok(source.includes("course_number"), "group course must use course_number");
    assert.ok(!source.includes("groups(id,name,specialty_slug,course,semester"), "must not select nonexistent groups.course/semester columns");
  }
  assert.ok(groupsSource.includes('select("id,name,code,specialty_slug,course_number,is_active")'));
  assert.ok(groupsSource.includes('select("group_id,role_in_group,groups(id,name,code,specialty_slug,course_number,is_active)")'));
  assert.ok(adminSource.includes('.select("id,name,code,course_number,is_active")'));
  assert.ok(!adminSource.includes(`role_in_group: "student", updated_at:`));
});
