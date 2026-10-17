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
  // Path candidates cover SpaceWeb photo tree + live histology/ Blob prefix.
  assert.ok(trainersSource.includes("5_Фотографии препаратов/") || trainersSource.includes('"photos/"'));
  assert.ok(trainersSource.includes("electronograms/images/"));
  assert.ok(trainersSource.includes("histology/"));
  assert.ok(trainersSource.includes('from("content_sources")'));
  // source_key is often a Blob path, not a UUID — only UUID keys hit content_sources.
  assert.ok(trainersSource.includes("sourceKeyLooksLikeUuid") || trainersSource.includes("LooksLikeUuid"));
  assert.ok(trainersSource.includes('from("files")'));
  assert.ok(trainersSource.includes('card.is_published'));
  assert.ok(trainersSource.includes("trainerImageCandidateKeys"));
});
