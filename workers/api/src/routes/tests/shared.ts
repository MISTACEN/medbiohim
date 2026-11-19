import { fail, ok } from "../../lib/response";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SAFE_ATTEMPT_FIELDS = ["id", "test_id", "user_id", "status", "score", "max_score", "percent", "started_at", "finished_at", "group_id", "session_id", "context_version"];
export function testQuestionFingerprint(question: any, fallbackId: string): string {
  if (!question || typeof question !== "object") return `id:${fallbackId}`;
  const normalize = (value: unknown) => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  let options = question.options;
  if (typeof options === "string") {
    try { options = JSON.parse(options); } catch { options = []; }
  }
  const parsedOptions = Array.isArray(options) ? options.map((option: any) => ({
    label: normalize(typeof option === "string" ? option : option?.label ?? option?.text ?? option?.value),
    correct: typeof option === "object" && option?.correct === true,
  })).filter((option) => option.label) : [];
  const answer = normalize(question.answer);
  const explicitCorrect = parsedOptions.some((option) => option.correct);
  if (!explicitCorrect && answer) {
    for (const option of parsedOptions) {
      if (option.label === answer) option.correct = true;
    }
  }
  const choices = parsedOptions.map((option) => `${option.label}\u0000${option.correct ? "1" : "0"}`).sort();
  const questionType = parsedOptions.length >= 2 ? "closed" : "open";
  const unmatchedAnswer = questionType === "open" || !parsedOptions.some((option) => option.correct) ? answer : "";
  return JSON.stringify([normalize(question.text ?? question.body), questionType, choices, unmatchedAnswer]);
}
export function invalid(c: any, rid: string, message: string) {
  const { body, status } = fail("VALIDATION", message, 422, rid);
  return c.json(body, status as 422);
}
export function safeAttempt(row: any) {
  const out: Record<string, unknown> = {};
  for (const field of SAFE_ATTEMPT_FIELDS) if (row && Object.prototype.hasOwnProperty.call(row, field)) out[field] = row && row[field];
  return out;
}

const CHEM_FORMULA_MARKERS = /[→⇌≡⁻⁺²³₀-₉]|\b(?:CH|C)\d|\bH\d|[A-Za-z]\d?\s*[↔→]/;
const CHEM_KIND_MAP: Record<string, string> = {
  mcq: "test_question", test_question: "test_question",
  match: "test_question", matching: "test_question",
  open: "open_task", open_task: "open_task",
};

/**
 * Приводит позицию каталога chemistry_master_documents к контракту клиента
 * (/tests → вкладка «Химия»). Понимает канонические элементы v1 и элементы
 * OCR-выгрузки tools/chem (kind: mcq/match/open, answer_raw). Ответ не
 * додумывается: есть answer/answer_raw — «prepared_from_text», нет — «unprepared».
 */
export function normalizeChemistryItem(raw: any, doc: any): Record<string, unknown> {
  const kindRaw = String(raw?.kind || raw?.item_type || "").toLowerCase();
  const question = String(raw?.question || raw?.text || "").trim();
  const answer = String(raw?.answer ?? raw?.answer_raw ?? "").trim();
  const topic = String(raw?.topic || raw?.theme || "").trim();
  const text = `${question} ${answer}`;
  const formulaPreserved =
    raw?.formula_preserved === true ||
    (typeof raw?.formula_kind === "string" && raw.formula_kind.length > 0) ||
    CHEM_FORMULA_MARKERS.test(text);
  return {
    item_id: String(raw?.item_id || raw?.item_key || raw?.id || `${doc?.id}:${raw?.num ?? question.slice(0, 32)}`),
    question,
    kind: CHEM_KIND_MAP[kindRaw] || (answer || raw?.options ? "test_question" : "open_task"),
    topic: topic || String(doc?.title || ""),
    formula_preserved: Boolean(formulaPreserved),
    answer: answer || null,
    answer_status: raw?.answer_status || (answer ? "prepared_from_text" : "unprepared"),
    options: Array.isArray(raw?.options) && raw.options.length ? raw.options : undefined,
    source: String(raw?.source || raw?.source_document || doc?.title || ""),
    source_number: raw?.source_number ?? (raw?.num != null ? String(raw.num) : ""),
    subject_slug: doc?.subject_slug || "",
    version: doc?.version || "",
  };
}

export async function accessibleSubjectIds(db: any, userId: string, subjectIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(subjectIds.filter(Boolean)));
  if (!ids.length) return new Set();
  const { data: subjects, error: subjectError } = await db
    .from("subjects").select("id,specialty_slug").in("id", ids);
  if (subjectError) throw subjectError;
  const subjectById = new Map((subjects || []).map((row: any) => [String(row.id), row]));
  const needsMembership = (subjects || []).some((row: any) => String(row.specialty_slug || "").trim() !== "");
  let specialties = new Set<string>();
  if (needsMembership) {
    const { data: memberships, error: membershipError } = await db
      .from("group_memberships")
      .select("group_id,groups(specialty_slug,is_active)")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(100);
    if (membershipError) throw membershipError;
    specialties = new Set((memberships || []).flatMap((row: any) => {
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      const specialty = String(group?.specialty_slug || "").trim().toLowerCase();
      return group?.is_active === true && specialty ? [specialty] : [];
    }));
  }
  return new Set(ids.filter((id) => {
    const subject: any = subjectById.get(id);
    if (!subject) return false;
    const specialty = String(subject.specialty_slug || "").trim().toLowerCase();
    return !specialty || specialties.has(specialty);
  }));
}

export function rpcResult(c: any, rid: string, data: any, error: any, fallback: string, attemptKey?: string, hideAnswerGrade = false) {
  if (error) {
    const status = error.code === "PGRST116" ? 404 : 503;
    const { body, status: st } = fail(status === 404 ? "NOT_FOUND" : "TEST_OPERATION_UNAVAILABLE", status === 404 ? "Запись не найдена" : fallback, status, rid);
    return c.json(body, st as any);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const { body, status } = fail("TEST_OPERATION_UNAVAILABLE", "Некорректный ответ сервиса тестов", 503, rid);
    return c.json(body, status as 503);
  }
  if (data.ok === false) {
    const status = [400, 401, 403, 404, 409, 413, 422].includes(Number(data.status)) ? Number(data.status) : 503;
    const code = /^[A-Z0-9_]{1,60}$/.test(String(data.code || "")) ? String(data.code) : "TEST_OPERATION_UNAVAILABLE";
    const { body, status: st } = fail(code, String(data.message || fallback).slice(0, 240), status, rid);
    return c.json(body, st as any);
  }
  if (data.ok === true && data.data && typeof data.data === "object") {
    const result = { ...data.data };
    if (attemptKey && result[attemptKey]) {
      const value = { ...result[attemptKey] };
      if (attemptKey === "attempt") {
        delete value.question_snapshot;
        for (const key of ["correct_answer", "answer_key", "question_snapshot"]) delete value[key];
        result[attemptKey] = safeAttempt(value);
      } else {
        for (const key of ["correct_answer", "answer_key", "authoritative_answer"]) delete value[key];
        if (hideAnswerGrade) for (const key of ["is_correct", "score", "grading_status", "feedback"]) delete value[key];
        result[attemptKey] = value;
      }
    }
    for (const key of ["correct_answer", "answer_key", "authoritative_answer", "question_snapshot"]) delete result[key];
  if (hideAnswerGrade) for (const key of ["is_correct", "score", "grading_status", "feedback"]) delete result[key];
    return c.json(ok(result, rid));
  }
  // Older RPC deployments returned the data object directly. Filter any attempt object
  // before returning it; never fall back to direct table inserts or client-side grading.
  const result = { ...data };
  if (attemptKey && result[attemptKey]) {
    const value = { ...result[attemptKey] };
    if (attemptKey === "attempt") {
      delete value.question_snapshot;
      for (const key of ["correct_answer", "answer_key", "question_snapshot"]) delete value[key];
      result[attemptKey] = safeAttempt(value);
    } else {
      for (const key of ["correct_answer", "answer_key", "authoritative_answer"]) delete value[key];
      if (hideAnswerGrade) for (const key of ["is_correct", "score", "grading_status", "feedback"]) delete value[key];
      result[attemptKey] = value;
    }
  }
  if (hideAnswerGrade) for (const key of ["correct_answer", "answer_key", "authoritative_answer", "is_correct", "score", "grading_status", "feedback", "question_snapshot"]) delete result[key];
  return c.json(ok(result, rid));
}

export async function recentAttemptTestIds(db: any, userId: string, days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await db
    .from("test_attempts")
    .select("test_id")
    .eq("user_id", userId)
    .gte("started_at", since)
    .limit(100);
  if (error) throw error;
  return new Set((data || []).map((row: any) => String(row.test_id || "")));
}
