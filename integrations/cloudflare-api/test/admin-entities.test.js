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
