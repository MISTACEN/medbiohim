import test from "node:test";
import assert from "node:assert/strict";
import {
  listSupabaseFavorites,
  listSupabaseNotes,
  toggleSupabaseFavorite,
  upsertSupabaseNote,
} from "../src/personal-state.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const questionId = "q-123";
function request(path = "/api/v1/notes", token = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test" + path, {
    headers: token ? { authorization: token } : {},
  });
}
function response(value, status = 200) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function question(slug = "chemistry") {
  return { id: questionId, subject_slug: slug, is_published: true };
}
function membership(active = true, specialty = "mbh") {
  return { group_id: "group-1", groups: { specialty_slug: specialty, is_active: active } };
}

test("GET notes reads only the authenticated user's own records", async () => {
  const result = await listSupabaseNotes(request(), env, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    assert.equal(parsed.pathname, "/rest/v1/notes");
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
    assert.equal(parsed.searchParams.get("select"), "id,user_id,target_type,target_id,text,created_at,updated_at");
    assert.equal(parsed.searchParams.get("limit"), "1000");
    return response([{ id: "note-1", user_id: "user-1", target_type: "question", target_id: questionId, text: "my note" }]);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].user_id, "user-1");
});

test("POST notes verifies a published question and derives user_id from the verified session", async () => {
  let inserted;
  const result = await upsertSupabaseNote(request("/api/v1/notes"), env, {
    target_type: "question",
    target_id: questionId,
    body: " Мои заметки ",
    user_id: "attacker-id",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") {
      assert.equal(parsed.searchParams.get("id"), "eq." + questionId);
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      return response([question()]);
    }
    if (parsed.pathname === "/rest/v1/notes" && init.method === "GET") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
      return response([]);
    }
    if (parsed.pathname === "/rest/v1/notes" && init.method === "POST") {
      inserted = JSON.parse(init.body);
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      return response([{ id: "note-1", ...inserted, created_at: "2026-10-13T00:00:00Z", updated_at: "2026-10-13T00:00:00Z" }]);
    }
    assert.fail("unexpected REST request: " + init.method + " " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.data.note.user_id, "user-1");
  assert.equal(result.data.note.text, "Мои заметки");
  assert.equal(inserted.user_id, "user-1");
  assert.equal(inserted.user_id === "attacker-id", false);
});

test("POST notes updates an existing caller-owned note rather than creating a duplicate", async () => {
  let patch;
  const result = await upsertSupabaseNote(request(), env, {
    target_type: "question", target_id: questionId, body: "Updated note",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") return response([question()]);
    if (parsed.pathname === "/rest/v1/notes" && init.method === "GET") {
      return response([{ id: "note-1", user_id: "user-1", target_type: "question", target_id: questionId, text: "old" }]);
    }
    if (parsed.pathname === "/rest/v1/notes" && init.method === "PATCH") {
      assert.equal(parsed.searchParams.get("id"), "eq.note-1");
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
      patch = JSON.parse(init.body);
      return response([{ id: "note-1", user_id: "user-1", target_type: "question", target_id: questionId, ...patch }]);
    }
    assert.fail("unexpected REST request: " + init.method + " " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.note.text, "Updated note");
  assert.ok(patch.updated_at);
});

test("personal notes and favorites reject unsupported target types before target lookup", async () => {
  let restReads = 0;
  const note = await upsertSupabaseNote(request(), env, { target_type: "sql", target_id: questionId, body: "x" }, async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    restReads += 1;
    return response([]);
  });
  const favorite = await toggleSupabaseFavorite(request("/api/v1/favorites/toggle"), env, {
    target_type: "unknown", target_id: questionId,
  }, async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    restReads += 1;
    return response([]);
  });
  assert.equal(note.status, 422);
  assert.equal(favorite.status, 422);
  assert.equal(restReads, 0);
});

test("personal notes and favorites do not attach to missing or unpublished questions", async () => {
  const result = await toggleSupabaseFavorite(request("/api/v1/favorites/toggle"), env, {
    target_type: "question", target_id: questionId,
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") return response([]);
    assert.fail("no user state table should be reached");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test("Histology notes/favorites require an explicitly active MBH membership", async () => {
  let personalTableReads = 0;
  const result = await upsertSupabaseNote(request(), env, {
    target_type: "question", target_id: questionId, body: "note",
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") return response([question("histology")]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([membership(false)]);
    if (parsed.pathname === "/rest/v1/notes") personalTableReads += 1;
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(personalTableReads, 0);
});

test("Histology favorite can be toggled by an active MBH member", async () => {
  let inserted;
  const result = await toggleSupabaseFavorite(request("/api/v1/favorites/toggle"), env, {
    target_type: "question", target_id: questionId,
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") return response([question("histology")]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([membership(true)]);
    if (parsed.pathname === "/rest/v1/favorites" && init.method === "GET") return response([]);
    if (parsed.pathname === "/rest/v1/favorites" && init.method === "POST") {
      inserted = JSON.parse(init.body);
      return response([{ ...inserted, created_at: "2026-10-13T00:00:00Z" }]);
    }
    assert.fail("unexpected REST request: " + init.method + " " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.favorited, true);
  assert.equal(inserted.user_id, "user-1");
});

test("GET favorites reads only the current user's saved targets", async () => {
  const result = await listSupabaseFavorites(request("/api/v1/favorites"), env, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    assert.equal(parsed.pathname, "/rest/v1/favorites");
    assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
    return response([{ user_id: "user-1", target_type: "question", target_id: questionId }]);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items[0].user_id, "user-1");
});

test("toggle favorites removes only the matching current-user row", async () => {
  let removed = false;
  const result = await toggleSupabaseFavorite(request("/api/v1/favorites/toggle"), env, {
    target_type: "question", target_id: questionId,
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") return response([question()]);
    if (parsed.pathname === "/rest/v1/favorites" && init.method === "GET") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
      return response([{ user_id: "user-1", target_type: "question", target_id: questionId }]);
    }
    if (parsed.pathname === "/rest/v1/favorites" && init.method === "DELETE") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
      assert.equal(parsed.searchParams.get("target_type"), "eq.question");
      assert.equal(parsed.searchParams.get("target_id"), "eq." + questionId);
      removed = true;
      return response(null, 204);
    }
    assert.fail("unexpected REST request: " + init.method + " " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.favorited, false);
  assert.equal(removed, true);
});

test("personal state fails closed for an unavailable question or membership table", async () => {
  const unavailableQuestion = await upsertSupabaseNote(request(), env, {
    target_type: "question", target_id: questionId, body: "note",
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") return response({ message: "RLS denied" }, 403);
    assert.fail("unexpected REST request: " + parsed.pathname);
  });
  const unavailableMembership = await toggleSupabaseFavorite(request("/api/v1/favorites/toggle"), env, {
    target_type: "question", target_id: questionId,
  }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/exam_questions") return response([question("histology")]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response({ message: "RLS denied" }, 403);
    assert.fail("unexpected REST request: " + parsed.pathname);
  });
  assert.equal(unavailableQuestion.status, 403);
  assert.equal(unavailableMembership.status, 503);
});

test("personal state rejects invalid bearer tokens before any data table read", async () => {
  let reads = 0;
  const result = await listSupabaseNotes(request("/api/v1/notes", "Bearer invalid"), env, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ message: "invalid token" }, 401);
    reads += 1;
    return response([]);
  });
  assert.equal(result.status, 401);
  assert.equal(reads, 0);
});
