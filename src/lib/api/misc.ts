/**
 * Смешанные домены: здоровье, присутствие, дашборд, прогресс, academic,
 * заметки, избранное, интеграции университетского портала, внешние платформы
 * (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { filterSafe, isAnnouncement } from "@/lib/guards";
import { endpoints } from "../endpoints";
import type {
  AcademicPlan,
  AcademicPlanItem,
  AcademicState,
  Dashboard,
  IntegrationImportInput,
  IntegrationImportResult,
  IntegrationImportsData,
  StudyPlan,
} from "./types";

export async function health() { return api<any>(endpoints.misc.health()); }
export async function presenceHeartbeat() { return api<any>(endpoints.misc.presenceHeartbeat(), { method: "POST", body: "{}" }); }
export async function getDashboard(options: RequestInit = {}) {
  const r = await api<Dashboard>(endpoints.misc.dashboard(), options);
  if (r?.ok && r.data) r.data = { ...r.data, announcements: filterSafe(r.data?.announcements, isAnnouncement) };
  return r;
}
export async function getProgress(subjectId?: string, groupId?: string, options: RequestInit = {}) {
  const q = new URLSearchParams();
  if (subjectId) q.set("subject_id", subjectId);
  if (groupId) q.set("group_id", groupId);
  return api<any>(endpoints.misc.progress(q.toString() || undefined), options);
}
/** FA3: сводка прогресса v2 — точность по предметам, активность 30 дней, SRS, «что подтянуть». */
export async function getProgressSummary(options: RequestInit = {}) { return api<any>(endpoints.misc.progressSummary(), options); }
/** Событие учебной ленты (Фаза 5). */
export type ActivityEvent = {
  id: string;
  kind: string;
  subject_slug: string | null;
  ref_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};
/** Последние события студента: их пишет сервер, клиент только читает. */
export async function getRecentActivity(limit = 10, options: RequestInit = {}) {
  return api<{ items: ActivityEvent[]; count: number }>(endpoints.misc.activity(`limit=${limit}`), options);
}

/** Пункт ночного агента: вопрос банка + эталонный ответ на конкретный день. */
export type ExamAgentItem = {
  id: string;
  plan_id: string;
  day: string;
  question_text: string;
  answer: string | null;
  topic: string | null;
  done: boolean;
  position: number;
};
export type ExamAgentBucket = { day: string; items: ExamAgentItem[]; done: number; total: number };
export type ExamAgentPlan = {
  id: string;
  subject_slug: string | null;
  event_date: string;
  status: string;
  days_left: number;
  today: ExamAgentBucket;
  tomorrow: ExamAgentBucket;
};

/** Планы агента с разборами на сегодня и завтра. */
export async function getExamAgent(options: RequestInit = {}) {
  return api<{ plans: ExamAgentPlan[]; today: string; tomorrow: string; questions_per_day: number }>(
    endpoints.misc.studyPrepAgent(),
    options,
  );
}

/** Запуск агента: план на дату экзамена + разборы на сегодня. */
export async function createExamAgent(subjectSlug: string, eventDate: string) {
  return api<{ plan: { id: string }; day: string; added: number }>(endpoints.misc.studyPrepAgent(), {
    method: "POST",
    body: JSON.stringify({ subject_slug: subjectSlug, event_date: eventDate }),
  });
}

/** Отметка «разобрал» у своего пункта агента. */
export async function setExamAgentItemDone(id: string, done = true) {
  return api<{ item: { id: string; done: boolean } }>(endpoints.misc.studyPrepAgentItem(id), {
    method: "PATCH",
    body: JSON.stringify({ done }),
  });
}
export async function syncAcademicState() { return api<any>(endpoints.misc.academicSync(), { method: "POST", body: "{}" }); }
export async function getAcademicState(options: RequestInit = {}) { return api<AcademicState>(endpoints.misc.academicState(), options); }
export async function saveAcademicState(payload: Record<string, unknown>) { return api<any>(endpoints.misc.academicState(), { method: "PUT", body: JSON.stringify(payload) }); }
export async function generateAcademicAiPlan(options: RequestInit = {}) { return api<{ plan: AcademicPlan; items: AcademicPlanItem[]; source_state: AcademicState }>(endpoints.misc.academicAiPlan(), { ...options, method: "POST", body: "{}" }); }
/** Фаза 1: план подготовки к событию — сохранённый или предпросмотр правилами. */
export async function getStudyPlan(eventId: string, options: RequestInit = {}) {
  return api<{ plan: StudyPlan; persisted: boolean; service_notice?: string }>(
    endpoints.misc.studyPrepPlan(eventId),
    options,
  );
}
export async function generateStudyPlan(eventId: string) {
  return api<{ plan: StudyPlan; persisted: boolean; service_notice?: string }>(
    endpoints.misc.studyPrepPlan(),
    { method: "POST", body: JSON.stringify({ schedule_entry_id: eventId }) },
  );
}
/** Фаза 6: сжать повторения предмета под дату события (только раньше, никогда позже). */
export async function compressStudyPlan(planId: string) {
  return api<{ moved: number; target_due: string; event_date: string; scope: string }>(
    endpoints.misc.studyPrepCompress(planId),
    { method: "POST", body: "{}" },
  );
}
export async function toggleStudyPlanItem(planId: string, payload: { day: string; index: number; done: boolean }) {
  return api<{ plan: StudyPlan; persisted: boolean }>(endpoints.misc.studyPrepPlanItem(planId), {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export async function listNotes(options: RequestInit = {}) { return api<any>(endpoints.misc.notes(), options); }
export async function deleteNote(id: string) { return api<any>(endpoints.misc.note(id), { method: "DELETE" }); }
export async function upsertNote(targetType: string, targetId: string, body: string) { return api<any>(endpoints.misc.notes(), { method: "POST", body: JSON.stringify({ target_type: targetType, target_id: targetId, body }) }); }
export async function listFavorites(options: RequestInit = {}) { return api<any>(endpoints.misc.favorites(), options); }
export async function toggleFavorite(targetType: string, targetId: string) { return api<any>(endpoints.misc.favoritesToggle(), { method: "POST", body: JSON.stringify({ target_type: targetType, target_id: targetId }) }); }
/**
 * University portal imports (ФЕСМУ/ЕИОС/manual selection).
 * Additive helpers for docs/UNIVERSITY-INTEGRATION-CONTRACT.md §3 — the Worker
 * route deduplicates by SHA-256(url) per user and caps a request at 50 items.
 */
export async function integrationImports() { return api<IntegrationImportsData>(endpoints.misc.integrationImports()); }
export async function integrationImport(items: IntegrationImportInput[]) { return api<IntegrationImportResult>(endpoints.misc.integrationImports(), { method: "POST", body: JSON.stringify({ items }) }); }
export async function integrationImportDelete(id: string) { return api<{ deleted: boolean }>(endpoints.misc.integrationImport(id), { method: "DELETE" }); }
export async function trackExternalPlatformClick(payload: { platform: string; title: string; href: string; subject_slug?: string | null }) { return api<any>(endpoints.misc.externalPlatformClick(), { method: "POST", body: JSON.stringify(payload) }); }
export async function externalPlatformStats() { return api<any>(endpoints.misc.externalPlatformStats()); }
