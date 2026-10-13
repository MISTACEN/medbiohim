import test from "node:test";
import assert from "node:assert/strict";
import {
  getSupabaseAccountSettings,
  updateSupabaseProfile,
  changeSupabasePassword,
} from "../src/settings.js";

const userId = "11111111-1111-4111-8111-111111111111";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-publishable-key",
};
const authRequest = (authorization = "Bearer test-access-token") => new Request("https://medbiohim.test/api/v1/settings/account", {
  method: "GET",
  headers: authorization ? { authorization } : {},
});
const okJson = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("account settings returns legacy-compatible identity and preference shapes", async () => {
  const user = {
    id: userId,
    email: "student@example.test",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    user_metadata: { full_name: "Тестовый студент" },
    identities: [{
      id: "identity-1",
      provider: "email",
      identity_data: { email: "student@example.test", full_name: "Тестовый студент" },
    }],
  };
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).includes("/auth/v1/user")) return okJson(user);
    if (String(url).includes("/rest/v1/user_preferences")) return okJson([]);
    return okJson([]);
  };
  const result = await getSupabaseAccountSettings(authRequest(), env, fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.data.user.id, userId);
  assert.equal(result.data.user.full_name, "Тестовый студент");
  assert.equal(result.data.identities.length, 1);
  assert.equal(result.data.identities[0].can_unlink, false);
  assert.equal(result.data.preferences.locale, "ru");
  assert.equal(result.data.sync.account_id, userId);
  assert.ok(calls.some((call) => call.url.includes("/rest/v1/user_preferences")));
});

test("profile updates reject an empty patch after authentication", async () => {
  const fetcher = async () => okJson({ id: userId, email: "student@example.test" });
  const result = await updateSupabaseProfile(authRequest(), env, {}, fetcher);
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "VALIDATION");
});

test("password changes reject short passwords without sending an update", async () => {
  const fetcher = async () => okJson({ id: userId, email: "student@example.test" });
  const result = await changeSupabasePassword(authRequest(), env, "short", fetcher);
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "VALIDATION");
});

test("account settings reject missing bearer tokens before upstream access", async () => {
  let calls = 0;
  const result = await getSupabaseAccountSettings(authRequest(""), env, async () => {
    calls += 1;
    return okJson({ id: userId });
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});
