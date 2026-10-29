/**
 * SA6 — контрактные проверки по тексту исходников (без сети и без БД).
 *
 * Проверяем то, что легко сломать рефакторингом и что нельзя проверить глазами:
 *  - экспорт закрыт авторизацией и отдаётся файлом (Content-Disposition);
 *  - экспорт читает только свои строки клиентом пользователя, без service role;
 *  - все таблицы и колонки в выгрузке реально используются другими роутами;
 *  - grace-период задаётся в миграции, а не в Worker-коде;
 *  - удаление аккаунта клиенту недоступно: служебные функции выданы только service_role;
 *  - миграция идемпотентна (повторное применение не падает).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const route = () => source("../src/routes/export.ts");
const migration = () => source("../../../database/migrations/20261030_account_deletion.sql");

// ---------------------------------------------------------------------------
// Плагины загрузки: исходники Worker'а используют относительные импорты без
// расширения и JSON-импорт, которые bare Node не принимает. Хуки — только
// обвязка загрузчика, они не меняют ни текст, ни поведение кода.
// ---------------------------------------------------------------------------
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through to the real resolver */
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const text = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${text};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
test.after(() => hooks.deregister());

/** Фейковое окружение: только то, что нужно сборке приложения, без секретов. */
const FAKE_ENV = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "fake-anon-key",
};

test("SA6: маршруты экспорта и удаления видны в собранном приложении", async () => {
  const { default: app } = await import("../src/index.ts");
  const routes = app.routes.map((item) => `${item.method} ${item.path}`);
  for (const expected of [
    "GET /api/v1/account/export",
    "GET /api/v1/account/deletion",
    "POST /api/v1/account/deletion",
    "DELETE /api/v1/account/deletion",
  ]) {
    assert.ok(routes.includes(expected), `нет маршрута ${expected}`);
  }
});

test("SA6: без токена экспорт и удаление отвечают 401, а не данными", async () => {
  const { default: app } = await import("../src/index.ts");
  for (const [method, path] of [
    ["GET", "/api/v1/account/export"],
    ["GET", "/api/v1/account/deletion"],
    ["POST", "/api/v1/account/deletion"],
    ["DELETE", "/api/v1/account/deletion"],
  ]) {
    const res = await app.request(path, { method }, FAKE_ENV);
    assert.equal(res.status, 401, `${method} ${path} должен требовать авторизацию`);
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
    // Отказ не должен содержать данных аккаунта.
    assert.equal(body.data, undefined);
  }
});

test("SA6: экспорт и удаление смонтированы на каноническом API", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import accountData from "\.\/routes\/export"/);
  assert.match(index, /v1\.route\("\/account", accountData\)/);
  const exportRoute = await route();
  assert.match(exportRoute, /account\.get\("\/export", requireAuth/);
  assert.match(exportRoute, /account\.get\("\/deletion", requireAuth/);
  assert.match(exportRoute, /account\.post\("\/deletion", requireAuth/);
  assert.match(exportRoute, /account\.delete\("\/deletion", requireAuth/);
});

test("SA6: экспорт отдаётся файлом и не кэшируется", async () => {
  const exportRoute = await route();
  assert.match(exportRoute, /Content-Disposition/);
  assert.match(exportRoute, /attachment; filename=/);
  assert.match(exportRoute, /medbiohim-export-/);
  assert.match(exportRoute, /Cache-Control", "no-store"/);
  assert.match(exportRoute, /application\/json/);
});

test("SA6: экспорт читает только свои строки клиентом пользователя (без service role)", async () => {
  const exportRoute = await route();
  // Данные берём из c.get("supabase") — это клиент с access-токеном пользователя,
  // значит RLS уже ограничивает выборку владельцем.
  assert.match(exportRoute, /const supabase = c\.get\("supabase"\)/);
  assert.doesNotMatch(exportRoute, /createServiceClient/);
  assert.doesNotMatch(exportRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(exportRoute, /createAnonClient/);

  // Каждый раздел дополнительно фильтруется по user_id — RLS не единственная защита.
  const userFilters = exportRoute.match(/\.eq\("user_id", user\.id\)/g) || [];
  assert.ok(userFilters.length >= 15, `ожидался фильтр по владельцу в каждом разделе, найдено ${userFilters.length}`);
  // Профиль фильтруется по id самого пользователя.
  assert.match(exportRoute, /\.eq\("id", user\.id\)/);
});

test("SA6: в выгрузке только существующие таблицы и колонки из рабочих роутов", async () => {
  const exportRoute = await route();

  for (const table of [
    "users",
    "user_roles",
    "group_memberships",
    "user_preferences",
    "user_subject_progress",
    "user_topic_progress",
    "test_attempts",
    "srs_cards",
    "notes",
    "favorites",
    "homework_submissions",
    "my_assignments",
    "learning_sessions",
    "attendance_records",
    "ai_conversations",
    "ai_messages",
    "user_calendar_events",
    "question_comments",
  ]) {
    assert.ok(exportRoute.includes(`.from("${table}")`), `в выгрузке нет реальной таблицы ${table}`);
  }

  // Колонки повторяют те, что уже читают роуты: progress.ts, my.ts, notes.ts,
  // sessions.ts, planner.ts, ai.ts, assignments.ts.
  assert.ok(exportRoute.includes('"user_id,subject_id,percent,completed_topics_count,last_activity_at,updated_at"'));
  assert.ok(exportRoute.includes('"id,test_id,status,score,started_at,finished_at"'));
  assert.ok(exportRoute.includes('"id,target_type,target_id,text,created_at,updated_at"'));
  assert.ok(exportRoute.includes('"id,title,provider,model,subject_slug,metadata,created_at,updated_at"'));
  assert.ok(exportRoute.includes('"id,schedule_entry_id,status,note,marked_at"'));

  // select("*") вернул бы колонки, которых мы не проверяли: этого не делаем.
  assert.doesNotMatch(exportRoute, /\.select\("\*"\)/);
  // Живая схема: в homework_submissions нет graded_at/graded_by (проверено
  // запросом к прод-БД) — такой select уронил бы всю выгрузку в 503.
  assert.doesNotMatch(exportRoute, /,graded_at|,graded_by|"graded_at|"graded_by/);
  assert.match(exportRoute, /text_answer,file_id/);
  // Выдуманных таблиц быть не должно.
  assert.doesNotMatch(exportRoute, /from\("srs_reviews"\)/);
  assert.doesNotMatch(exportRoute, /from\("account_deletions"\)/);
});

test("SA6: экспорт не бывает частично успешным и честно помечает обрезку", async () => {
  const exportRoute = await route();
  assert.match(exportRoute, /class SectionError/);
  assert.match(exportRoute, /throw new SectionError\(section, cause\)/);
  assert.match(exportRoute, /EXPORT_SECTION_UNAVAILABLE/);
  assert.match(exportRoute, /Файл не отдан, чтобы не отдавать неполные данные/);
  // Обрезка определяется запросом на строку больше лимита, а не «len === limit».
  assert.match(exportRoute, /function overFetch\(limit: number\): number \{\s*return limit \+ 1;/);
  assert.match(exportRoute, /const truncated = rows\.length > limit;/);
  assert.match(exportRoute, /schema_version: EXPORT_SCHEMA_VERSION/);
});

test("SA6: grace-период 7 дней задаётся в миграции, а не в Worker", async () => {
  const sql = await migration();
  const exportRoute = await route();

  // Единственный источник срока — функция в БД.
  assert.match(sql, /create or replace function public\.medbiohim_account_deletion_grace_days\(\)/);
  assert.match(sql, /select 7;/);
  assert.match(sql, /make_interval\(days => v_grace_days\)/);
  assert.match(sql, /'grace_days', v_grace_days/);

  // Worker не считает дату сам: он отдаёт то, что вернула БД.
  assert.doesNotMatch(exportRoute, /7\s*\*\s*24\s*\*\s*60/);
  assert.doesNotMatch(exportRoute, /scheduled_for:\s*new Date/);
  assert.match(exportRoute, /grace_days: asNumber\(record\.grace_days\)/);
});

test("SA6: отмена удаления работает и честно отвечает, когда отменять нечего", async () => {
  const sql = await migration();
  const exportRoute = await route();

  assert.match(exportRoute, /rpc\("medbiohim_cancel_account_deletion"\)/);
  assert.match(exportRoute, /DELETION_NOT_REQUESTED/);
  assert.match(exportRoute, /DELETION_ALREADY_EXECUTED/);
  assert.match(exportRoute, /409/);

  assert.match(sql, /create or replace function public\.medbiohim_cancel_account_deletion\(\)/);
  assert.match(sql, /set cancelled_at = now\(\)/);
  // Отменять можно только активный (не отменённый и не исполненный) запрос.
  assert.match(sql, /and a\.cancelled_at is null\s+and a\.executed_at is null/);
  assert.match(sql, /'status', 'not_requested'/);
});

test("SA6: реальное удаление — только служебный путь, клиенту недоступно", async () => {
  const sql = await migration();
  const exportRoute = await route();

  assert.match(sql, /revoke all on function public\.medbiohim_due_account_deletions\(integer\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.medbiohim_due_account_deletions\(integer\) to service_role/);
  assert.match(sql, /revoke all on function public\.medbiohim_mark_account_deletion_executed\(uuid\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.medbiohim_mark_account_deletion_executed\(uuid\) to service_role/);

  // Клиент не должен получать возможность писать дату исполнения сам.
  assert.match(sql, /revoke insert, update, delete on public\.account_deletion_requests from authenticated/);

  // Ответ API прямо говорит, кто удаляет, — иначе UI соврёт о мгновенном удалении.
  assert.match(exportRoute, /execution: "service_role_only"/);
  assert.match(exportRoute, /DELETION_EXECUTION_NOTE/);
  assert.match(exportRoute, /аккаунт удаляет служебный процесс/);
  assert.doesNotMatch(exportRoute, /deleteUser/);
});

test("SA6: отсутствие миграции — честный 503/501, а не выдуманный успех", async () => {
  const exportRoute = await route();
  assert.match(exportRoute, /DELETION_NOT_CONFIGURED/);
  assert.match(exportRoute, /не применена миграция 20261030_account_deletion\.sql/);
  assert.match(exportRoute, /deletionNotConfigured/);
  assert.match(exportRoute, /PGRST202/);
  // Код 503, а не 501: общий middleware v1 подменяет 501 ответом legacy-upstream.
  assert.match(exportRoute, /Код 503, а не 501/);
});

test("SA6: миграция идемпотентна по тексту", async () => {
  const sql = await migration();

  assert.match(sql, /create table if not exists public\.account_deletion_requests/);
  assert.match(sql, /create unique index if not exists account_deletion_requests_active_uidx/);
  assert.match(sql, /create index if not exists account_deletion_requests_due_idx/);
  assert.match(sql, /drop policy if exists account_deletion_requests_select_own/);
  const functionCount = (sql.match(/create or replace function /g) || []).length;
  assert.ok(functionCount >= 6, `ожидалось ≥6 идемпотентных функций, найдено ${functionCount}`);

  // Никаких необратимых операций: миграция не должна удалять данные.
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /create table public\.account_deletion_requests/);

  // RLS включён, чтение — только своих строк.
  assert.match(sql, /alter table public\.account_deletion_requests enable row level security/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /cancelled_at is null and executed_at is null/);
});

test("SA6: клиентские хелперы используют общий api(), а не свой fetch", async () => {
  const features = await source("../../../src/lib/features-api.ts");
  assert.match(features, /export async function exportMyData\(\)/);
  assert.match(features, /export async function downloadMyData\(\)/);
  assert.match(features, /export async function getAccountDeletion\(\)/);
  assert.match(features, /export async function requestAccountDeletion\(/);
  assert.match(features, /export async function cancelAccountDeletion\(\)/);
  assert.match(features, /api<AccountExportDocument>\("\/account\/export"\)/);
  assert.match(features, /api<AccountDeletionState>\("\/account\/deletion"\)/);
  assert.match(features, /execution: "service_role_only"/);
  // Имя файла и содержимое собирает клиент из документа, без «красивых» заглушек.
  assert.match(features, /medbiohim-export-/);
  assert.match(features, /describeApiError\(result\.error\)/);
});

test("SA6: страница /settings/data показывает дату удаления, отмену и честные ошибки", async () => {
  const page = await source("../../../src/app/settings/data/page.tsx");
  assert.match(page, /"use client"/);
  assert.match(page, /Скачать мои данные/);
  assert.match(page, /Запросить удаление аккаунта/);
  assert.match(page, /Отменить удаление/);
  assert.match(page, /scheduled_for/);
  assert.match(page, /formatAccountDate/);
  assert.match(page, /ErrorState/);
  assert.match(page, /describeApiError/);
  assert.match(page, /useConfirm/);
  // Через window.confirm диалог не подтверждаем: он не показывает, что удаляется.
  assert.doesNotMatch(page, /window\.confirm/);
  // Страница не обещает мгновенное удаление.
  assert.doesNotMatch(page, /Аккаунт удалён сразу/);
  assert.match(page, /служебный процесс/);
});

// ---------------------------------------------------------------------------
// Поведение чистых функций роута: проверяем не текст, а решения.
// ---------------------------------------------------------------------------

test("SA6: normalizeDeletion не выдумывает даты и прямо говорит, кто удаляет", async () => {
  const { normalizeDeletion } = await import("../src/routes/export.ts");

  const scheduled = normalizeDeletion(
    {
      status: "scheduled",
      request_id: "req-1",
      requested_at: "2026-10-29T00:00:00+00:00",
      scheduled_for: "2026-11-05T00:00:00+00:00",
      cancelled_at: null,
      grace_days: 7,
      days_left: 7,
      deletion_executed: false,
    },
    "none"
  );
  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.scheduled_for, "2026-11-05T00:00:00+00:00");
  assert.equal(scheduled.grace_days, 7);
  assert.equal(scheduled.execution, "service_role_only");
  assert.match(scheduled.message, /служебный процесс/);
  assert.equal(scheduled.deletion_executed, false);

  // Пустой ответ БД — это null, а не выдуманный срок или статус.
  const empty = normalizeDeletion({}, "none");
  assert.equal(empty.status, "none");
  for (const key of [
    "request_id",
    "requested_at",
    "scheduled_for",
    "cancelled_at",
    "executed_at",
    "grace_days",
    "days_left",
  ]) {
    assert.equal(empty[key], null, `${key} должен быть null, а не выдуманное значение`);
  }
  assert.equal(empty.deletion_executed, false);

  // Статус из БД важнее подставляемого по умолчанию.
  const executed = normalizeDeletion({ status: "executed", deletion_executed: true }, "none");
  assert.equal(executed.status, "executed");
  assert.equal(executed.deletion_executed, true);
});

test("SA6: профиль в выгрузке не отдаёт ключ файла аватара", async () => {
  const { mapProfile } = await import("../src/routes/export.ts");
  const profile = mapProfile({ id: "u1", email: "student@example.com", avatar_key: "avatars/u1.webp" });
  assert.equal("avatar_key" in profile, false, "внутренний ключ хранилища не выгружается");
  assert.equal(profile.has_uploaded_avatar, true);
  assert.equal(mapProfile({ id: "u2" }).has_uploaded_avatar, false);
  assert.equal(mapProfile(null), null);
});

test("SA6: имя файла выгрузки детерминировано и без данных не врёт", async () => {
  const { exportFileName } = await import("../src/routes/export.ts");
  assert.equal(exportFileName("2026-10-29T12:00:00.000Z"), "medbiohim-export-2026-10-29.json");
  assert.equal(exportFileName("broken"), "medbiohim-export-data.json");
});

test("SA6: отсутствие RPC отличается от прочих ошибок базы", async () => {
  const { deletionNotConfigured } = await import("../src/routes/export.ts");
  assert.equal(deletionNotConfigured({ code: "PGRST202" }), true);
  assert.equal(deletionNotConfigured({ code: "42883" }), true);
  assert.equal(
    deletionNotConfigured({ message: "Could not find the function public.medbiohim_account_deletion_status" }),
    true
  );
  assert.equal(deletionNotConfigured({ code: "PGRST116" }), false);
  assert.equal(deletionNotConfigured(null), false);
});
