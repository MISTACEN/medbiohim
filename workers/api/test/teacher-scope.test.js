/**
 * Контракт области преподавателя (план §9–§10, этап H).
 *
 * Проверяет, что:
 *  - миграция создаёт таблицу назначений с RLS и ограничениями;
 *  - кабинет преподавателя смонтирован и защищён capability, а назначения
 *    меняет только администратор;
 *  - проверка работы использует назначения, а не только роль staff.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..", "..");

async function read(rel) {
  return readFile(path.join(root, rel), "utf8");
}

test("миграция области преподавателя: таблица, RLS, уникальность, хелперы", async () => {
  const sql = await readFile(
    path.join(repoRoot, "supabase/migrations/20261105090000_teacher_assignments.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.teacher_assignments/);
  assert.match(sql, /alter table public\.teacher_assignments enable row level security/);
  assert.match(sql, /teacher_assignments_group_unique/);
  assert.match(sql, /teacher_assignments_student_unique/);
  assert.match(sql, /teacher_assignments_exactly_one_target/);
  assert.match(sql, /add column if not exists assigned_teacher/);
  assert.match(sql, /grant select, insert, update, delete on public\.teacher_assignments to authenticated/);
  assert.match(sql, /security definer/);
  assert.match(sql, /teacher_assignments_insert_admin_v1/);
});

test("кабинет преподавателя смонтирован и назначения меняет только admin", async () => {
  const index = await read("src/index.ts");
  assert.match(index, /v1\.route\("\/teacher", teacher\)/);

  const route = await read("src/routes/teacher/core.ts");
  assert.match(route, /requireTeachingCapability\(c, "teacher\.results\.view"\)/);
  // Назначения выделены в доменный файл routes/teacher/assignments.ts.
  const assignments = await read("src/routes/teacher/assignments.ts");
  assert.match(assignments, /teacher\.post\("\/assignments", requireAuth, async \(c\) => \{\s*const rid = requestId\(\);\s*if \(!\(await requireAdmin\(c\)\)\) return c\.res;/);
  assert.match(assignments, /teacher\.delete\("\/assignments\/:id", requireAuth, async \(c\) => \{\s*const rid = requestId\(\);\s*if \(!\(await requireAdmin\(c\)\)\) return c\.res;/);
  assert.doesNotMatch(assignments, /MANAGERS/);
});

test("проверка работы учитывает назначения, автора и студента", async () => {
  const route = await read("src/routes/submissions.ts");
  assert.match(route, /loadTeacherScope/);
  assert.match(route, /isWithinTeachingScope/);
  assert.match(route, /assigned_teacher/);
  assert.match(route, /\.select\("id,homework_id,user_id,status"\)/);
  assert.match(route, /\.select\("id,homework_id,user_id"\)/);
});

test("контент преподавателя: чужое не редактируется, общее — только admin/mod", async () => {
  const helper = await read("src/lib/content-access.ts");
  assert.match(helper, /options\.published && options\.allowPublished !== true/);
  assert.match(helper, /String\(ownerId\) !== userId/);
  assert.match(helper, /canManageAnyContent/);

  const admin = await read("src/routes/admin.ts");
  assert.match(admin, /CONTENT_MODERATORS/);
  assert.match(admin, /requireContentOwnership\(c, store\.items\[index\]\.created_by/);
  assert.match(admin, /requireContentOwnership\(c, existing\.created_by/);

  const parity = await read("src/routes/admin-parity.ts");
  assert.match(parity, /select\("id,status,uploaded_by"\)/);
  assert.match(parity, /requireContentOwnership\(c, \(file as \{ uploaded_by\?: unknown \}\)\.uploaded_by\)/);

  const attestations = await read("src/routes/admin-attestations.ts");
  assert.match(attestations, /gate\(c, \["admin"\]\)/);
});

test("область без назначений работает fail-closed", async () => {
  const scope = await read("src/lib/teacher-scope.ts");
  assert.match(scope, /fail closed/);
  assert.match(scope, /scope\.groups\.includes/);
  assert.match(scope, /scope\.students\.includes/);
  assert.match(scope, /MISSING_TABLE/);
});
