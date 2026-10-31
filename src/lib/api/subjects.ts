/**
 * Предметы, группы, темы и учебные планы (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { apiCached } from "./cache";
import { filterSafe, isSubjectCard } from "@/lib/guards";
import { endpoints } from "../endpoints";
import type { SubjectListData } from "./types";

export async function listSubjects(course?: number, semester?: number, options: RequestInit = {}) {
  const q = new URLSearchParams();
  if (course != null) q.set("course", String(course));
  if (semester != null) q.set("semester", String(semester));
  const r = await apiCached<SubjectListData>(endpoints.subjects.list(q.toString() || undefined), options);
  if (r?.ok && r.data) r.data = { ...r.data, items: filterSafe(r.data?.items, isSubjectCard) };
  return r;
}
export async function listGroups(includeInactive = false) { return api<any>(endpoints.subjects.groups(includeInactive ? "include_inactive=1" : undefined)); }
/** Админский справочник предметов: с архивными строками (для восстановления). */
export async function listSubjectsAdmin() { return api<any>(endpoints.subjects.list("include_inactive=1")); }
export async function groupMembers(id: string) { return api<any>(endpoints.subjects.groupMembers(id)) as any; }
export async function addGroupMember(id: string, payload: { email?: string; user_id?: string }) { return api<any>(endpoints.subjects.groupMembers(id), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function removeGroupMember(id: string, userId: string) { return api<any>(endpoints.subjects.groupMember(id, userId), { method: "DELETE" }) as any; }
export async function getSubject(id: string, options: RequestInit = {}) { return apiCached<any>(endpoints.subjects.detail(id), options); }
/** План предмета с личным прогрессом по темам: статус, счётчики тестов/вопросов, даты занятий. */
export async function getSubjectPlanProgress(id: string, options: RequestInit = {}) {
  const clean = String(id ?? "").trim();
  if (!clean) return { ok: false as const, error: { code: "VALIDATION_ERROR", message: "subject id required" }, requestId: "client" };
  return api<any>(endpoints.subjects.planProgress(clean), options);
}
/** Личная отметка по теме: status (pending/in_progress/passed/failed/retake_needed), grade, note, attempts. */
export async function setTopicProgress(topicId: string, patch: { status?: string; grade?: string | null; note?: string | null; attempts?: number }, options: RequestInit = {}) {
  const clean = String(topicId ?? "").trim();
  if (!clean) return { ok: false as const, error: { code: "VALIDATION_ERROR", message: "topic id required" }, requestId: "client" };
  return api<any>(endpoints.subjects.topicProgress(clean), { ...options, method: "PATCH", body: JSON.stringify(patch) });
}
export async function getCurriculum() { return api<any>(endpoints.subjects.curriculum()); }
export async function getSubjectGradebook(id: string, options: RequestInit = {}): Promise<any> {
  const clean = String(id ?? "").trim();
  if (!clean) return { ok: false, error: { code: "VALIDATION_ERROR", message: "subject id required" }, requestId: "client" };
  return api(endpoints.subjects.gradebook(clean), options) as any;
}
export async function getSubjectPlan(slug: string, course?: number | null, semester?: number | null, options: RequestInit = {}): Promise<any> {
  const clean = String(slug ?? "").trim();
  if (!clean) return { ok: false, error: { code: "VALIDATION_ERROR", message: "subject slug required" }, requestId: "client" };
  const q = new URLSearchParams();
  if (course != null) q.set("course", String(course));
  if (semester != null) q.set("semester", String(semester));
  return apiCached(endpoints.subjects.subjectPlan(clean, q.toString() || undefined), options) as any;
}
export async function listSubjectsCatalog(..._args: any[]): Promise<any> { const options = _args[0] as RequestInit | undefined; return apiCached(endpoints.subjects.catalog(), options) as any; }
export async function createGroup(payload: Record<string, unknown>): Promise<any> { return api(endpoints.subjects.groups(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function createSubject(payload: Record<string, unknown>): Promise<any> { return api(endpoints.subjects.list(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function updateGroup(id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.subjects.groupDetail(id), { method: "PATCH", body: JSON.stringify(payload) }) as any; }
export async function updateSubject(id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.subjects.detail(id), { method: "PATCH", body: JSON.stringify(payload) }) as any; }
export async function deleteGroup(id: string): Promise<any> { return api(endpoints.subjects.groupDetail(id), { method: "DELETE" }) as any; }
export async function deleteSubject(id: string): Promise<any> { return api(endpoints.subjects.detail(id), { method: "DELETE" }) as any; }
