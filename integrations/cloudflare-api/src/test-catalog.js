import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5000;
const fail = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const relation = (value) => Array.isArray(value) ? value[0] : value;

async function createClient(request, env, fetcher) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }
  async function rows(table, params = {}) {
    const url = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = new Error("Supabase read failed");
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Supabase returned an invalid collection");
    return payload;
  }
  return { ok: true, identity, rows };
}

async function resolveGroup(rows, userId, requestedGroupId) {
  const memberships = await rows("group_memberships", {
    select: "group_id,groups(id,name,code,course_number,admission_year,academic_program_name,specialty_slug,is_active)",
    user_id: "eq." + userId,
    is_active: "eq.true",
    limit: "100",
  });
  const groups = [...new Map(memberships.map((row) => {
    const group = relation(row.groups);
    if (!group || group.is_active === false || !row.group_id) return null;
    return [String(row.group_id), { ...group, group_id: String(row.group_id) }];
  }).filter(Boolean)).values()];
  if (!groups.length) return fail(422, "NO_GROUP", "Для действия нужна активная учебная группа");
  const requested = String(requestedGroupId || "").trim();
  if (requested) {
    const group = groups.find((item) => item.group_id === requested);
    return group ? { ok: true, group } : fail(403, "FORBIDDEN", "Вы не состоите в указанной учебной группе");
  }
  if (groups.length > 1) {
    return fail(409, "GROUP_REQUIRED", "Выберите учебную группу", {
      details: { groups: groups.map((group) => ({ id: group.group_id, name: group.name, code: group.code, course: group.course_number ?? null })) },
    });
  }
  return { ok: true, group: groups[0] };
}

function visibleForGroup(subject, group) {
  if (subject.is_active === false) return false;
  const subSpecialty = String(subject.specialty_slug || "").trim().toLowerCase();
  const groupSpecialty = String(group.specialty_slug || "").trim().toLowerCase();
  if (!subSpecialty || !groupSpecialty || subSpecialty === groupSpecialty) return true;
  return groupSpecialty === "mbh" && subSpecialty === "histology";
}

export async function getSupabaseTestCurriculumMap(request, env, filters = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const subjectId = String(filters.subject_id || "").trim();
  const groupId = String(filters.group_id || "").trim();
  if ((subjectId && !uuid(subjectId)) || (groupId && !uuid(groupId))) {
    return fail(422, "VALIDATION_ERROR", "Некорректный ID предмета или группы");
  }
  try {
    const groupResult = await resolveGroup(client.rows, client.identity.user.id, groupId);
    if (!groupResult.ok) return groupResult;
    const group = groupResult.group;
    const subjectQuery = {
      select: "id,name,slug,course_number,semester,specialty_slug,is_active",
      is_active: "eq.true",
      order: "name.asc",
      limit: "500",
    };
    if (group.course_number != null) subjectQuery.or = "(course_number.is.null,course_number.eq." + String(group.course_number) + ")";
    if (subjectId) subjectQuery.id = "eq." + subjectId;
    const subjectRows = (await client.rows("subjects", subjectQuery)).filter((row) => visibleForGroup(row, group));
    if (subjectId && !subjectRows.some((row) => String(row.id) === subjectId)) {
      return fail(422, "INVALID_SUBJECT_CONTEXT", "Предмет не относится к выбранной учебной группе");
    }
    if (!subjectRows.length) return { ok: true, data: { items: [], group, source: "supabase" } };

    const subjectIds = subjectRows.map((row) => String(row.id)).filter(uuid);
    const moduleRows = await client.rows("modules", {
      select: "id,subject_id,title,order_index,is_published",
      subject_id: "in.(" + subjectIds.join(",") + ")",
      is_published: "eq.true",
      order: "subject_id.asc,order_index.asc,title.asc",
      limit: "2000",
    });
    if (!moduleRows.length) {
      return { ok: true, data: { items: subjectRows.map((row) => ({
        subject_id: String(row.id), subject_name: String(row.name || ""),
        unclassified_questions: 0, modules: [],
      })), group, source: "supabase" };
    }
    const moduleIds = moduleRows.map((row) => String(row.id)).filter(uuid);
    const topicRows = await client.rows("topics", {
      select: "id,module_id,title,order_index,is_published",
      module_id: "in.(" + moduleIds.join(",") + ")",
      is_published: "eq.true",
      order: "module_id.asc,order_index.asc,title.asc",
      limit: "5000",
    });
    const topicIds = topicRows.map((row) => String(row.id)).filter(uuid);
    const [curriculumRows, questionRows, testRows, unclassifiedRows] = await Promise.all([
      topicIds.length ? client.rows("curriculum_items", {
        select: "topic_id,planned_date,item_type,order_index,updated_at",
        topic_id: "in.(" + topicIds.join(",") + ")",
        is_active: "eq.true",
        order: "planned_date.asc.nullslast,order_index.asc,updated_at.desc",
        limit: "5000",
      }) : Promise.resolve([]),
      topicIds.length ? client.rows("questions", {
        select: "id,subject_id,topic_id",
        subject_id: "in.(" + subjectIds.join(",") + ")",
        topic_id: "in.(" + topicIds.join(",") + ")",
        is_published: "eq.true",
        archived_at: "is.null",
        limit: "10000",
      }) : Promise.resolve([]),
      topicIds.length ? client.rows("tests", {
        select: "id,topic_id",
        subject_id: "in.(" + subjectIds.join(",") + ")",
        topic_id: "in.(" + topicIds.join(",") + ")",
        is_published: "eq.true",
        archived_at: "is.null",
        limit: "5000",
      }) : Promise.resolve([]),
      client.rows("questions", {
        select: "id,subject_id",
        subject_id: "in.(" + subjectIds.join(",") + ")",
        topic_id: "is.null",
        is_published: "eq.true",
        archived_at: "is.null",
        limit: "5000",
      }),
    ]);
    const curriculumByTopic = new Map();
    for (const row of curriculumRows) {
      const key = String(row.topic_id || "");
      if (key && !curriculumByTopic.has(key)) curriculumByTopic.set(key, row);
    }
    const questionsByTopic = new Map();
    for (const row of questionRows) {
      const key = String(row.topic_id || "");
      questionsByTopic.set(key, (questionsByTopic.get(key) || 0) + 1);
    }
    const testsByTopic = new Map();
    const seenTests = new Set();
    for (const row of testRows) {
      const key = String(row.topic_id || ""), id = String(row.id || "");
      if (!key || !id || seenTests.has(id)) continue;
      seenTests.add(id);
      testsByTopic.set(key, (testsByTopic.get(key) || 0) + 1);
    }
    const unclassifiedBySubject = new Map();
    for (const row of unclassifiedRows) {
      const key = String(row.subject_id || "");
      unclassifiedBySubject.set(key, (unclassifiedBySubject.get(key) || 0) + 1);
    }
    const topicsByModule = new Map();
    for (const row of topicRows) {
      const key = String(row.module_id || "");
      if (!topicsByModule.has(key)) topicsByModule.set(key, []);
      topicsByModule.get(key).push(row);
    }
    const modulesBySubject = new Map();
    for (const module of moduleRows) {
      const topics = topicsByModule.get(String(module.id)) || [];
      if (!topics.length) continue;
      const moduleEntry = {
        module_id: String(module.id),
        title: String(module.title || ""),
        order_index: Number(module.order_index) || 0,
        topics: topics.map((topic) => {
          const curriculum = curriculumByTopic.get(String(topic.id)) || {};
          const curriculumType = curriculum.item_type ?? null;
          const title = String(module.title || "").toLocaleLowerCase("ru-RU");
          return {
            topic_id: String(topic.id),
            title: String(topic.title || ""),
            order_index: Number(topic.order_index) || 0,
            question_count: questionsByTopic.get(String(topic.id)) || 0,
            test_count: testsByTopic.get(String(topic.id)) || 0,
            planned_date: curriculum.planned_date ?? null,
            curriculum_item_type: curriculumType,
            is_extra: title.includes("вне текущего плана") || curriculumType === "other",
          };
        }),
      };
      const key = String(module.subject_id);
      if (!modulesBySubject.has(key)) modulesBySubject.set(key, []);
      modulesBySubject.get(key).push(moduleEntry);
    }
    const items = subjectRows.map((subject) => ({
      subject_id: String(subject.id),
      subject_name: String(subject.name || ""),
      unclassified_questions: unclassifiedBySubject.get(String(subject.id)) || 0,
      modules: (modulesBySubject.get(String(subject.id)) || []).sort((a, b) => a.order_index - b.order_index),
    }));
    return { ok: true, data: { items, group, source: "supabase" } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Недействительная сессия");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для просмотра плана тем");
    return fail(503, "CURRICULUM_MAP_UNAVAILABLE", "План тем временно недоступен");
  }
}

export async function getSupabaseChemistryMaster(request, env, filters = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(filters.page ?? "1"), 10) || 1));
  const limit = Math.max(1, Math.min(50, Number.parseInt(String(filters.limit ?? "20"), 10) || 20));
  const kind = String(filters.kind ?? "").trim().slice(0, 80);
  const formula = String(filters.formula ?? "").trim().toLowerCase();
  const query = String(filters.q ?? "").trim().slice(0, 200).toLocaleLowerCase("ru-RU");
  if (formula && !["true", "false", "1", "0"].includes(formula)) {
    return fail(422, "VALIDATION_ERROR", "formula должен быть true/false или 1/0");
  }
  try {
    const docs = await client.rows("chemistry_master_documents", {
      select: "subject_slug,version,title,item_count,content",
      subject_slug: "eq.chemistry_organic_physical",
      version: "eq.2026-10-07-v1",
      limit: "1",
    });
    const doc = docs[0];
    if (!doc || !Array.isArray(doc.content)) return fail(503, "CHEMISTRY_MASTER_UNAVAILABLE", "Единый банк химии временно недоступен");
    let items = doc.content.filter((row) => row && typeof row === "object" && !Array.isArray(row));
    if (kind) items = items.filter((row) => String(row.kind || "") === kind);
    if (formula) {
      const want = formula === "1" || formula === "true";
      items = items.filter((row) => (row.formula_preserved === true || String(row.formula_preserved || "").toLowerCase() === "true") === want);
    }
    if (query) {
      items = items.filter((row) => (String(row.question || "") + " " + String(row.topic || "")).toLocaleLowerCase("ru-RU").includes(query));
    }
    items.sort((a, b) => {
      const av = Number.parseInt(String(a.source_number ?? ""), 10);
      const bv = Number.parseInt(String(b.source_number ?? ""), 10);
      const aValid = Number.isFinite(av), bValid = Number.isFinite(bv);
      if (aValid && bValid && av !== bv) return av - bv;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
    const total = items.length;
    const offset = (page - 1) * limit;
    const pageItems = items.slice(offset, offset + limit).map((row) => ({
      item_id: row.id ?? null,
      kind: row.kind == null ? null : String(row.kind),
      topic: row.topic == null ? null : String(row.topic),
      question: row.question == null ? null : String(row.question),
      answer: row.answer == null ? null : String(row.answer),
      source: row.source == null ? null : String(row.source),
      answer_status: row.answer_status == null ? null : String(row.answer_status),
      source_number: row.source_number == null ? null : String(row.source_number),
      formula_preserved: row.formula_preserved === true || String(row.formula_preserved || "").toLowerCase() === "true",
      plan_topic_id: row.plan_topic_id == null ? null : String(row.plan_topic_id),
    }));
    return {
      ok: true,
      data: {
        items: pageItems,
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        source: "chemistry_master_documents",
        title: String(doc.title || ""),
      },
    };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Недействительная сессия");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для просмотра банка химии");
    return fail(503, "CHEMISTRY_MASTER_UNAVAILABLE", "Единый банк химии временно недоступен");
  }
}
