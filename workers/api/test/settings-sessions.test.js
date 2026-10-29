// SA4 (PRODUCT-AUDIT-PLAN-2026-10-27): активные сессии и «выйти на других устройствах».
// Проверяем контракт по исходникам: гейт авторизации, отсутствие доступа к чужим
// сессиям, честные коды ответов и то, что миграция не даёт роли anon вызывать функции.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("settings sessions routes are authenticated and never touch other users", async () => {
  const settings = await source("../src/routes/settings.ts");

  const listStart = settings.indexOf('settings.get("/sessions"');
  assert.ok(listStart >= 0, "GET /settings/sessions exists");
  const list = settings.slice(listStart, settings.indexOf('settings.delete("/sessions/:sessionId"'));
  assert.match(list, /requireAuth/, "список сессий требует авторизации");
  assert.match(list, /rpc\("medbiohim_user_sessions"\)/, "список идёт через ограниченный auth.uid() RPC");
  // Никакого service-role обхода: фильтр по пользователю делает функция БД.
  assert.doesNotMatch(list, /SERVICE_ROLE|service_role|SERVICE_KEY/);
  assert.match(list, /ip_hint/, "полный IP наружу не отдаётся");

  const revokeStart = settings.indexOf('settings.delete("/sessions/:sessionId"');
  const revoke = settings.slice(revokeStart, settings.indexOf('settings.post("/sessions/revoke-others"'));
  assert.match(revoke, /requireAuth/);
  assert.match(revoke, /SESSION_ID_RE\.test/, "идентификатор сессии валидируется");
  assert.match(revoke, /rpc\("medbiohim_revoke_session", \{ p_session_id: sessionId \}\)/);
  assert.match(revoke, /CURRENT_SESSION/, "текущую сессию нельзя «завершить» — только выйти");
  assert.match(revoke, /status as 409/, "текущее устройство — 409, а не тихий успех");
  assert.match(revoke, /status as 404/, "уже завершённая сессия — честный 404");
  assert.match(revoke, /status as 422/, "битый id — 422");

  const othersStart = settings.indexOf('settings.post("/sessions/revoke-others"');
  const others = settings.slice(othersStart);
  assert.match(others, /requireAuth/);
  assert.match(others, /rpc\("medbiohim_revoke_other_sessions"\)/);
  assert.match(others, /kept_current/);

  // Регистрация в общем роутере и тип для клиента.
  const client = await source("../../../src/lib/settings-api.ts");
  assert.match(client, /export async function listActiveSessions/);
  assert.match(client, /export async function revokeActiveSession/);
  assert.match(client, /export async function revokeOtherSessions/);
  assert.match(client, /method: "DELETE"/);

  // UI: список устройств и кнопка «выйти на других», без фальшивого успеха.
  const page = await source("../../../src/app/settings/page.tsx");
  assert.match(page, /Активные устройства/);
  assert.match(page, /describeUserAgent\(/);
  assert.match(page, /onRevokeOtherSessions/);
  assert.match(page, /is_current/, "текущее устройство помечено");
});

test("sessions migration is idempotent, restricted to auth.uid() and closed for anon", async () => {
  const migration = await source("../../../database/migrations/20261029_user_sessions.sql");

  for (const fn of ["medbiohim_user_sessions", "medbiohim_revoke_session", "medbiohim_revoke_other_sessions"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${fn}`), `${fn} is idempotent`);
  }
  // Каждая функция ограничена текущим пользователем — иначе это утечка сессий.
  assert.equal(
    (migration.match(/where s\.user_id = auth\.uid\(\)/g) || []).length >= 2,
    true,
    "select/delete ограничены auth.uid()",
  );
  assert.match(migration, /s\.id = p_session_id\s+and s\.user_id = auth\.uid\(\)/);
  // Текущая сессия из claims: удалять её этой функцией нельзя.
  assert.match(migration, /request\.jwt\.claims/);
  assert.match(migration, /'reason', 'current_session'/);
  // Аноним не должен получать доступ.
  assert.match(migration, /revoke all on function public\.medbiohim_user_sessions\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.medbiohim_user_sessions\(\) to authenticated/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, auth/);
});
