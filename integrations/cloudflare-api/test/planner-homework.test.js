import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseHomework, getSupabasePlanner, submitSupabaseHomework } from "../src/planner.js";
import { listSupabaseHomeworks } from "../src/supabase-auth.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const SUBJECT_ID = "33333333-3333-4333-8333-333333333333";
const ENTRY_ID = "44444444-4444-4444-8444-444444444444";
const HOMEWORK_ID = "55555555-5555-4555-8555-555555555555";
const SUBMISSION_ID = "66666666-6666-4666-8666-666666666666";
const env = { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };

function request(path = "/api/v1/homeworks", method = "POST", body = null) {
  return new Request("https://worker.example.test" + path, {
    method,
    headers: { authorization: "Bearer student-token", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function createFetcher({ membership = true, userId = USER_ID, onCreate } = {}) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: userId, email: "student@example.test" });
    if (url.pathname === "/rest/v1/group_memberships") {
      if (!membership) return json([]);
      return json([{
        group_id: GROUP_ID, role_in_group: "student", is_active: true,
      }]);
    }
    if (url.pathname === "/rest/v1/schedule_entries") {
      return json([{
        id: ENTRY_ID, date: "2026-10-20", subject_id: SUBJECT_ID,
        schedules: { id: "77777777-7777-4777-8777-777777777777", group_id: GROUP_ID, is_active: true },
      }]);
    }
    if (url.pathname === "/rest/v1/homeworks" && init.method === "POST") {
      const row = JSON.parse(init.body);
      onCreate?.(row, init, url);
      return json([{ id: HOMEWORK_ID, ...row }], 201);
    }
    throw new Error("Unexpected endpoint " + url.pathname + " " + (init.method || "GET"));
  };
}

test("an active ordinary group member can create schedule-linked group homework", async () => {
  let saved;
  const result = await createSupabaseHomework(request("/api/v1/homeworks", "POST", {
    title: "Подготовить микропрепарат", subject_id: SUBJECT_ID, due_date: "2026-10-20",
    group_id: GROUP_ID, schedule_entry_id: ENTRY_ID,
  }), env, {
    title: "Подготовить микропрепарат", subject_id: SUBJECT_ID, due_date: "2026-10-20",
    group_id: GROUP_ID, schedule_entry_id: ENTRY_ID,
  }, createFetcher({ onCreate: (row, init) => {
    saved = row;
    assert.equal(init.headers.authorization, "Bearer student-token");
    assert.equal(init.headers.apikey, "test-anon-key");
  } }));

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(saved.created_by, USER_ID);
  assert.equal(saved.group_id, GROUP_ID);
  assert.equal(saved.created_by_role, "student");
  assert.equal(saved.schedule_entry_id, ENTRY_ID);
});

test("group homework creation remains blocked for users without an active group membership", async () => {
  let writes = 0;
  const result = await createSupabaseHomework(
    request("/api/v1/homeworks", "POST", { title: "Чужое ДЗ", group_id: GROUP_ID }),
    env,
    { title: "Чужое ДЗ", group_id: GROUP_ID },
    createFetcher({ membership: false, onCreate: () => { writes += 1; } }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});

test("personal homework is stored without a group and owned by the authenticated student", async () => {
  let saved;
  const body = { title: "Повторить строение клетки", subject_id: SUBJECT_ID, due_date: "2026-10-22" };
  const result = await createSupabaseHomework(
    request("/api/v1/homeworks", "POST", body), env, body,
    createFetcher({ onCreate: (row) => { saved = row; } }),
  );
  assert.equal(result.ok, true);
  assert.equal(saved.group_id, null);
  assert.equal(saved.created_by, USER_ID);
  assert.equal(saved.created_by_role, "student");
});

test("personal homework cannot be attached to another group's scheduled lesson", async () => {
  let writes = 0;
  const body = { title: "Личное", group_id: GROUP_ID, scope: "personal", schedule_entry_id: ENTRY_ID };
  const result = await createSupabaseHomework(
    request("/api/v1/homeworks", "POST", body), env, body,
    createFetcher({ onCreate: () => { writes += 1; } }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "INVALID_LESSON_CONTEXT");
  assert.equal(writes, 0);
});

test("a student may submit their own personal task without requiring group membership", async () => {
  let savedSubmission = null;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: USER_ID, email: "student@example.test" });
    if (url.pathname === "/rest/v1/homeworks") return json([{
      id: HOMEWORK_ID, group_id: null, created_by: USER_ID, subject_id: SUBJECT_ID, title: "Личное", status: "open", due_date: "2026-10-22",
    }]);
    if (url.pathname === "/rest/v1/homework_submissions" && (init.method || "GET") === "GET") return json([]);
    if (url.pathname === "/rest/v1/homework_submissions" && init.method === "POST") {
      savedSubmission = { id: SUBMISSION_ID, ...JSON.parse(init.body) };
      return json([savedSubmission], 201);
    }
    if (url.pathname === "/rest/v1/homework_progress" && init.method === "POST") return json([{ homework_id: HOMEWORK_ID, user_id: USER_ID, completed: true }]);
    throw new Error("Unexpected endpoint " + url.pathname + " " + (init.method || "GET"));
  };

  const result = await submitSupabaseHomework(
    request("/api/v1/homeworks/" + HOMEWORK_ID + "/submit", "POST", { text_answer: "Повторено" }),
    env, HOMEWORK_ID, { text_answer: "Повторено" }, fetcher,
  );
  assert.equal(result.ok, true);
  assert.equal(savedSubmission.user_id, USER_ID);
  assert.equal(savedSubmission.homework_id, HOMEWORK_ID);
});

test("a user cannot submit somebody else's personal homework even if a mock upstream returns the row", async () => {
  let submissionWrites = 0;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: USER_ID });
    if (url.pathname === "/rest/v1/homeworks") return json([{
      id: HOMEWORK_ID, group_id: null, created_by: OTHER_USER_ID, subject_id: SUBJECT_ID, title: "Чужое личное", status: "open",
    }]);
    if (url.pathname === "/rest/v1/homework_submissions" && init.method === "POST") submissionWrites += 1;
    throw new Error("Unexpected endpoint " + url.pathname + " " + (init.method || "GET"));
  };
  const result = await submitSupabaseHomework(
    request("/api/v1/homeworks/" + HOMEWORK_ID + "/submit", "POST", { text_answer: "ответ" }),
    env, HOMEWORK_ID, { text_answer: "ответ" }, fetcher,
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(submissionWrites, 0);
});

test("homework list combines caller-visible group homework and the user's own personal homework", async () => {
  const seen = [];
  const result = await listSupabaseHomeworks(
    request("/api/v1/homeworks?group_id=" + GROUP_ID, "GET"),
    env, { group_id: GROUP_ID },
    async (input, init = {}) => {
      const url = new URL(String(input));
      seen.push({ path: url.pathname, query: url.searchParams, auth: init.headers.authorization });
      if (url.pathname === "/auth/v1/user") return json({ id: USER_ID, email: "student@example.test" });
      if (url.pathname === "/rest/v1/group_memberships") return json([{
        group_id: GROUP_ID, groups: { id: GROUP_ID, name: "МБХ-201", code: "MBH-201", is_active: true },
      }]);
      if (url.pathname === "/rest/v1/homeworks" && url.searchParams.get("group_id") === "in.(" + GROUP_ID + ")") {
        return json([{ id: HOMEWORK_ID, group_id: GROUP_ID, title: "Общее", due_date: "2026-10-20", subjects: { name: "Гистология" } }]);
      }
      if (url.pathname === "/rest/v1/homeworks" && url.searchParams.get("group_id") === "is.null") {
        assert.equal(url.searchParams.get("created_by"), "eq." + USER_ID);
        return json([{ id: SUBMISSION_ID, group_id: null, created_by: USER_ID, title: "Личное", due_date: "2026-10-22", subjects: { name: "Гистология" } }]);
      }
      if (url.pathname === "/rest/v1/homework_progress") return json([]);
      if (url.pathname === "/rest/v1/homework_submissions") return json([]);
      throw new Error("Unexpected endpoint " + url.pathname + " " + url.search);
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.title).sort(), ["Личное", "Общее"]);
  assert.ok(seen.every((call) => !call.auth || call.auth === "Bearer student-token"));
});


test("homework with photos uses caller-JWT atomic RPC and returns attachment metadata", async () => {
  const FILE_ID = "88888888-8888-4888-8888-888888888888";
  const body = {
    title: "Проверить микропрепарат",
    subject_id: SUBJECT_ID,
    due_date: "2026-10-20",
    group_id: GROUP_ID,
    schedule_entry_id: ENTRY_ID,
    attachment_file_ids: [FILE_ID],
  };
  let rpcPayload = null;
  let directHomeworkWrites = 0;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: USER_ID, email: "student@example.test" });
    if (url.pathname === "/rest/v1/group_memberships") return json([
      { group_id: GROUP_ID, role_in_group: "student", is_active: true },
    ]);
    if (url.pathname === "/rest/v1/schedule_entries") return json([{
      id: ENTRY_ID, date: "2026-10-20", subject_id: SUBJECT_ID,
      schedules: { id: "77777777-7777-4777-8777-777777777777", group_id: GROUP_ID, is_active: true },
    }]);
    if (url.pathname === "/rest/v1/files") return json([{
      id: FILE_ID, original_name: "micro.jpg", mime_type: "image/jpeg",
      size_bytes: 2048, group_id: GROUP_ID, uploaded_by: USER_ID, status: "active",
    }]);
    if (url.pathname === "/rest/v1/rpc/create_homework_with_attachments") {
      assert.equal(init.method, "POST");
      assert.equal(init.headers.authorization, "Bearer student-token");
      assert.equal(init.headers.apikey, "test-anon-key");
      rpcPayload = JSON.parse(init.body);
      return json({
        homework: { id: HOMEWORK_ID, ...rpcPayload.p_homework },
        attachments: [{
          file_id: FILE_ID, attachment_type: "image", sort_order: 0, inline_view: true,
        }],
      });
    }
    if (url.pathname === "/rest/v1/homeworks" && init.method === "POST") directHomeworkWrites += 1;
    throw new Error("Unexpected endpoint " + url.pathname + " " + (init.method || "GET"));
  };

  const result = await createSupabaseHomework(
    request("/api/v1/homeworks", "POST", body), env, body, fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.deepEqual(rpcPayload.p_attachment_file_ids, [FILE_ID]);
  assert.equal(rpcPayload.p_homework.created_by, USER_ID);
  assert.equal(result.data.attachments[0].file_id, FILE_ID);
  assert.equal(directHomeworkWrites, 0);
});

test("homework attachments reject files outside the authenticated user's ownership or group scope", async () => {
  const FILE_ID = "88888888-8888-4888-8888-888888888888";
  const body = { title: "Фото", group_id: GROUP_ID, attachment_file_ids: [FILE_ID] };
  let rpcCalls = 0;
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: USER_ID });
    if (url.pathname === "/rest/v1/group_memberships") return json([
      { group_id: GROUP_ID, role_in_group: "student", is_active: true },
    ]);
    if (url.pathname === "/rest/v1/files") return json([]);
    if (url.pathname === "/rest/v1/rpc/create_homework_with_attachments") rpcCalls += 1;
    throw new Error("Unexpected endpoint " + url.pathname + " " + (init.method || "GET"));
  };

  const result = await createSupabaseHomework(
    request("/api/v1/homeworks", "POST", body), env, body, fetcher,
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "ATTACHMENT_NOT_ACCESSIBLE");
  assert.equal(rpcCalls, 0);
});


test("planner returns visible homework attachment metadata without exposing private object keys", async () => {
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: USER_ID, email: "student@example.test" });
    if (url.pathname === "/rest/v1/group_memberships") return json([{
      group_id: GROUP_ID,
      groups: { id: GROUP_ID, name: "МБХ-201", code: "MBH-201", course_number: 2, specialty_slug: "mbh", is_active: true },
    }]);
    if (url.pathname === "/rest/v1/homeworks") return json([{
      id: HOMEWORK_ID,
      title: "Посмотреть микропрепарат",
      description: null,
      due_at: null,
      due_date: "2026-10-20",
      subject_id: SUBJECT_ID,
      group_id: GROUP_ID,
      schedule_entry_id: ENTRY_ID,
      created_by: USER_ID,
      created_at: "2026-10-16T00:00:00Z",
      subjects: { name: "Гистология", slug: "histology", color_hex: "#6366f1" },
    }]);
    if (url.pathname === "/rest/v1/homework_progress") return json([]);
    if (url.pathname === "/rest/v1/homework_submissions") return json([]);
    if (url.pathname === "/rest/v1/homework_attachments") return json([{
      homework_id: HOMEWORK_ID,
      file_id: "88888888-8888-4888-8888-888888888888",
      attachment_type: "image",
      caption: "Микропрепарат",
      sort_order: 0,
      inline_view: true,
      files: {
        id: "88888888-8888-4888-8888-888888888888",
        original_name: "micro.jpg",
        mime_type: "image/jpeg",
        size_bytes: 2048,
        object_key: "private/student-uploads/micro.jpg",
        status: "active",
      },
    }]);
    if (url.pathname === "/rest/v1/schedules") return json([]);
    throw new Error("Unexpected endpoint " + url.pathname + " " + url.search);
  };

  const result = await getSupabasePlanner(
    request("/api/v1/planner?group_id=" + GROUP_ID, "GET"),
    env,
    { group_id: GROUP_ID, from: "2026-10-01", to: "2026-10-31" },
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.homeworks.length, 1);
  assert.deepEqual(result.data.homeworks[0].attachments, [{
    file_id: "88888888-8888-4888-8888-888888888888",
    name: "micro.jpg",
    mime_type: "image/jpeg",
    size_bytes: 2048,
    attachment_type: "image",
    caption: "Микропрепарат",
    inline_view: true,
    download_url: null,
  }]);
  assert.equal(JSON.stringify(result).includes("private/student-uploads/micro.jpg"), false);
});
