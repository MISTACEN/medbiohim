import { getSupabaseLecture, getSupabaseProfileBundle, getSupabaseProgress, getSupabaseScheduleMeta, getSupabaseSiteContent, getSupabaseSubjectCatalog, getSupabaseSubjectDetail, getSupabaseSubjectGradebook, getSupabaseSubjectPlan, listSupabaseExamQuestions, listSupabaseGroups, listSupabaseHomeworks, listSupabaseLectures, listSupabasePublishedTests, listSupabaseQuestionSubjects, listSupabaseSchedule, listSupabaseSubjectPlans, listSupabaseSubjects, loginSupabaseUser, logoutSupabaseSession, recoverSupabasePassword, refreshSupabaseSession, registerSupabaseUser, searchSupabaseContent, setSupabaseHomeworkProgress } from "./supabase-auth.js";
import { mutateSupabaseScheduleEntry } from "./schedule-mutations.js";
import { getSupabaseAdminSchedule, replaceSupabaseAdminSchedule } from "./admin-schedule.js";
import { finishSupabaseTestAttempt, getSupabaseBankProgress, getSupabaseTestBankDetail, getSupabaseTestDetail, listSupabaseMyAttempts, saveSupabaseTestAnswer, startSupabaseTestAttempt } from "./test-attempts.js";
import { getSupabaseChemistryMaster, getSupabaseTestCurriculumMap } from "./test-catalog.js";
import { listSupabaseSubjectMaterials } from "./materials.js";
import { getSupabaseContentSource } from "./content-sources.js";
import { getSupabaseTrainerCard, listSupabaseTrainerFeed, submitSupabaseTrainerAnswer } from "./trainer-feed.js";
import { listSupabaseFavorites, listSupabaseNotes, toggleSupabaseFavorite, upsertSupabaseNote } from "./personal-state.js";
import { checkSupabaseLectureMiniQuizAnswer, listSupabaseLectureMiniQuiz } from "./mini-quiz.js";
import { submitSupabaseQuestionReport } from "./question-reports.js";

const DEFAULT_APP_ORIGIN = "https://medbiohim.vercel.app";
const API_PREFIX = "/api/v1";

function apiLocalClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vladivostok", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function readJsonLimited(request, maxBytes) {
  if (!request.body) return { ok: true, value: null };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return { ok: false, invalid: true };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, invalid: true };
  }
}

function success(data, status = 200) {
  return json({ ok: true, data, requestId: crypto.randomUUID() }, status);
}

function notFound() {
  return json({
    ok: false,
    error: { code: "NOT_FOUND", message: "Endpoint not found" },
    requestId: crypto.randomUUID(),
  }, 404);
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (env.MEDBIOHIM_ALLOWED_ORIGINS || env.MEDBIOHIM_APP_ORIGIN || DEFAULT_APP_ORIGIN)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.includes(origin) ? origin : null;
}

function withCors(response, origin) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "Authorization, Content-Type, X-Request-Id");
  headers.set("access-control-max-age", "600");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname !== "/" ? url.pathname.replace(/\/+$/, "") : "/";
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (request.headers.has("origin") && !origin) {
        return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } }, 403);
      }
      return withCors(new Response(null, { status: 204, headers: { "cache-control": "no-store" } }), origin);
    }

    if (pathname === "/health" || pathname === `${API_PREFIX}/health`) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET, HEAD" }), origin);
      }
      return withCors(json({
        ok: true,
        service: "medbiohim-cloudflare-api",
        mode: env.APP_ENV || "shadow",
        role: "migration-scaffold",
        productionTrafficEnabled: false,
      }), origin);
    }

    // Homepage/dashboard: authenticated, partial-data-safe read model. Content CMS
    // announcements remain a separately tracked migration item.
    if (pathname === `${API_PREFIX}/dashboard`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const profile = await getSupabaseProfileBundle(request, env);
      if (!profile.ok) {
        return withCors(json({ ok: false, error: { code: profile.code, message: profile.message }, requestId: crypto.randomUUID() }, profile.status), origin);
      }
      const params = url.searchParams;
      const [homeworks, schedule, tests, cms] = await Promise.all([
        listSupabaseHomeworks(request, env, { group_id: params.get("group_id") || "", all_groups: true }),
        listSupabaseSchedule(request, env, { group_id: params.get("group_id") || "", from: params.get("from") || "", to: params.get("to") || "", all_groups: true }),
        listSupabasePublishedTests(request, env, { limit: "200" }),
        getSupabaseSiteContent(request, env),
      ]);
      const degradedSources = [];
      if (!homeworks.ok) degradedSources.push("homeworks");
      if (!schedule.ok) degradedSources.push("schedule");
      if (!tests.ok) degradedSources.push("tests");
      if (!cms.ok) degradedSources.push("site", "announcements");
      const localClock = apiLocalClock();
      const data = {
        profile: profile.data,
        site: cms.ok ? cms.data.site : { title: "Медбиохим" },
        announcements: cms.ok ? cms.data.announcements : [],
        schedule: schedule.ok ? schedule.data.items : [],
        schedule_source: schedule.ok ? "supabase_rest" : "unavailable",
        homeworks: homeworks.ok ? homeworks.data.items : [],
        tests: tests.ok ? tests.data.items : [],
        stats: {
          upcoming_lessons: schedule.ok ? schedule.data.items.filter((item) => { const date = String(item.date || ""); const end = String(item.end_time || "23:59").slice(0, 5); return !item.is_cancelled && (date > localClock.date || (date === localClock.date && end >= localClock.time)); }).length : null,
          pending_homeworks: homeworks.ok ? homeworks.data.items.filter((item) => !["done", "submitted", "graded", "сдано", "оценено"].includes(String(item.my_status || item.status || "").toLowerCase())).length : null,
          completed_homeworks: homeworks.ok ? homeworks.data.items.filter((item) => ["done", "submitted", "graded", "сдано", "оценено"].includes(String(item.my_status || item.status || "").toLowerCase())).length : null,
          available_tests: tests.ok ? tests.data.items.length : null,
        },
        degraded: degradedSources.length > 0,
        degraded_sources: [...new Set(degradedSources)],
        service_notice: degradedSources.length ? "Часть данных главной страницы временно недоступна. Показаны только подтверждённые данные." : null,
      };
      return withCors(success(data), origin);
    }

    if (pathname === `${API_PREFIX}/admin/schedule`) {
      if (request.method === "GET") {
        const result = await getSupabaseAdminSchedule(request, env, url.searchParams.get("group_id") || "", url.searchParams.get("semester") || "");
        if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
        return withCors(success(result.data), origin);
      }
      if (request.method === "PUT") {
        const parsed = await readJsonLimited(request, 2_000_000);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return withCors(json({ ok: false, error: { code: parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR", message: "Invalid JSON body" }, requestId: crypto.randomUUID() }, parsed.tooLarge ? 413 : 400), origin);
        const result = await replaceSupabaseAdminSchedule(request, env, parsed.value);
        if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
        return withCors(success(result.data, 201), origin);
      }
      return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, PUT, OPTIONS" }), origin);
    }

    if (pathname === `${API_PREFIX}/schedule/meta`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await getSupabaseScheduleMeta(request, env, {
        course: url.searchParams.get("course") || "",
        semester: url.searchParams.get("semester") || "",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/schedule/entries`) {
      if (request.method !== "POST") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      const parsed = await readJsonLimited(request, 16384);
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return withCors(json({ ok: false, error: { code: parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR", message: "Invalid JSON body" }, requestId: crypto.randomUUID() }, parsed.tooLarge ? 413 : 400), origin);
      const result = await mutateSupabaseScheduleEntry(request, env, "create", "", parsed.value);
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data, 201), origin);
    }

    const scheduleEntryMatch = new RegExp("^" + API_PREFIX + "/schedule/entries/([^/]+)$").exec(pathname);
    if (scheduleEntryMatch) {
      if (!["PATCH", "DELETE"].includes(request.method)) return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "PATCH, DELETE, OPTIONS" }), origin);
      let entryId;
      try { entryId = decodeURIComponent(scheduleEntryMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid schedule entry id" }, requestId: crypto.randomUUID() }, 422), origin); }
      let body = null;
      if (request.method === "PATCH") {
        const parsed = await readJsonLimited(request, 16384);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return withCors(json({ ok: false, error: { code: parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR", message: "Invalid JSON body" }, requestId: crypto.randomUUID() }, parsed.tooLarge ? 413 : 400), origin);
        body = parsed.value;
      }
      const result = await mutateSupabaseScheduleEntry(request, env, request.method === "DELETE" ? "delete" : "update", entryId, body);
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/schedule`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const params = url.searchParams;
      const result = await listSupabaseSchedule(request, env, {
        group_id: params.get("group_id") || "",
        from: params.get("from") || "",
        to: params.get("to") || "",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      const selectedGroup = result.data.groups.length === 1 ? result.data.groups[0] : null;
      return withCors(success({
        items: result.data.items,
        source: "supabase_rest",
        group: selectedGroup,
        from: result.data.from,
        to: result.data.to,
      }), origin);
    }

    if (pathname === `${API_PREFIX}/progress`) {
      if (request.method !== "GET") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      const result = await getSupabaseProgress(request, env, {
        subject_id: url.searchParams.get("subject_id") || "",
        group_id: url.searchParams.get("group_id") || "",
      });
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/homeworks`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabaseHomeworks(request, env, { group_id: url.searchParams.get("group_id") || "" });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      const requestedGroup = url.searchParams.get("group_id") || "";
      const selectedGroup = result.data.groups.find((group) => group.group_id === requestedGroup)
        || (result.data.groups.length === 1 ? result.data.groups[0] : null);
      return withCors(success({ items: result.data.items, group: selectedGroup }), origin);
    }

    const homeworkProgressMatch = new RegExp("^" + API_PREFIX + "/homeworks/([^/]+)/progress$").exec(pathname);
    if (homeworkProgressMatch) {
      if (request.method !== "POST") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      const parsed = await readJsonLimited(request, 8192);
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return withCors(json({ ok: false, error: { code: parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR", message: "Invalid JSON body" }, requestId: crypto.randomUUID() }, parsed.tooLarge ? 413 : 400), origin);
      let homeworkId;
      try { homeworkId = decodeURIComponent(homeworkProgressMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid homework id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await setSupabaseHomeworkProgress(request, homeworkId, parsed.value.done, env);
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/curriculum`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      // PHP ContentStore::listCurriculum() returns the authenticated subject list.
      // Keep this route independent from the optional CMS curriculum document.
      const result = await listSupabaseSubjects(request, env, {});
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success({ items: result.data.items }), origin);
    }

    if (pathname === `${API_PREFIX}/subjects-catalog`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await getSupabaseSubjectCatalog(request, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    const contentSourceMatch = new RegExp("^" + API_PREFIX + "/content-sources/([^/]+)$").exec(pathname);
    if (contentSourceMatch) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      let sourceId;
      try { sourceId = decodeURIComponent(contentSourceMatch[1]); }
      catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid content source id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await getSupabaseContentSource(request, env, sourceId);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === API_PREFIX + "/materials") {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const params = url.searchParams;
      const result = await listSupabaseSubjectMaterials(request, env, {
        subject_id: params.get("subject_id") || params.get("subjectId") || "",
        subject_slug: params.get("subject_slug") || params.get("subjectSlug") || "",
        type: params.get("type") || "",
        q: params.get("q") || "",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    const materialDetailMatch = new RegExp("^" + API_PREFIX + "/materials/([^/]+)$").exec(pathname);
    if (materialDetailMatch) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      let materialId;
      try { materialId = decodeURIComponent(materialDetailMatch[1]); }
      catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid material id" }, requestId: crypto.randomUUID() }, 422), origin); }
      if (!materialId || materialId.length > 200) {
        return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid material id" }, requestId: crypto.randomUUID() }, 422), origin);
      }
      const result = await listSupabaseSubjectMaterials(request, env, { material_id: materialId });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      const row = result.data.items[0];
      if (!row) {
        return withCors(json({ ok: false, error: { code: "NOT_FOUND", message: "Material not found" }, requestId: crypto.randomUUID() }, 404), origin);
      }
      const { source, ...item } = row;
      return withCors(success({ item, source: source || null }), origin);
    }

    if (pathname === `${API_PREFIX}/subject-materials`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const params = url.searchParams;
      const result = await listSupabaseSubjectMaterials(request, env, {
        subject_id: params.get("subject_id") || "",
        subject_slug: params.get("subject_slug") || "",
        type: params.get("type") || "",
        q: params.get("q") || "",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/subject-plans`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabaseSubjectPlans(request, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    const subjectPlanMatch = new RegExp("^" + API_PREFIX + "/subject-plans/([^/]+)$").exec(pathname);
    if (subjectPlanMatch) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      let slug;
      try { slug = decodeURIComponent(subjectPlanMatch[1]); }
      catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid subject slug" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await getSupabaseSubjectPlan(request, slug, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/lectures`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabaseLectures(request, env, url.searchParams.get("subject") || "");
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      const items = result.data.items.map((row) => ({
        id: row.id ?? null,
        title: row.title ?? "",
        subject: row.subject ?? "",
        subject_slug: row.subject_slug ?? "",
        topic: row.topic ?? "",
        lesson_type: row.lesson_type ?? "lecture",
        summary: row.summary ?? "",
        published_at: row.published_at ?? null,
        media_count: Array.isArray(row.media) ? row.media.length : 0,
      }));
      return withCors(success({ items, count: items.length }), origin);
    }

    const lectureMatch = new RegExp("^" + API_PREFIX + "/lectures/([^/]+)$").exec(pathname);
    if (lectureMatch) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      let lectureId;
      try { lectureId = decodeURIComponent(lectureMatch[1]); }
      catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid lecture id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await getSupabaseLecture(request, lectureId, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }


    if (pathname === `${API_PREFIX}/trainers/feed`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const params = url.searchParams;
      const result = await listSupabaseTrainerFeed(request, env, {
        subject: params.get("subject") || "",
        specialty: params.get("specialty") || "",
        limit: params.get("limit") || "",
        offset: params.get("offset") || "",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }


    if (pathname === `${API_PREFIX}/trainers/feed/answer`) {
      if (request.method !== "POST") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (!parsed.ok) {
        const status = parsed.tooLarge ? 413 : 400;
        const code = parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
        return withCors(json({ ok: false, error: { code, message: parsed.tooLarge ? "Request body is too large" : "Invalid JSON body" }, requestId: crypto.randomUUID() }, status), origin);
      }
      const result = await submitSupabaseTrainerAnswer(request, env, parsed.value);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data, result.status || 201), origin);
    }

    const trainerCardMatch = new RegExp("^" + API_PREFIX + "/trainers/feed/([^/]+)$").exec(pathname);
    if (trainerCardMatch) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      let cardId;
      try { cardId = decodeURIComponent(trainerCardMatch[1]); }
      catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid trainer card id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await getSupabaseTrainerCard(request, env, cardId);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }


    if (pathname === API_PREFIX + "/notes") {
      if (request.method === "GET") {
        const result = await listSupabaseNotes(request, env);
        if (!result.ok) {
          return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
        }
        return withCors(success(result.data), origin);
      }
      if (request.method === "POST") {
        const parsed = await readJsonLimited(request, 16_384);
        if (!parsed.ok) {
          const status = parsed.tooLarge ? 413 : 400;
          const code = parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
          return withCors(json({ ok: false, error: { code, message: parsed.tooLarge ? "Request body is too large" : "Invalid JSON body" }, requestId: crypto.randomUUID() }, status), origin);
        }
        const result = await upsertSupabaseNote(request, env, parsed.value);
        if (!result.ok) {
          return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
        }
        return withCors(success(result.data, result.status || 201), origin);
      }
      return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, POST, OPTIONS" }), origin);
    }

    if (pathname === API_PREFIX + "/favorites") {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabaseFavorites(request, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === API_PREFIX + "/favorites/toggle") {
      if (request.method !== "POST") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (!parsed.ok) {
        const status = parsed.tooLarge ? 413 : 400;
        const code = parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
        return withCors(json({ ok: false, error: { code, message: parsed.tooLarge ? "Request body is too large" : "Invalid JSON body" }, requestId: crypto.randomUUID() }, status), origin);
      }
      const result = await toggleSupabaseFavorite(request, env, parsed.value);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }


    if (pathname === API_PREFIX + "/questions/mini-quiz") {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabaseLectureMiniQuiz(request, env, {
        subject_id: url.searchParams.get("subject_id") || "",
        ids: url.searchParams.get("ids") || "",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === API_PREFIX + "/questions/mini-quiz/check") {
      if (request.method !== "POST") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (!parsed.ok) {
        const status = parsed.tooLarge ? 413 : 400;
        const code = parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
        return withCors(json({ ok: false, error: { code, message: parsed.tooLarge ? "Request body is too large" : "Invalid JSON body" }, requestId: crypto.randomUUID() }, status), origin);
      }
      const result = await checkSupabaseLectureMiniQuizAnswer(request, env, parsed.value);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }


    const questionReportMatch = new RegExp("^" + API_PREFIX + "/questions/([^/]+)/report$").exec(pathname);
    if (questionReportMatch) {
      if (request.method !== "POST") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      let questionId;
      try { questionId = decodeURIComponent(questionReportMatch[1]); }
      catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid question id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const parsed = await readJsonLimited(request, 16_384);
      if (!parsed.ok) {
        const status = parsed.tooLarge ? 413 : 400;
        const code = parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
        return withCors(json({ ok: false, error: { code, message: parsed.tooLarge ? "Request body is too large" : "Invalid JSON body" }, requestId: crypto.randomUUID() }, status), origin);
      }
      const result = await submitSupabaseQuestionReport(request, env, questionId, parsed.value);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data, result.status || 200), origin);
    }

    if (pathname === `${API_PREFIX}/questions/subjects`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabaseQuestionSubjects(request, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/questions`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const params = url.searchParams;
      const result = await listSupabaseExamQuestions(request, env, {
        subject: params.get("subject") || "",
        subject_slug: params.get("subject_slug") || "",
        subject_id: params.get("subject_id") || "",
        kind: params.has("kind") ? params.get("kind") : "ticket",
        type: params.get("type") || "",
        topic: params.get("topic") || "",
        q: params.get("q") || "",
        limit: params.get("limit") || "50",
        offset: params.get("offset") || "0",
        include_answer: params.get("include_answer") || "",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/tests`) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabasePublishedTests(request, env, {
        subject_id: url.searchParams.get("subject_id") || "",
        group_id: url.searchParams.get("group_id") || "",
        limit: url.searchParams.get("limit") || "50",
      });
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === API_PREFIX + "/tests/curriculum-map") {
      if (request.method !== "GET") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      const result = await getSupabaseTestCurriculumMap(request, env, {
        subject_id: url.searchParams.get("subject_id") || "",
        group_id: url.searchParams.get("group_id") || "",
      });
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message, ...(result.details ? { details: result.details } : {}) }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    if (pathname === API_PREFIX + "/tests/chemistry-master") {
      if (request.method !== "GET") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      const result = await getSupabaseChemistryMaster(request, env, {
        page: url.searchParams.get("page") || "1",
        limit: url.searchParams.get("limit") || "20",
        kind: url.searchParams.get("kind") || "",
        formula: url.searchParams.get("formula") || "",
        q: url.searchParams.get("q") || "",
      });
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    if (pathname === API_PREFIX + "/my/attempts") {
      if (request.method !== "GET") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      const result = await listSupabaseMyAttempts(request, env, {
        subject_id: url.searchParams.get("subject_id") || "",
        group_id: url.searchParams.get("group_id") || "",
      });
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    const finishAttemptMatch = new RegExp("^" + API_PREFIX + "/tests/attempts/([^/]+)/finish$").exec(pathname);
    if (finishAttemptMatch) {
      if (request.method !== "POST") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      let attemptId;
      try { attemptId = decodeURIComponent(finishAttemptMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid attempt id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await finishSupabaseTestAttempt(request, env, attemptId);
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    const attemptAnswerMatch = new RegExp("^" + API_PREFIX + "/tests/attempts/([^/]+)/answers$").exec(pathname);
    if (attemptAnswerMatch) {
      if (request.method !== "POST") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      const parsed = await readJsonLimited(request, 32768);
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return withCors(json({ ok: false, error: { code: parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR", message: "Invalid JSON body" }, requestId: crypto.randomUUID() }, parsed.tooLarge ? 413 : 400), origin);
      let attemptId;
      try { attemptId = decodeURIComponent(attemptAnswerMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid attempt id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await saveSupabaseTestAnswer(request, env, attemptId, parsed.value);
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    const startTestMatch = new RegExp("^" + API_PREFIX + "/tests/([^/]+)/start$").exec(pathname);
    if (startTestMatch) {
      if (request.method !== "POST") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "POST, OPTIONS" }), origin);
      let testId;
      try { testId = decodeURIComponent(startTestMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid test id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await startSupabaseTestAttempt(request, env, testId, url.searchParams.get("group_id") || "");
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data, result.data.resumed ? 200 : 201), origin);
    }

    const testBankMatch = new RegExp("^" + API_PREFIX + "/tests/([^/]+)/bank$").exec(pathname);
    if (testBankMatch) {
      if (request.method !== "GET") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      let testId;
      try { testId = decodeURIComponent(testBankMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid test id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await getSupabaseTestBankDetail(request, env, testId, url.searchParams.get("group_id") || "");
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    const bankProgressMatch = new RegExp("^" + API_PREFIX + "/tests/([^/]+)/bank-progress$").exec(pathname);
    if (bankProgressMatch) {
      if (request.method !== "GET") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      let testId;
      try { testId = decodeURIComponent(bankProgressMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid test id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = await getSupabaseBankProgress(request, env, testId, url.searchParams.get("group_id") || "");
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    const testDetailMatch = new RegExp("^" + API_PREFIX + "/tests/([^/]+)$").exec(pathname);
    if (testDetailMatch && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testDetailMatch[1])) {
      if (request.method !== "GET") return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      let testId;
      try { testId = decodeURIComponent(testDetailMatch[1]); } catch { return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid test id" }, requestId: crypto.randomUUID() }, 422), origin); }
      const result = url.searchParams.get("view") === "bank"
        ? await getSupabaseTestBankDetail(request, env, testId, url.searchParams.get("group_id") || "")
        : await getSupabaseTestDetail(request, env, testId, url.searchParams.get("group_id") || "");
      if (!result.ok) return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      return withCors(success(result.data), origin);
    }

    if (pathname === API_PREFIX + "/groups") {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await listSupabaseGroups(request, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    // Explicitly migrated routes only; all other API paths fail closed below.
    if (pathname === `${API_PREFIX}/subjects`) {
      if (request.method !== "GET") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const params = url.searchParams;
      const result = await listSupabaseSubjects(request, env, {
        course: params.get("course") ?? "",
        semester: params.get("semester") ?? "",
      });
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    const subjectGradebookMatch = new RegExp("^" + API_PREFIX + "/subjects/([^/]+)/gradebook$").exec(pathname);
    if (subjectGradebookMatch) {
      if (request.method !== "GET") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      let subjectId;
      try {
        subjectId = decodeURIComponent(subjectGradebookMatch[1]);
      } catch {
        return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid subject id" }, requestId: crypto.randomUUID() }, 422), origin);
      }
      const result = await getSupabaseSubjectGradebook(request, subjectId, env);
      if (!result.ok) {
        return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    const subjectDetailMatch = new RegExp("^" + API_PREFIX + "/subjects/([^/]+)$").exec(pathname);
    if (subjectDetailMatch) {
      if (request.method !== "GET") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      let subjectId;
      try {
        subjectId = decodeURIComponent(subjectDetailMatch[1]);
      } catch {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid subject id" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }
      const result = await getSupabaseSubjectDetail(request, subjectId, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/search`) {
      if (request.method !== "GET") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const params = url.searchParams;
      const result = await searchSupabaseContent(request, env, {
        q: params.get("q") ?? params.get("query") ?? "",
        limit: params.get("limit") ?? "30",
        subject_slug: params.get("subject_slug") ?? "",
        subject_id: params.get("subject_id") ?? "",
        type: params.get("type") ?? "",
      });
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/auth/me` || pathname === `${API_PREFIX}/me`) {
      if (request.method !== "GET") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "GET, OPTIONS" }), origin);
      }
      const result = await getSupabaseProfileBundle(request, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/auth/register`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      if (env.AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED !== "true") {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMIT_ENFORCEMENT_UNVERIFIED", message: "Authentication is temporarily unavailable until rate-limit enforcement is verified" },
          requestId: crypto.randomUUID(),
        }, 503), origin);
      }
      if (!env.AUTH_REGISTER_LIMITER || typeof env.AUTH_REGISTER_LIMITER.limit !== "function") {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMIT_NOT_CONFIGURED", message: "Registration rate limiting is not configured" },
          requestId: crypto.randomUUID(),
        }, 503), origin);
      }
      const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
      let limit;
      try {
        limit = await env.AUTH_REGISTER_LIMITER.limit({ key: clientIp });
      } catch {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMIT_UNAVAILABLE", message: "Registration is temporarily unavailable" },
          requestId: crypto.randomUUID(),
        }, 503), origin);
      }
      if (!limit || limit.success !== true) {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMITED", message: "Too many registration attempts. Try again later." },
          requestId: crypto.randomUUID(),
        }, 429), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (parsed.tooLarge) {
        return withCors(json({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
          requestId: crypto.randomUUID(),
        }, 413), origin);
      }
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }
      const fullName = parsed.value.full_name ?? parsed.value.name;
      const result = await registerSupabaseUser(parsed.value.email, parsed.value.password, fullName, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      // The live public.handle_new_user() trigger creates public.users and assigns
      // only the student role on auth.users INSERT. Keep that DB trigger canonical;
      // the Worker must never write user_roles or assign caller-selected roles directly.
      return withCors(success(result.data, 201), origin);
    }

    if (pathname === `${API_PREFIX}/auth/login`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      // Login must not be exposed until a real Cloudflare Rate Limiting binding
      // is configured; a per-isolate in-memory counter is not a safe substitute.
      if (env.AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED !== "true") {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMIT_ENFORCEMENT_UNVERIFIED", message: "Authentication is temporarily unavailable until rate-limit enforcement is verified" },
          requestId: crypto.randomUUID(),
        }, 503), origin);
      }
      if (!env.AUTH_LOGIN_LIMITER || typeof env.AUTH_LOGIN_LIMITER.limit !== "function") {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMIT_NOT_CONFIGURED", message: "Login rate limiting is not configured" },
          requestId: crypto.randomUUID(),
        }, 503), origin);
      }
      const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
      let limit;
      try {
        limit = await env.AUTH_LOGIN_LIMITER.limit({ key: clientIp });
      } catch {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMIT_UNAVAILABLE", message: "Login is temporarily unavailable" },
          requestId: crypto.randomUUID(),
        }, 503), origin);
      }
      if (!limit || limit.success !== true) {
        return withCors(json({
          ok: false,
          error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
          requestId: crypto.randomUUID(),
        }, 429), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (parsed.tooLarge) {
        return withCors(json({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
          requestId: crypto.randomUUID(),
        }, 413), origin);
      }
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }
      const result = await loginSupabaseUser(parsed.value.email, parsed.value.password, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      // Profile and role data are read by /auth/me through caller-JWT + RLS.
      // Login does not mutate roles; existing admin/moderator assignments stay unchanged.
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/auth/recover`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (parsed.tooLarge) {
        return withCors(json({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
          requestId: crypto.randomUUID(),
        }, 413), origin);
      }
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }
      const result = await recoverSupabasePassword(parsed.value.email, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/auth/refresh`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (parsed.tooLarge) {
        return withCors(json({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
          requestId: crypto.randomUUID(),
        }, 413), origin);
      }
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }
      const result = await refreshSupabaseSession(parsed.value.refresh_token, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/auth/logout`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }

      const authorization = request.headers.get("authorization") || "";
      const match = /^Bearer\s+(\S+)$/i.exec(authorization);
      let accessToken = match?.[1] || "";

      // Preserve the PHP handler's JSON access_token fallback, with a strict size
      // cap. Authorization headers remain the preferred transport.
      if (!accessToken && request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        const parsed = await readJsonLimited(request, 16_384);
        if (parsed.tooLarge) {
          return withCors(json({
            ok: false,
            error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
            requestId: crypto.randomUUID(),
          }, 413), origin);
        }
        if (!parsed.ok) {
          return withCors(json({
            ok: false,
            error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
            requestId: crypto.randomUUID(),
          }, 422), origin);
        }
        if (parsed.value && typeof parsed.value.access_token === "string") {
          accessToken = parsed.value.access_token.trim();
        }
      }

      if (!accessToken) {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Bearer token or access_token required" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }

      const result = await logoutSupabaseSession(accessToken, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }

      return withCors(success({ logged_out: true }), origin);
    }

    if (pathname === API_PREFIX || pathname === `${API_PREFIX}/ping`) {
      if (request.method !== "GET") {
        return withCors(notFound(), origin);
      }

      const build = env.MEDBIOHIM_BUILD || "unknown";
      if (pathname === API_PREFIX) {
        return withCors(success({
          name: "MEDBIOHIM API",
          version: "v1",
          build,
          phase: "D",
          endpoints: ["auth, me, groups, subjects, tests, homeworks, files, materials, content-sources, trainer-feed, notes, favorites"],
        }), origin);
      }

      return withCors(success({
        pong: true,
        build,
        env: env.APP_ENV || "local",
        time: new Date().toISOString().replace(/Z$/, "+00:00"),
      }), origin);
    }

    if (pathname.startsWith(API_PREFIX)) {
      // Intentionally do not forward to SpaceWeb: its current HTTPS origin is not trusted.
      // New routes must be implemented and tested here before any traffic is switched.
      return withCors(json({
        ok: false,
        error: {
          code: "ROUTE_NOT_MIGRATED",
          message: "This endpoint has not been migrated to Cloudflare Workers yet.",
        },
      }, 501), origin);
    }

    return withCors(json({ ok: false, error: { code: "NOT_FOUND" } }, 404), origin);
  },
};
