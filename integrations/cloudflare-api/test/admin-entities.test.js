import test from "node:test";
import assert from "node:assert/strict";
import { mutateSupabaseAdminEntity } from "../src/admin-entities.js";

test("group and subject mutation reject unknown fields before contacting Supabase", async () => {
  const request = new Request("https://worker.example/api/v1/groups", { method: "POST" });
  const result = await mutateSupabaseAdminEntity(request, {}, "groups", "create", null, {
    code: "MBH-201",
    name: "Group",
    is_admin: true,
  }, async () => assert.fail("invalid payload must not contact upstream"));
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "VALIDATION_ERROR");
});

test("group creation requires a non-empty code", async () => {
  const request = new Request("https://worker.example/api/v1/groups", { method: "POST" });
  const result = await mutateSupabaseAdminEntity(request, {}, "groups", "create", null, {
    name: "Group",
  }, async () => assert.fail("invalid payload must not contact upstream"));
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
});

test("admin mutations require a bearer token before calling the RPC", async () => {
  const request = new Request("https://worker.example/api/v1/subjects", { method: "POST" });
  const result = await mutateSupabaseAdminEntity(request, {}, "subjects", "create", null, {
    name: "Histology",
  }, async () => assert.fail("unauthenticated request must not contact upstream"));
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, "UNAUTHORIZED");
});

test("database admin-role denial is returned as forbidden without a fallback write", async () => {
  const request = new Request("https://worker.example/api/v1/groups", {
    method: "POST",
    headers: { authorization: "Bearer valid-user-token" },
  });
  const calls = [];
  const result = await mutateSupabaseAdminEntity(request, {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "anon-test-key",
  }, "groups", "create", null, {
    code: "MBH-201",
    name: "Group 201",
  }, async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push(parsed.pathname);
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/rpc/medbiohim_admin_mutate_group") {
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      return new Response(JSON.stringify({ message: "administrator role required" }), { status: 403 });
    }
    assert.fail("Unexpected upstream endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.deepEqual(calls, ["/auth/v1/user", "/rest/v1/rpc/medbiohim_admin_mutate_group"]);
});
