/**
 * Тесты: список, попытки, подготовка, билеты, экзаменационные вопросы
 * (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { apiCached } from "./cache";
import { filterSafe, isTestItem } from "@/lib/guards";
import { endpoints } from "../endpoints";
import type { TestListData } from "./types";

export async function listTests(subjectId?: string, groupId?: string, subjectSlug?: string, course?: number, semester?: number, options: RequestInit = {}) {
  const q = new URLSearchParams();
  if (subjectId) q.set("subject_id", subjectId);
  if (groupId) q.set("group_id", groupId);
  if (subjectSlug) q.set("subject_slug", subjectSlug);
  if (course != null) q.set("course", String(course));
  if (semester != null) q.set("semester", String(semester));
  const r = await apiCached<TestListData>(endpoints.tests.list(q.toString() || undefined), options);
  if (r?.ok && r.data) r.data = { ...r.data, items: filterSafe(r.data?.items, isTestItem) };
  return r;
}
export async function getChemistryMaster(params: Record<string, unknown> = {}, options: RequestInit = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") q.set(k, String(v)); });
  return apiCached<any>(endpoints.tests.chemistryMaster(q.toString() || undefined), options);
}
export async function getTestCurriculumMap(subjectId?: string, groupId?: string, options: RequestInit = {}) {
  const q = new URLSearchParams();
  if (subjectId) q.set("subject_id", subjectId);
  if (groupId) q.set("group_id", groupId);
  return apiCached<any>(endpoints.tests.curriculumMap(q.toString() || undefined), options);
}
export async function getTest(id: string, groupId?: string) {
  const q = groupId ? `group_id=${encodeURIComponent(groupId)}` : "";
  return api<any>(endpoints.tests.detail(id, q || undefined));
}
export async function getTestBank(id: string, groupId?: string) {
  const q = new URLSearchParams({ view: "bank" });
  if (groupId) q.set("group_id", groupId);
  return api<any>(endpoints.tests.detail(id, q.toString()));
}
export async function listMyAttempts(subjectId?: string, groupId?: string, options: RequestInit = {}) {
  const q = new URLSearchParams();
  if (subjectId) q.set("subject_id", subjectId);
  if (groupId) q.set("group_id", groupId);
  return api<any>(endpoints.tests.myAttempts(q.toString() || undefined), options);
}
export async function startTestAttempt(id: string, groupId?: string) {
  const q = groupId ? `group_id=${encodeURIComponent(groupId)}` : "";
  return api<any>(endpoints.tests.start(id, q || undefined), { method: "POST", body: "{}" });
}
export async function saveTestAnswer(attemptId: string, questionId: string, answerText: string | null) {
  return api<any>(endpoints.tests.attemptsAnswers(attemptId), { method: "POST", body: JSON.stringify({ question_id: questionId, answer_text: answerText }) });
}
export async function finishAttempt(id: string) { return api<any>(endpoints.tests.attemptsFinish(id), { method: "POST", body: "{}" }); }
export async function retryTestAnswerGrading(attemptId: string, questionId: string) {
  return api<any>(endpoints.tests.attemptsAnswerRegrade(attemptId, questionId), { method: "POST", body: "{}" });
}
export async function startPreparation(testId: string, mode: "full" | "count" | "sequential" = "full", questionLimit?: number, groupId?: string): Promise<any> {
  return api(endpoints.tests.preparationStart(testId), { method: "POST", body: JSON.stringify({ mode, question_limit: questionLimit, group_id: groupId }) }) as any;
}
export async function getPreparation(sessionId: string): Promise<any> { return api(endpoints.tests.preparation(sessionId)) as any; }
export async function savePreparation(sessionId: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.tests.preparation(sessionId), { method: "PATCH", body: JSON.stringify(payload) }) as any; }
export async function finishPreparation(sessionId: string): Promise<any> { return api(endpoints.tests.preparationFinish(sessionId), { method: "POST", body: "{}" }) as any; }
export async function preparationAiReview(sessionId: string): Promise<any> { return api(endpoints.tests.preparationAiReview(sessionId), { method: "POST", body: "{}" }) as any; }
export async function retryPreparationGrading(sessionId: string, questionId?: string): Promise<any> { return api(endpoints.tests.preparationRetryGrading(sessionId), { method: "POST", body: JSON.stringify(questionId ? { question_id: questionId } : {}) }) as any; }
export async function getBankProgress(testId: string, groupId?: string): Promise<any> {
  const q = groupId ? `group_id=${encodeURIComponent(groupId)}` : "";
  return api(endpoints.tests.bankProgress(testId, q || undefined)) as any;
}
export async function listExamQuestions(params: { subject: string; q?: string; topic?: string; limit?: number; offset?: number }): Promise<any> {
  const query = new URLSearchParams({ subject: params.subject });
  if (params.q) query.set("q", params.q);
  if (params.topic) query.set("topic", params.topic);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  return api<any>(`${endpoints.tests.examQuestions()}?${query.toString()}`);
}
export async function getExamQuestionsSummary(): Promise<any> { return apiCached(endpoints.tests.examQuestionsSummary()) as any; }
export async function generateTicket(bankId: string, count = 3, mode = "practice"): Promise<any> { return api(endpoints.tests.ticketsGenerate(), { method: "POST", body: JSON.stringify({ bank_id: bankId, count, mode }) }) as any; }
export async function listTicketBanks(..._args: any[]): Promise<any> { const options = _args[0] as RequestInit | undefined; return apiCached(endpoints.tests.ticketBanks(), options) as any; }
