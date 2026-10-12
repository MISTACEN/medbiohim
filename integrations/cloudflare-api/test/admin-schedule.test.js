import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseAdminSchedule, replaceSupabaseAdminSchedule } from "../src/admin-schedule.js";

const env = { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "public-anon-key-for-test-only" };
const groupId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const newScheduleId = "33333333-3333-4333-8333-333333333333";
const auth = (url, init) => {
  if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "manager-1" }), { status: 200 });
  assert.equal(init.headers.authorization, "Bearer manager-token");
  assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
};

test("admin schedule read is scoped to group, semester and active version", async () => {
  const request = new Request("https://worker.example/api/v1/admin/schedule?group_id=" + groupId + "&semester=3", { headers: { authorization: "Bearer manager-token" } });
  const result = await getSupabaseAdminSchedule(request, env, groupId, "3", async (url, init) => {
    if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "manager-1" }), { status: 200 });
    auth(url, init);
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/schedules")) {
      assert.equal(parsed.searchParams.get("group_id"), "eq." + groupId);
      assert.equal(parsed.searchParams.get("semester"), "eq.3");
      assert.equal(parsed.searchParams.get("is_active"), "eq.true");
      return new Response(JSON.stringify([{ id: scheduleId, group_id: groupId, semester: 3, version: 4, is_active: true }]), { status: 200 });
    }
    if (parsed.pathname.endsWith("/schedule_entries")) return new Response(JSON.stringify([{ id: "entry-1", schedule_id: scheduleId }]), { status: 200 });
    throw new Error("unexpected " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.schedule.version, 4);
  assert.equal(result.data.items.length, 1);
});

test("admin schedule replacement writes a complete inactive version before activation", async () => {
  const calls = [];
  const request = new Request("https://worker.example/api/v1/admin/schedule", { method: "PUT", headers: { authorization: "Bearer manager-token" } });
  const payload = {
    group_id: groupId, semester: 3,
    entries: [
      { date: "2026-10-15", start_time: "09:00", end_time: "10:30", type: "lecture", subject_name: "Гистология" },
      { date: "2026-10-16", start_time: "11:00", end_time: "12:30", type: "practice", subject_name: "Биохимия" },
    ],
  };
  const result = await replaceSupabaseAdminSchedule(request, env, payload, async (url, init) => {
    if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "manager-1" }), { status: 200 });
    auth(url, init);
    const parsed = new URL(String(url));
    calls.push({ path: parsed.pathname, method: init.method || "GET", params: parsed.searchParams, body: init.body ? JSON.parse(init.body) : null });
    if (parsed.pathname.endsWith("/schedules") && !init.method) return new Response(JSON.stringify([{ id: scheduleId, version: 4, is_active: true }]), { status: 200 });
    if (parsed.pathname.endsWith("/schedules") && init.method === "POST") {
      assert.equal(JSON.parse(init.body).version, 5);
      assert.equal(JSON.parse(init.body).is_active, false);
      return new Response(JSON.stringify([{ id: newScheduleId, version: 5, is_active: false }]), { status: 201 });
    }
    if (parsed.pathname.endsWith("/schedule_entries") && init.method === "POST") return new Response(JSON.stringify([{ id: "new-entry" }]), { status: 201 });
    if (parsed.pathname.endsWith("/schedules") && init.method === "PATCH" && parsed.searchParams.get("id") === "eq." + newScheduleId) {
      assert.equal(JSON.parse(init.body).is_active, true);
      return new Response("[]", { status: 200 });
    }
    if (parsed.pathname.endsWith("/schedules") && init.method === "PATCH") {
      assert.equal(parsed.searchParams.get("id"), "neq." + newScheduleId);
      assert.equal(JSON.parse(init.body).is_active, false);
      return new Response("[]", { status: 200 });
    }
    throw new Error("unexpected " + parsed.pathname + " " + init.method);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.version, 5);
  assert.equal(result.data.entries_saved, 2);
  assert.equal(calls.filter((x) => x.path.endsWith("/schedule_entries")).length, 2);
  assert.equal(calls.at(-2).method, "PATCH");
  assert.equal(calls.at(-1).method, "PATCH");
});

test("admin schedule save rejects invalid entries before database writes", async () => {
  const request = new Request("https://worker.example/api/v1/admin/schedule", { method: "PUT", headers: { authorization: "Bearer manager-token" } });
  const result = await replaceSupabaseAdminSchedule(request, env, {
    group_id: groupId, semester: 3,
    entries: [{ date: "2026-10-15", start_time: "11:00", end_time: "10:00", type: "lecture" }],
  }, async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "manager-1" }), { status: 200 });
    throw new Error("database must not be called for invalid input");
  });
  assert.equal(result.status, 422);
});
