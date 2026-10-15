import test from "node:test";
import assert from "node:assert/strict";
import { gradeSupabaseSubmission } from "../src/homework-grading.js";

const submissionId = "66666666-6666-4666-8666-666666666666";
const userId = "11111111-1111-4111-8111-111111111111";
const request = () => ({
  method: "POST",
  url: "https://api.example.test/api/v1/submissions/" + submissionId + "/grade",
  headers: new Headers({ authorization: "Bearer caller-jwt" }),
});
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" };

function fetcherFor({ roles = [], submission = [{ id: submissionId, status: "submitted", grade: null }], onPatch } = {}) {
  return async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: userId, email: "teacher@example.test" }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/user_roles") {
      return new Response(JSON.stringify(roles), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/homework_submissions" && init.method === "PATCH") {
      const body = JSON.parse(init.body);
      onPatch?.(body);
      return new Response(JSON.stringify([{ id: submissionId, ...body }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/homework_submissions") {
      return new Response(JSON.stringify(submission), { status: 200 });
    }
    return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500 });
  };
}

test("grading rejects malformed ids and out-of-range grades before database writes", async () => {
  const invalidId = await gradeSupabaseSubmission(request(), env, "not-a-uuid", { grade: 70 }, fetcherFor());
  assert.equal(invalidId.status, 422);
  const invalidGrade = await gradeSupabaseSubmission(request(), env, submissionId, { grade: 101 }, fetcherFor());
  assert.equal(invalidGrade.status, 422);
});

test("grading requires a teacher, moderator, or admin role from the database", async () => {
  let patched = false;
  const result = await gradeSupabaseSubmission(request(), env, submissionId, { grade: 70 }, fetcherFor({
    roles: [{ roles: [{ code: "student" }] }],
    onPatch: () => { patched = true; },
  }));
  assert.equal(result.status, 403);
  assert.equal(patched, false);
});

test("teacher can grade a submission using caller JWT and live roles relation", async () => {
  let patchBody;
  const result = await gradeSupabaseSubmission(request(), env, submissionId, { grade: 90, comment: "хорошо" }, fetcherFor({
    roles: [{ roles: [{ code: "teacher" }] }],
    onPatch: (body) => { patchBody = body; },
  }));
  assert.equal(result.ok, true);
  assert.equal(patchBody.grade, 90);
  assert.equal(patchBody.status, "graded");
  assert.equal(patchBody.teacher_comment, "хорошо");
  assert.equal(result.data.submission.grade, 90);
});

test("grading returns not found when the submission does not exist", async () => {
  const result = await gradeSupabaseSubmission(request(), env, submissionId, { grade: 50 }, fetcherFor({
    roles: [{ roles: [{ code: "admin" }] }],
    submission: [],
  }));
  assert.equal(result.status, 404);
});
