import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settingsSource = await readFile(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
const academicSource = await readFile(new URL("../src/routes/academic.ts", import.meta.url), "utf8");
const telegramSource = await readFile(new URL("../src/routes/telegram.ts", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const telegramMigration = await readFile(new URL("../../../database/migrations/20261017120000_telegram_account_linking_rpc.sql", import.meta.url), "utf8");
const groupsSource = await readFile(new URL("../src/routes/groups.ts", import.meta.url), "utf8");
const authSource = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const meSource = await readFile(new URL("../src/routes/me.ts", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../src/routes/dashboard.ts", import.meta.url), "utf8");
const mySource = await readFile(new URL("../src/routes/my.ts", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const adminRlsMigration = await readFile(new URL("../../../supabase/migrations/20261016160523_admin_user_directory_rls.sql", import.meta.url), "utf8");

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

test("Telegram account linking is authenticated, webhook-secret protected, and delegated to atomic RPCs", () => {
  assert.ok(indexSource.includes('v1.route("/telegram", telegram)'));
  assert.ok(settingsSource.includes('settings.get("/telegram/status", requireAuth, readTelegramStatus)'));
  assert.ok(settingsSource.includes('settings.post("/telegram/link-start", requireAuth, startTelegramLink)'));
  assert.ok(settingsSource.includes('settings.post("/telegram/unlink", requireAuth, unlinkTelegramAccount)'));
  assert.ok(telegramSource.includes('x-telegram-bot-api-secret-token'));
  assert.ok(telegramSource.includes('confirm_telegram_account_link'));
  assert.ok(telegramSource.includes('SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_SERVICE_KEY || c.env.SUPABASE_SECRET_KEY'));
  assert.ok(telegramSource.includes('^[a-f0-9]{48}$'));
  assert.ok(!telegramSource.includes('console.log(token'));
});

test("Telegram account-link migration keeps tables private and grants only the intended RPCs", () => {
  assert.ok(telegramMigration.includes("ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY"));
  assert.ok(telegramMigration.includes("REVOKE ALL ON TABLE public.telegram_accounts FROM PUBLIC, anon, authenticated"));
  assert.ok(telegramMigration.includes("create_my_telegram_link_token"));
  assert.ok(telegramMigration.includes("get_my_telegram_account"));
  assert.ok(telegramMigration.includes("unlink_my_telegram_account"));
  assert.ok(telegramMigration.includes("confirm_telegram_account_link"));
  assert.ok(telegramMigration.includes("GRANT EXECUTE ON FUNCTION public.confirm_telegram_account_link"));
  assert.ok(telegramMigration.includes("SECURITY DEFINER"));
});

test("admin user directory RLS stays admin-only and does not disable RLS", () => {
  for (const policy of [
    "users_select_admin_v1",
    "users_update_admin_v1",
    "user_roles_select_admin_v1",
    "user_roles_insert_admin_v1",
    "user_roles_delete_admin_v1",
  ]) assert.ok(adminRlsMigration.includes(policy), "missing admin RLS policy: " + policy);
  assert.ok(adminRlsMigration.includes("TO authenticated"));
  assert.ok(adminRlsMigration.includes("private.has_app_role((SELECT auth.uid()), 'admin')"));
  assert.ok(!/DISABLE ROW LEVEL SECURITY/i.test(adminRlsMigration));
  assert.ok(!/TO anon/i.test(adminRlsMigration));
});
