import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settingsSource = await readFile(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
const academicSource = await readFile(new URL("../src/routes/academic.ts", import.meta.url), "utf8");
const telegramSource = await readFile(new URL("../src/routes/telegram.ts", import.meta.url), "utf8");
const filesSource = await readFile(new URL("../src/routes/files.ts", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const telegramMigration = await readFile(new URL("../../../database/migrations/20261017120000_telegram_account_linking_rpc.sql", import.meta.url), "utf8");
const groupsSource = await readFile(new URL("../src/routes/groups.ts", import.meta.url), "utf8");
const authSource = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const meSource = await readFile(new URL("../src/routes/me.ts", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../src/routes/dashboard.ts", import.meta.url), "utf8");
const mySource = await readFile(new URL("../src/routes/my.ts", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const plansSource = await readFile(new URL("../src/routes/plans.ts", import.meta.url), "utf8");
const testsSource = await readFile(new URL("../src/routes/tests.ts", import.meta.url), "utf8");
const ticketsSource = await readFile(new URL("../src/routes/tickets.ts", import.meta.url), "utf8");
const subjectsRouteSource = await readFile(new URL("../src/routes/subjects.ts", import.meta.url), "utf8");
const subjectPageSource = await readFile(new URL("../../../src/app/subjects/[id]/page.tsx", import.meta.url), "utf8");
const subjectTestsPageSource = await readFile(new URL("../../../src/app/subjects/[id]/tests/page.tsx", import.meta.url), "utf8");
const apiClientSource = await readFile(new URL("../../../src/lib/api.ts", import.meta.url), "utf8");
const chemistryTicketMigration = await readFile(new URL("../../../database/migrations/20261017160000_canonicalize_organic_chemistry_ticket_bank.sql", import.meta.url), "utf8");
const adminRlsMigration = await readFile(new URL("../../../supabase/migrations/20261016160523_admin_user_directory_rls.sql", import.meta.url), "utf8");

test("settings API uses the canonical Supabase preferences table and protects account mutations", () => {
  for (const contract of [
    'from("user_preferences")',
    'settings.get("/account", requireAuth, readAccount)',
    'settings.get("/preferences", requireAuth, readPreferences)',
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

test("files API persists metadata under the caller and enforces existing RLS access", () => {
  assert.ok(indexSource.includes('v1.route("/files", files)'));
  assert.ok(filesSource.includes('files.post("/upload", requireAuth'));
  assert.ok(filesSource.includes('files.get("/:id", requireAuth'));
  assert.ok(filesSource.includes('files.get("/:id/download", requireAuth'));
  assert.ok(filesSource.includes('uploaded_by: user.id'));
  assert.ok(filesSource.includes('storage_provider: "unknown"'));
  assert.ok(filesSource.includes("files_storage_provider_check"));
  assert.ok(filesSource.includes('await bucket.del(key)'));
  assert.ok(filesSource.includes('hasSpecialtyAccess'));
  assert.ok(filesSource.includes('group_memberships'));
  assert.ok(filesSource.includes('from("materials").select("subject_id")'));
  assert.ok(filesSource.includes('subject.slug === "histology" || subject.specialty_slug === "mbh"'));
});

test("subject content routes resolve duplicate slugs by semester and return test counts", () => {
  assert.ok(plansSource.includes('c.req.query("course")'));
  assert.ok(plansSource.includes('c.req.query("semester")'));
  assert.ok(plansSource.includes('weeks,'));
  assert.ok(testsSource.includes('c.req.query("subject_slug")'));
  assert.ok(testsSource.includes('subjectId = String(subjects[0].id)'));
  assert.ok(testsSource.includes('questions_count: counts.get(String(item.id)) || 0'));
  assert.ok(testsSource.includes('subject_slug: subjectSlug || null'));
  assert.ok(testsSource.includes('course_number: course || null'));
  assert.ok(testsSource.includes('semester: semester || null'));
});

test("ticket bank catalog reads canonical banks and generates source-backed questions without exam-mode answers", () => {
  assert.ok(ticketsSource.includes('tickets.get("/banks", requireAuth'));
  assert.ok(ticketsSource.includes('from("ticket_banks")'));
  assert.ok(ticketsSource.includes('from("exam_questions")'));
  assert.ok(ticketsSource.includes('.eq("for_ticket", true)'));
  assert.ok(ticketsSource.includes('tickets.post("/generate", requireAuth'));
  assert.ok(ticketsSource.includes('mode === "practice" ? { answer, has_answer: Boolean(answer.trim()) } : {}'));
  assert.ok(ticketsSource.includes('title.includes("ситуационные задачи")'));
  assert.ok(ticketsSource.includes('title.includes("экзаменационные препараты")'));
  assert.ok(apiClientSource.includes('apiCached("/tickets/banks")'));
  assert.ok(subjectPageSource.includes('disabled={Number(b.count ?? 0) <= 0}'));
  assert.ok(subjectPageSource.includes('const firstAvailableBank = subjectBanks.find'));
  assert.ok(subjectPageSource.includes('setTicketQuestions([])'));
  assert.ok(subjectPageSource.includes('(responseData?.id ? responseData : null)'));
  assert.ok(subjectPageSource.includes('const s: any = { ...(hit || {}), ...(subjectPayload || {}) };'));
  assert.ok(chemistryTicketMigration.includes("subject_slug='organic_chemistry'"));
  assert.ok(chemistryTicketMigration.includes("SET subject_slug='chemistry_organic_physical'"));
});

test("subject test pages keep catalog queries scoped to canonical subject, course, and semester", () => {
  assert.ok(subjectPageSource.includes('String(t.subject_slug || "") === slug'));
  assert.ok(subjectPageSource.includes('Number(t.course_number) === Number(subject?.course_number ?? 2)'));
  assert.ok(subjectPageSource.includes('Number(t.semester) === Number(subject?.semester ?? 3)'));
  assert.ok(subjectTestsPageSource.includes('const rows = await listTests('));
  assert.ok(subjectTestsPageSource.includes('slug,'));
  assert.ok(subjectTestsPageSource.includes('Number(selected?.course_number ?? 2)'));
  assert.ok(subjectTestsPageSource.includes('Number(selected?.semester ?? 3)'));
});

test("subject detail accepts the Cloudflare response shape and preserves workload fields", () => {
  assert.ok(subjectPageSource.includes("responseData?.subject || responseData?.item"));
  assert.ok(subjectTestsPageSource.includes("subject.data.subject || subject.data.item || (subject.data.id ? subject.data : null)"));
  assert.ok(subjectsRouteSource.includes("total_hours,lecture_hours,practice_hours,self_study_hours"));
  assert.ok(subjectPageSource.includes("w.description"));
});

test("admin file audit endpoints are strict-admin-only and non-destructive", () => {
  assert.ok(adminSource.includes('admin.get("/files/capabilities", requireAuth'));
  assert.ok(adminSource.includes('admin.get("/files/audit", requireAuth'));
  assert.ok(adminSource.includes('gate(c, STRICT_ADMINS)'));
  assert.ok(adminSource.includes('createServiceDb(c.env)'));
  assert.ok(adminSource.includes('destructive_actions: false'));
  assert.ok(adminSource.includes('physical_check: "not_run"'));
});
