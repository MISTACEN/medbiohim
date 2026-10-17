import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const materialsSource = await readFile(new URL("../src/routes/materials.ts", import.meta.url), "utf8");
const trainersSource = await readFile(new URL("../src/routes/trainers.ts", import.meta.url), "utf8");
const curriculumSource = await readFile(new URL("../src/routes/curriculum.ts", import.meta.url), "utf8");
const curriculumPageSource = await readFile(new URL("../../../src/app/curriculum/page.tsx", import.meta.url), "utf8");
const settingsSource = await readFile(new URL("../src/routes/settings.ts", import.meta.url), "utf8");
const academicSource = await readFile(new URL("../src/routes/academic.ts", import.meta.url), "utf8");
const telegramSource = await readFile(new URL("../src/routes/telegram.ts", import.meta.url), "utf8");
const filesSource = await readFile(new URL("../src/routes/files.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../src/routes/storage.ts", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const telegramMigration = await readFile(new URL("../../../database/migrations/20261017120000_telegram_account_linking_rpc.sql", import.meta.url), "utf8");
const groupsSource = await readFile(new URL("../src/routes/groups.ts", import.meta.url), "utf8");
const authSource = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const meSource = await readFile(new URL("../src/routes/me.ts", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../src/routes/dashboard.ts", import.meta.url), "utf8");
const mySource = await readFile(new URL("../src/routes/my.ts", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../src/routes/admin.ts", import.meta.url), "utf8");
const plansSource = await readFile(new URL("../src/routes/plans.ts", import.meta.url), "utf8");
const lecturesSource = await readFile(new URL("../src/routes/lectures.ts", import.meta.url), "utf8");
const testsSource = await readFile(new URL("../src/routes/tests.ts", import.meta.url), "utf8");
const ticketsSource = await readFile(new URL("../src/routes/tickets.ts", import.meta.url), "utf8");
const subjectsRouteSource = await readFile(new URL("../src/routes/subjects.ts", import.meta.url), "utf8");
const subjectPageSource = await readFile(new URL("../../../src/app/subjects/[id]/page.tsx", import.meta.url), "utf8");
const subjectTestsPageSource = await readFile(new URL("../../../src/app/subjects/[id]/tests/page.tsx", import.meta.url), "utf8");
const testPreparationPageSource = await readFile(new URL("../../../src/app/tests/preparation/[id]/page.tsx", import.meta.url), "utf8");
const apiClientSource = await readFile(new URL("../../../src/lib/api.ts", import.meta.url), "utf8");
const chemistryTicketMigration = await readFile(new URL("../../../database/migrations/20261017160000_canonicalize_organic_chemistry_ticket_bank.sql", import.meta.url), "utf8");
const studentSubjectPlanMigration = await readFile(new URL("../../../database/migrations/20261017180000_student_subject_plan_rpc.sql", import.meta.url), "utf8");
const adminRlsMigration = await readFile(new URL("../../../supabase/migrations/20261016160523_admin_user_directory_rls.sql", import.meta.url), "utf8");

test("histology trainer images resolve basename-only cards through content_sources", () => {
  assert.ok(trainersSource.includes("5_Фотографии препаратов/") || trainersSource.includes('"photos/"'));
  assert.ok(trainersSource.includes("electronograms/images/"));
  assert.ok(trainersSource.includes("histology/"));
  assert.ok(trainersSource.includes('from("content_sources")'));
  assert.ok(trainersSource.includes("sourceKeyLooksLikeUuid") || trainersSource.includes("LooksLikeUuid"));
  assert.ok(trainersSource.includes('from("files")'));
  assert.ok(trainersSource.includes('card.is_published'));
  assert.ok(trainersSource.includes("trainerImageCandidateKeys"));
});

test("materials API uses real Supabase columns and serves private files through the configured Blob bucket", () => {
  for (const column of ["module_id", "topic_id", "file_id", "external_url", "content_html", "order_index", "is_published", "source_key"]) {
    assert.ok(materialsSource.includes(column), `materials API should use canonical column: ${column}`);
  }
  assert.ok(!materialsSource.includes("published_at"));
  assert.ok(!materialsSource.includes("summary"));
  assert.ok(materialsSource.includes('from("content_sources")'));
  assert.ok(materialsSource.includes("files(id,original_name,mime_type,size_bytes,object_key"));
  assert.ok(materialsSource.includes('new Bucket({ token, enableTelemetry: false, cache: "no-store" })'));
  assert.ok(materialsSource.includes('materials.get("/:id/file", requireAuth'));
  assert.ok(materialsSource.includes('.eq("is_published", true)'));
  assert.ok(materialsSource.includes('c.req.query("subject_slug")'));
  assert.ok(materialsSource.includes('c.req.query("subjectSlug")'));
  assert.ok(materialsSource.includes('c.req.query("q")'));
  assert.ok(materialsSource.includes('.ilike("title"'));
  assert.ok(materialsSource.includes('.in("subject_id", subjectIds)'));
  assert.ok(!materialsSource.includes('.eq("slug", subjectId).maybeSingle()'));
});

test("subject materials and lectures accept frontend query aliases and resolve duplicate slugs", () => {
  assert.ok(plansSource.includes('c.req.query("subject_slug")'));
  assert.ok(plansSource.includes('c.req.query("subject")'));
  assert.ok(plansSource.includes('.in("subject_id", subjectIds)'));
  assert.ok(!plansSource.includes('.eq("slug", subject).maybeSingle()'));
  assert.ok(lecturesSource.includes('c.req.query("subject")'));
});

test("trainer feed returns plan mappings used by histology material filtering", () => {
  assert.ok(trainersSource.includes("plan_status: row.plan_status || null"));
  assert.ok(trainersSource.includes("plan_module_title: moduleRow?.title || null"));
  assert.ok(trainersSource.includes("plan_topic_title: topicRow?.title || null"));
  assert.ok(trainersSource.includes("modules(title),topics(title)"));
});

test("curriculum API and page use canonical active curriculum data and persist per-student progress", () => {
  assert.ok(curriculumSource.includes('.order("order_index", { ascending: true })'));
  assert.ok(curriculumSource.includes('.eq("is_active", true)'));
  assert.ok(!curriculumSource.includes('order("sort_order"'));
  assert.ok(curriculumPageSource.includes("getCurriculum()"));
  assert.ok(curriculumPageSource.includes("saveAcademicState("));
  assert.ok(curriculumPageSource.includes('target_type: "curriculum_item"'));
  assert.ok(curriculumPageSource.includes("metadata"));
  assert.ok(!curriculumPageSource.includes('redirect("/academic")'));
});

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
  assert.ok(testsSource.includes("subject_slug: subjectSlug || subject?.slug || null"));
  assert.ok(testsSource.includes('course_number: course || subject?.course_number || null'));
  assert.ok(testsSource.includes('semester: semester || subject?.semester || null'));
});

test("student subject plans use the narrow RPC without loosening site_content RLS", () => {
  assert.ok(plansSource.includes('supabase.rpc("medbiohim_get_student_subject_plan"'));
  assert.ok(plansSource.includes('allowedPlanSlugs'));
  assert.ok(plansSource.includes('Array.isArray(sourcePlan.weeks)'));
  assert.ok(plansSource.includes('preparations: Array.isArray(week?.preparations)'));
  assert.ok(studentSubjectPlanMigration.includes("SECURITY DEFINER"));
  assert.ok(studentSubjectPlanMigration.includes("REVOKE ALL ON FUNCTION public.medbiohim_get_student_subject_plan(text, integer, integer) FROM PUBLIC, anon"));
  assert.ok(studentSubjectPlanMigration.includes("GRANT EXECUTE ON FUNCTION public.medbiohim_get_student_subject_plan(text, integer, integer) TO authenticated"));
  assert.ok(studentSubjectPlanMigration.includes("active MBH membership required"));
  assert.ok(!/DISABLE ROW LEVEL SECURITY|CREATE POLICY.*site_content/is.test(studentSubjectPlanMigration));
  assert.ok(subjectPageSource.includes("planSubjectFields"));
  assert.ok(subjectPageSource.includes("Микропрепараты:"));
});

test("test details preserve the PHP envelope and keep answer keys out of normal attempts", () => {
  assert.ok(testsSource.includes('const bankView = c.req.query("view") === "bank"'));
  assert.ok(testsSource.includes('return c.json(ok({ test, questions, source: "db", view: bankView ? "bank" : "test" }, rid))'));
  assert.ok(testsSource.includes("function stripOptionCorrectness(options: unknown): unknown[]"));
  assert.ok(testsSource.includes("if (bankView) item.answer = q.answer ?? null"));
  assert.ok(testsSource.includes("options: bankView ? (Array.isArray(q.options) ? q.options : []) : stripOptionCorrectness(q.options)"));
  assert.ok(testsSource.includes("async function accessibleSubjectIds"));
  assert.ok(testsSource.includes("Этот тест недоступен для вашей специальности"));
  assert.ok(testsSource.includes("subject_name: subject?.name || \"\""));
  assert.ok(testsSource.includes("if (!subjects?.[0]?.id) return c.json(ok({ items: [] }, rid))"));
  assert.ok(testPreparationPageSource.includes("Array.isArray(d.data.questions) ? d.data.questions : []"));
  assert.ok(apiClientSource.includes('new URLSearchParams({view:"bank"})'));
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

test("SpaceWeb histology media migration uses the shared private Upstash Blob bucket", () => {
  assert.ok(storageSource.includes('storage.post("/histology-import", requireAuth'));
  assert.ok(storageSource.includes('roles.includes("admin")'));
  assert.ok(storageSource.includes('key.startsWith("histology/")'));
  assert.ok(storageSource.includes('await bucket.put(key, fileValue'));
  assert.ok(storageSource.includes('storage.get("/object", requireAuth'));
});

test("SpaceWeb reads shared histology media through the authenticated Cloudflare proxy", async () => {
  const proxy = await readFile(new URL("../../../backend/src/Services/UpstashBlobProxy.php", import.meta.url), "utf8");
  const sourceRoute = await readFile(new URL("../../../backend/config/routes/histology_sources.php", import.meta.url), "utf8");
  const materialRoute = await readFile(new URL("../../../backend/config/routes/material_viewer.php", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../../backend/scripts/migrate-histology-to-upstash.php", import.meta.url), "utf8");
  assert.ok(proxy.includes("MEDBIOHIM_CLOUDFLARE_API_URL"));
  assert.ok(proxy.includes("/storage/object?key="));
  assert.ok(sourceRoute.includes("UpstashBlobProxy::emit"));
  assert.ok(materialRoute.includes("UpstashBlobProxy::emit"));
  assert.ok(migration.includes("/storage/histology-import"));
  assert.ok(migration.includes("--dry-run"));
  assert.ok(migration.includes("--overwrite"));
});

test("admin file audit endpoints are strict-admin-only and non-destructive", () => {
  assert.ok(adminSource.includes('admin.get("/files/capabilities", requireAuth'));
  assert.ok(adminSource.includes('admin.get("/files/audit", requireAuth'));
  assert.ok(adminSource.includes('gate(c, STRICT_ADMINS)'));
  assert.ok(adminSource.includes('createServiceDb(c.env)'));
  assert.ok(adminSource.includes('destructive_actions: false'));
  assert.ok(adminSource.includes('physical_check: "not_run"'));
});
