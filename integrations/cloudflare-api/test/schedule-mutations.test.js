import test from "node:test";
import assert from "node:assert/strict";
import { mutateSupabaseScheduleEntry } from "../src/schedule-mutations.js";

const configured = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const scheduleId = "11111111-1111-4111-8111-111111111111";
const entryId = "22222222-2222-4222-8222-222222222222";
const baseEntry = {
  schedule_id: scheduleId,
  date: "2026-10-15",
  start_time: "09:00",
  end_time: "10:30",
  type: "lecture",
  subject_name: "Гистология",
};

function mockedFetch(responder) {
  return async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") {
      assert.equal(init.headers.authorization, "Bearer valid-token");
      return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    }
    assert.equal(init.headers.apikey, configured.SUPABASE_ANON_KEY);
    assert.equal(init.headers.authorization, "Bearer valid-token");
    return responder(parsed, init);
  };
}

test("schedule entry create writes only through caller JWT and checks active schedule", async () => {
  const calls = [];
  const result = await mutateSupabaseScheduleEntry(
    new Request("https://worker.example/api/v1/schedule/entries", { headers: { authorization: "Bearer valid-token" } }),
    configured, "create", "", baseEntry,
    mockedFetch((url, init) => {
      calls.push({ path: url.pathname, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      if (url.pathname === "/rest/v1/schedules") return new Response(JSON.stringify([{ id: scheduleId, is_active: true }]), { status: 200 });
      if (url.pathname === "/rest/v1/schedule_entries") {
        assert.equal(init.method, "POST");
        return new Response(JSON.stringify([{ id: entryId, ...JSON.parse(init.body) }]), { status: 201 });
      }
      throw new Error("unexpected endpoint " + url.pathname);
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.item.id, entryId);
  assert.equal(result.data.item.schedule_id, scheduleId);
  assert.deepEqual(calls.map((call) => call.path), ["/rest/v1/schedules", "/rest/v1/schedule_entries"]);
});

test("schedule entry update validates fields and uses PATCH", async () => {
  const result = await mutateSupabaseScheduleEntry(
    new Request("https://worker.example/api/v1/schedule/entries/" + entryId, { headers: { authorization: "Bearer valid-token" } }),
    configured, "update", entryId, { room: "Ауд. 304", date: "2026-10-16" },
    mockedFetch((url, init) => {
      if (url.pathname === "/rest/v1/schedule_entries" && !init.method) return new Response(JSON.stringify([{ id: entryId, schedule_id: scheduleId }]), { status: 200 });
      if (url.pathname === "/rest/v1/schedules") return new Response(JSON.stringify([{ id: scheduleId, is_active: true }]), { status: 200 });
      if (url.pathname === "/rest/v1/schedule_entries" && init.method === "PATCH") {
        assert.deepEqual(JSON.parse(init.body), { room: "Ауд. 304", date: "2026-10-16" });
        return new Response(JSON.stringify([{ id: entryId, room: "Ауд. 304", date: "2026-10-16" }]), { status: 200 });
      }
      throw new Error("unexpected endpoint " + url.pathname + " " + init.method);
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.item.room, "Ауд. 304");
});

test("schedule entry delete cancels the row rather than breaking history links", async () => {
  const result = await mutateSupabaseScheduleEntry(
    new Request("https://worker.example/api/v1/schedule/entries/" + entryId, { headers: { authorization: "Bearer valid-token" } }),
    configured, "delete", entryId, null,
    mockedFetch((url, init) => {
      if (url.pathname === "/rest/v1/schedule_entries" && !init.method) return new Response(JSON.stringify([{ id: entryId, schedule_id: scheduleId }]), { status: 200 });
      if (url.pathname === "/rest/v1/schedules") return new Response(JSON.stringify([{ id: scheduleId, is_active: true }]), { status: 200 });
      if (url.pathname === "/rest/v1/schedule_entries" && init.method === "PATCH") {
        assert.deepEqual(JSON.parse(init.body), { is_cancelled: true });
        return new Response(JSON.stringify([{ id: entryId, is_cancelled: true }]), { status: 200 });
      }
      throw new Error("unexpected endpoint " + url.pathname + " " + init.method);
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.deleted, true);
  assert.equal(result.data.item.is_cancelled, true);
});

test("schedule mutations reject invalid input and map RLS denial to 403", async () => {
  const invalid = await mutateSupabaseScheduleEntry(
    new Request("https://worker.example/api/v1/schedule/entries", { headers: { authorization: "Bearer valid-token" } }),
    configured, "create", "", { ...baseEntry, end_time: "08:00" },
    mockedFetch(() => { throw new Error("should not call REST"); }),
  );
  assert.equal(invalid.status, 422);

  const denied = await mutateSupabaseScheduleEntry(
    new Request("https://worker.example/api/v1/schedule/entries", { headers: { authorization: "Bearer valid-token" } }),
    configured, "create", "", baseEntry,
    mockedFetch((url) => {
      if (url.pathname === "/rest/v1/schedules") return new Response(JSON.stringify([{ id: scheduleId, is_active: true }]), { status: 200 });
      return new Response("row-level security policy violation", { status: 403 });
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.code, "SCHEDULE_ACCESS_DENIED");
});
