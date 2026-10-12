import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5000;
const SAFE_ATTEMPT_FIELDS = "id,test_id,user_id,status,score,max_score,percent,started_at,finished_at,group_id,session_id,context_version";
const fail = (status, code, message) => ({ ok: false, status, code, message });
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const rel = (value) => Array.isArray(value) ? value[0] : value;

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/[ё]/g, "е")
    .replace(/[—–−]/g, "-")
    .replace(/["'«»„“”]/g, " ")
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedList(value) {
  let items = value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      items = Array.isArray(parsed) ? parsed : [value];
    } catch {
      items = [value];
    }
  }
  if (!Array.isArray(items)) items = items == null ? [] : [items];
  return [...new Set(items.map((item) => normalize(typeof item === "object" && item !== null ? item.label ?? "" : item)).filter(Boolean))].sort();
}

function snapshotFromRows(rows) {
  const snapshot = [];
  for (const link of rows) {
    const q = rel(link.questions);
    if (!q || !q.id || q.archived_at) continue;
    const optionsValue = typeof q.options === "string" ? (() => { try { return JSON.parse(q.options); } catch { return []; } })() : q.options;
    const module = rel(q.modules), topic = rel(q.topics);
    snapshot.push({
      id: String(q.id),
      subject_id: q.subject_id ?? null,
      module_id: q.module_id ?? null,
      topic_id: q.topic_id ?? null,
      type: String(q.type || "open"),
      text: String(q.text || ""),
      answer: q.answer ?? null,
      options: Array.isArray(optionsValue) ? optionsValue : [],
      module_name: module?.title ?? null,
      topic_name: topic?.title ?? null,
    });
  }
  return snapshot;
}

function publicQuestion(q, completed = false) {
  const sourceOptions = Array.isArray(q.options) ? q.options : [];
  let correctCount = 0;
  const options = sourceOptions.map((option) => {
    if (option && typeof option === "object") {
      if (option.correct === true) correctCount += 1;
      return completed
        ? { label: String(option.label ?? ""), correct: option.correct === true }
        : { label: String(option.label ?? "") };
    }
    return { label: String(option ?? "") };
  });
  const result = {
    id: String(q.id || ""),
    body: String(q.text ?? q.body ?? ""),
    text: String(q.text ?? q.body ?? ""),
    options,
    type: String(q.type || "open"),
    subject_id: q.subject_id ?? null,
    module_id: q.module_id ?? null,
    topic_id: q.topic_id ?? null,
    module_name: q.module_name ?? null,
    topic_name: q.topic_name ?? null,
    allow_multiple: correctCount > 1,
  };
  if (completed) result.answer = q.answer ?? null;
  return result;
}

function safeAttempt(row) {
  const result = {};
  for (const key of SAFE_ATTEMPT_FIELDS.split(",")) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) result[key] = row[key];
  }
  return result;
}

function publicAttemptErrors(error, fallbackCode, fallbackMessage) {
  if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
  if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для операции с тестом");
  if (error?.status === 409) return fail(409, "ATTEMPT_CONFLICT", "Уже существует активная попытка или состояние изменилось");
  return fail(503, fallbackCode, fallbackMessage);
}

async function makeRestClient(request, env, fetcher) {
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

  async function call(table, params = {}, init = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    const response = await fetcher(endpoint.toString(), {
      ...init,
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = new Error("Supabase REST request failed");
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return [];
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid Supabase collection response");
    return payload;
  }

  return { ok: true, identity, call };
}

async function resolveGroup(call, userId, requestedGroupId) {
  const memberships = await call("group_memberships", {
    select: "group_id,groups(id,name,is_active,specialty_slug,course_number)",
    user_id: "eq." + userId,
    is_active: "eq.true",
    limit: "100",
  });
  const allowed = memberships.map((row) => {
    const group = rel(row.groups);
    if (!group || group.is_active === false || !row.group_id) return null;
    return { ...group, id: String(row.group_id) };
  }).filter(Boolean);
  const unique = [...new Map(allowed.map((group) => [group.id, group])).values()];
  if (!unique.length) return fail(422, "NO_GROUP", "Назначьте активную учебную группу, чтобы проходить тесты");
  const requested = String(requestedGroupId || "").trim();
  if (requested) {
    const group = unique.find((item) => item.id === requested);
    return group ? { ok: true, group } : fail(403, "GROUP_ACCESS_DENIED", "Эта учебная группа вам не назначена");
  }
  if (unique.length > 1) return fail(409, "GROUP_REQUIRED", "Выберите учебную группу перед началом теста");
  return { ok: true, group: unique[0] };
}

async function verifySubjectForGroup(call, subjectId, group) {
  if (!subjectId) return { ok: true, subject: null };
  const subjects = await call("subjects", {
    select: "id,name,specialty_slug,is_active,course_number,semester",
    id: "eq." + subjectId,
    limit: "1",
  });
  const subject = subjects[0];
  if (!subject || subject.is_active === false) return fail(404, "SUBJECT_NOT_FOUND", "Предмет не найден или недоступен");
  const groupSpecialty = String(group.specialty_slug || "").trim().toLowerCase();
  const subjectSpecialty = String(subject.specialty_slug || "").trim().toLowerCase();
  if (subjectSpecialty && groupSpecialty && subjectSpecialty !== groupSpecialty &&
      !(groupSpecialty === "mbh" && subjectSpecialty === "histology")) {
    return fail(403, "FORBIDDEN", "Этот тест недоступен для вашей специальности");
  }
  return { ok: true, subject };
}

async function loadTest(call, testId) {
  if (!uuid(testId)) return fail(422, "VALIDATION_ERROR", "Некорректный ID теста");
  const tests = await call("tests", {
    select: "id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index",
    id: "eq." + testId,
    is_published: "eq.true",
    archived_at: "is.null",
    limit: "1",
  });
  if (!tests[0]) return fail(404, "NOT_FOUND", "Тест не найден или не опубликован");
  return { ok: true, test: tests[0] };
}

async function loadTestQuestions(call, testId) {
  const links = await call("test_questions", {
    select: "test_id,question_id,order_index,questions(id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,archived_at,modules(title),topics(title))",
    test_id: "eq." + testId,
    order: "order_index.asc,question_id.asc",
    limit: "1000",
  });
  return snapshotFromRows(links);
}

export async function getSupabaseTestDetail(request, env, testId, groupId = "", fetcher = fetch) {
  const client = await makeRestClient(request, env, fetcher);
  if (!client.ok) return client;
  try {
    const loaded = await loadTest(client.call, String(testId || ""));
    if (!loaded.ok) return loaded;
    const groupResult = await resolveGroup(client.call, client.identity.user.id, groupId);
    if (!groupResult.ok) return groupResult;
    const subjectResult = await verifySubjectForGroup(client.call, loaded.test.subject_id, groupResult.group);
    if (!subjectResult.ok) return subjectResult;
    const questions = await loadTestQuestions(client.call, loaded.test.id);
    if (!questions.length) return fail(422, "NO_QUESTIONS", "В тесте нет опубликованных вопросов");
    const test = {
      id: loaded.test.id,
      title: loaded.test.title,
      subject_id: loaded.test.subject_id ?? null,
      subject_name: subjectResult.subject?.name || "",
      module_id: loaded.test.module_id ?? null,
      topic_id: loaded.test.topic_id ?? null,
      time_limit_sec: loaded.test.time_limit_sec ?? null,
      max_attempts: loaded.test.max_attempts ?? null,
      created_at: loaded.test.created_at ?? null,
      questions_count: questions.length,
    };
    return { ok: true, data: { test, questions: questions.map((question) => publicQuestion(question, false)), group: groupResult.group, source: "supabase" } };
  } catch (error) {
    return publicAttemptErrors(error, "TEST_UNAVAILABLE", "Тест временно недоступен");
  }
}

export async function startSupabaseTestAttempt(request, env, testId, groupId = "", fetcher = fetch) {
  const client = await makeRestClient(request, env, fetcher);
  if (!client.ok) return client;
  try {
    const loaded = await loadTest(client.call, String(testId || ""));
    if (!loaded.ok) return loaded;
    const groupResult = await resolveGroup(client.call, client.identity.user.id, groupId);
    if (!groupResult.ok) return groupResult;
    const subjectResult = await verifySubjectForGroup(client.call, loaded.test.subject_id, groupResult.group);
    if (!subjectResult.ok) return subjectResult;
    const existing = await client.call("test_attempts", {
      select: SAFE_ATTEMPT_FIELDS,
      user_id: "eq." + client.identity.user.id,
      test_id: "eq." + loaded.test.id,
      status: "eq.in_progress",
      limit: "1",
      order: "started_at.desc",
    });
    if (existing[0]) {
      if (String(existing[0].group_id || "") !== String(groupResult.group.id)) {
        return fail(409, "CONTEXT_CHANGED", "Активная попытка относится к другой учебной группе");
      }
      return { ok: true, data: { attempt: safeAttempt(existing[0]), resumed: true, source: "supabase" } };
    }
    const snapshot = await loadTestQuestions(client.call, loaded.test.id);
    if (!snapshot.length) return fail(422, "NO_QUESTIONS", "В тесте нет опубликованных вопросов");
    const response = await client.call("test_attempts", { select: SAFE_ATTEMPT_FIELDS }, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        user_id: client.identity.user.id,
        test_id: loaded.test.id,
        group_id: groupResult.group.id,
        status: "in_progress",
        score: null,
        max_score: snapshot.length,
        percent: null,
        question_snapshot: snapshot,
      }),
    });
    if (!response[0]) throw new Error("Empty attempt insert response");
    return { ok: true, data: { attempt: safeAttempt(response[0]), resumed: false, source: "supabase" } };
  } catch (error) {
    return publicAttemptErrors(error, "ATTEMPT_START_UNAVAILABLE", "Не удалось начать тест");
  }
}

export async function saveSupabaseTestAnswer(request, env, attemptId, input, fetcher = fetch) {
  const client = await makeRestClient(request, env, fetcher);
  if (!client.ok) return client;
  const id = String(attemptId || "");
  if (!uuid(id)) return fail(422, "VALIDATION_ERROR", "Некорректный ID попытки");
  if (!input || typeof input !== "object" || Array.isArray(input) || !uuid(input.question_id)) {
    return fail(422, "VALIDATION_ERROR", "Нужен корректный question_id");
  }
  if (input.answer_text != null && typeof input.answer_text !== "string") {
    return fail(422, "VALIDATION_ERROR", "answer_text должен быть строкой или null");
  }
  const answerText = input.answer_text == null ? null : input.answer_text;
  if (answerText && answerText.length > 20000) return fail(413, "PAYLOAD_TOO_LARGE", "Ответ слишком длинный");
  try {
    const rows = await client.call("test_attempts", {
      select: "id,test_id,user_id,status,question_snapshot,group_id",
      id: "eq." + id,
      user_id: "eq." + client.identity.user.id,
      limit: "1",
    });
    const attempt = rows[0];
    if (!attempt) return fail(404, "ATTEMPT_NOT_FOUND", "Попытка не найдена");
    if (String(attempt.status) !== "in_progress") return fail(409, "ATTEMPT_NOT_IN_PROGRESS", "Попытка уже завершена");
    let snapshot = attempt.question_snapshot;
    if (typeof snapshot === "string") { try { snapshot = JSON.parse(snapshot); } catch { snapshot = []; } }
    if (!Array.isArray(snapshot)) snapshot = [];
    const question = snapshot.find((row) => String(row.id || "") === String(input.question_id));
    if (!question) return fail(422, "QUESTION_NOT_IN_ATTEMPT", "Вопрос не входит в эту попытку");

    const type = String(question.type || "open").toLowerCase();
    const reference = String(question.answer ?? "");
    let correct = null, score = 0, gradingStatus = "pending", gradingSource = "pending", confidence = null;
    let feedback = "Ответ сохранён; для этого ответа требуется семантическая проверка.";
    const cleanAnswer = String(answerText ?? "").trim();
    if (!cleanAnswer) {
      correct = false; score = 0; gradingStatus = "deterministic"; gradingSource = "deterministic"; confidence = 1;
      feedback = "Ответ не указан.";
    } else if (type === "mcq") {
      const options = Array.isArray(question.options) ? question.options : [];
      const correctLabels = options.filter((option) => option && typeof option === "object" && option.correct === true).map((option) => String(option.label ?? ""));
      if (correctLabels.length) {
        correct = JSON.stringify(normalizedList(answerText)) === JSON.stringify(normalizedList(correctLabels));
      } else {
        correct = reference !== "" && normalize(cleanAnswer) === normalize(reference);
      }
      score = correct ? 1 : 0; gradingStatus = "deterministic"; gradingSource = "deterministic"; confidence = 1;
      feedback = correct ? "Ответ верный." : "Ответ не совпадает с эталоном.";
    } else if (reference !== "" && normalize(cleanAnswer) === normalize(reference)) {
      correct = true; score = 1; gradingStatus = "deterministic"; gradingSource = "deterministic"; confidence = 1;
      feedback = "Ответ совпадает с эталоном.";
    } else if (!reference) {
      feedback = "Для вопроса пока не задан эталонный ответ.";
    } else {
      // Semantic AI grading remains a separate migration item. Do not mark a
      // non-exact free response incorrect just because the AI provider is absent.
      correct = null; score = 0; gradingStatus = "pending"; gradingSource = "pending"; confidence = null;
    }
    const now = new Date().toISOString();
    const response = await client.call("test_answers", {
      on_conflict: "attempt_id,question_id",
      select: "id,attempt_id,question_id,answer_text,is_correct,score,grading_status,grading_source,grading_confidence,grading_feedback,graded_at",
    }, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        attempt_id: id,
        question_id: String(question.id),
        answer_text: answerText,
        is_correct: correct,
        score,
        grading_status: gradingStatus,
        grading_source: gradingSource,
        grading_confidence: confidence,
        grading_feedback: feedback,
        graded_at: gradingStatus === "deterministic" ? now : null,
      }),
    });
    if (!response[0]) throw new Error("Empty answer upsert response");
    const answer = response[0];
    return { ok: true, data: { answer: {
      id: answer.id,
      attempt_id: answer.attempt_id,
      question_id: answer.question_id,
      answer_text: answer.answer_text,
      is_correct: answer.is_correct,
      score: answer.score,
      grading_status: answer.grading_status,
      grading_source: answer.grading_source,
      grading_confidence: answer.grading_confidence,
      grading_feedback: answer.grading_feedback,
      graded_at: answer.graded_at,
    } } };
  } catch (error) {
    return publicAttemptErrors(error, "ANSWER_SAVE_ERROR", "Не удалось сохранить ответ");
  }
}

export async function finishSupabaseTestAttempt(request, env, attemptId, fetcher = fetch) {
  const client = await makeRestClient(request, env, fetcher);
  if (!client.ok) return client;
  const id = String(attemptId || "");
  if (!uuid(id)) return fail(422, "VALIDATION_ERROR", "Некорректный ID попытки");
  try {
    const rows = await client.call("test_attempts", {
      select: "id,test_id,user_id,status,question_snapshot,group_id,score,max_score,percent,started_at,finished_at",
      id: "eq." + id,
      user_id: "eq." + client.identity.user.id,
      limit: "1",
    });
    const attempt = rows[0];
    if (!attempt) return fail(404, "NOT_FOUND", "Попытка не найдена");
    if (String(attempt.status) === "submitted") return { ok: true, data: { attempt: safeAttempt(attempt), source: "supabase" } };
    if (String(attempt.status) !== "in_progress") return fail(409, "ATTEMPT_ALREADY_FINISHED", "Попытка уже завершена; изменять её результат нельзя");
    let snapshot = attempt.question_snapshot;
    if (typeof snapshot === "string") { try { snapshot = JSON.parse(snapshot); } catch { snapshot = []; } }
    if (!Array.isArray(snapshot)) snapshot = [];
    const answers = await client.call("test_answers", {
      select: "question_id,is_correct",
      attempt_id: "eq." + id,
      limit: "2000",
    });
    const score = answers.filter((answer) => answer.is_correct === true).length;
    const maxScore = snapshot.length;
    const percent = maxScore > 0 ? Math.round(score / maxScore * 10000) / 100 : 0;
    const updated = await client.call("test_attempts", {
      id: "eq." + id,
      user_id: "eq." + client.identity.user.id,
      status: "eq.in_progress",
      select: SAFE_ATTEMPT_FIELDS,
    }, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ score, max_score: maxScore, percent, finished_at: new Date().toISOString(), status: "submitted" }),
    });
    if (!updated[0]) return fail(409, "ATTEMPT_ALREADY_FINISHED", "Попытка уже завершена; результат не изменён");
    return { ok: true, data: { attempt: safeAttempt(updated[0]), source: "supabase" } };
  } catch (error) {
    return publicAttemptErrors(error, "ATTEMPT_FINISH_UNAVAILABLE", "Не удалось завершить попытку");
  }
}

export async function listSupabaseMyAttempts(request, env, filters = {}, fetcher = fetch) {
  const client = await makeRestClient(request, env, fetcher);
  if (!client.ok) return client;
  const subjectId = String(filters.subject_id || "").trim();
  const groupId = String(filters.group_id || "").trim();
  if (subjectId && !uuid(subjectId)) return fail(422, "VALIDATION_ERROR", "Некорректный ID предмета");
  if (groupId && !uuid(groupId)) return fail(422, "VALIDATION_ERROR", "Некорректный ID группы");
  try {
    const groupResult = await resolveGroup(client.call, client.identity.user.id, groupId);
    if (!groupResult.ok) return groupResult;
    if (subjectId) {
      const subjectResult = await verifySubjectForGroup(client.call, subjectId, groupResult.group);
      if (!subjectResult.ok) return subjectResult;
    }
    const rows = await client.call("test_attempts", {
      select: "id,test_id,user_id,status,score,max_score,percent,started_at,finished_at,group_id,session_id,context_version,tests(title,subject_id)",
      user_id: "eq." + client.identity.user.id,
      group_id: "eq." + groupResult.group.id,
      order: "started_at.desc",
      limit: "50",
    });
    const items = rows.filter((row) => {
      const test = rel(row.tests);
      return !subjectId || String(test?.subject_id || "") === subjectId;
    }).map((row) => {
      const test = rel(row.tests);
      return { ...safeAttempt(row), test_title: test?.title || "", subject_id: test?.subject_id || null };
    });
    return { ok: true, data: { items, source: "supabase", group: groupResult.group } };
  } catch (error) {
    return publicAttemptErrors(error, "ATTEMPTS_UNAVAILABLE", "История попыток временно недоступна");
  }
}
