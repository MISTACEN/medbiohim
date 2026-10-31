/**
 * Контент: материалы, лекции, вопросы, тренажёры, гистология, аттестации
 * (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { apiCached } from "./cache";
import { endpoints } from "../endpoints";
import { trainerCardCache, trainerCardInflight } from "./files";
import { currentUserScope } from "@/lib/auth/session";

export async function listMaterials(params: Record<string, unknown> = {}, options: RequestInit = {}) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== "") q.set(String(k), String(v)); });
  return apiCached<any>(endpoints.content.materials(q.toString() || undefined), options);
}
/** Отметить материал открытым — для подсказки «что ещё не открыто» в плане темы. */
export async function markMaterialOpened(materialId: string) {
  return api<any>(endpoints.content.materialOpen(materialId), { method: "POST", body: "{}" });
}
export async function listLectures(subject?: string, options: RequestInit = {}): Promise<any> {
  const q = subject ? `subject=${encodeURIComponent(subject)}` : "";
  return apiCached(endpoints.content.lectures(q || undefined), options) as any;
}
export async function getLecture(id: string): Promise<any> { return api(endpoints.content.lecture(id)) as any; }
export async function getLessonPlan(params: Record<string, unknown> = {}): Promise<any> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") q.set(k, String(v)); });
  return api(endpoints.content.lessonPlan(q.toString() || undefined)) as any;
}
export async function listQuestions(params: Record<string, unknown> = {}): Promise<any> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") q.set(k, String(v)); });
  if (!q.has("include_answer")) q.set("include_answer", "1");
  return api(endpoints.content.questions(q.toString())) as any;
}
export async function listQuestionSubjects(..._args: any[]): Promise<any> { return api(endpoints.content.questionsSubjects()) as any; }
export async function listQuestionTopics(subjectId: string): Promise<any> { return api(endpoints.content.questionTopics(`subject_id=${encodeURIComponent(subjectId)}`)) as any; }
export async function getQuestion(id: string): Promise<any> { return api(endpoints.content.question(id)) as any; }
export async function reportQuestion(questionId: string, category: string, message = ""): Promise<any> { return api(endpoints.content.questionReport(questionId), { method: "POST", body: JSON.stringify({ category, message }) }) as any; }
export async function listQuestionComments(questionId: string) { return api<any>(endpoints.content.questionComments(questionId)); }
export async function addQuestionComment(questionId: string, body: string) { return api<any>(endpoints.content.questionComments(questionId), { method: "POST", body: JSON.stringify({ body }) }); }
export async function deleteQuestionComment(commentId: string) { return api<any>(endpoints.content.questionComment(commentId), { method: "DELETE" }); }
export async function getLectureMiniQuizQuestions(questionIds: string[], subjectId: string) {
  const ids = questionIds.filter(Boolean).join(",");
  if (!ids) return { ok: true as const, data: { items: [] }, requestId: "client" };
  return api<any>(endpoints.content.miniQuiz() + `?subject_id=${encodeURIComponent(subjectId)}&ids=${encodeURIComponent(ids)}`);
}
export async function checkLectureMiniQuizAnswer(questionId: string, selectedIndexes: number[], subjectId: string) {
  return api<any>(endpoints.content.miniQuizCheck(), {
    method: "POST",
    body: JSON.stringify({ question_id: questionId, selected_indexes: selectedIndexes, subject_id: subjectId })
  });
}
export async function getTrainerFeed(subject = "histology", specialty = "mbh", limit = 30, offset = 0) {
  const q = new URLSearchParams({ subject, specialty, limit: String(limit), offset: String(offset) });
  return api<any>(endpoints.content.trainersFeed(q.toString()));
}
/** FA6: личная статистика тренажёра — accuracy по карточке/теме и очередь ошибок. */
export async function getTrainerStats(options: RequestInit = {}) { return api<any>(endpoints.content.trainerFeedStats(), options); }

export async function getTrainerFeedCard(id: string) {
  const idKey = String(id);
  const userScope = currentUserScope();
  const cacheKey = userScope === null ? null : `${userScope}|${idKey}`;
  if (cacheKey) {
    const cached = trainerCardCache.get(cacheKey);
    if (cached) return { ok: true as const, data: { item: cached }, requestId: "cache" };
    const pending = trainerCardInflight.get(cacheKey);
    if (pending) return pending;
  }
  const promise = api<any>(endpoints.content.trainerFeedCard(idKey)).then((result) => {
    if (cacheKey && currentUserScope() === userScope && result.ok && result.data?.item) trainerCardCache.set(cacheKey, result.data.item);
    return result;
  }).finally(() => { if (cacheKey) trainerCardInflight.delete(cacheKey); });
  if (cacheKey) trainerCardInflight.set(cacheKey, promise);
  return promise;
}
export async function answerTrainerCard(payload: any) { return api<any>(endpoints.content.trainerFeedAnswer(), { method: "POST", body: JSON.stringify(payload) }); }

// ---- Attestations (colloquium / exam / credit / test / control) ----
export async function listAttestations(subjectSlug?: string, type?: string) {
  const q = new URLSearchParams();
  if (subjectSlug) q.set("subject_slug", subjectSlug);
  if (type) q.set("type", type);
  return api<any>(endpoints.content.attestations(q.toString() || undefined));
}
export async function getAttestation(subjectSlug: string, slug: string) { return api<any>(endpoints.content.attestation(subjectSlug, slug)); }
