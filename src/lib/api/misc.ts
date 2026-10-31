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
export async function syncAcademicState() { return api<any>(endpoints.misc.academicSync(), { method: "POST", body: "{}" }); }
export async function getAcademicState(options: RequestInit = {}) { return api<AcademicState>(endpoints.misc.academicState(), options); }
export async function saveAcademicState(payload: Record<string, unknown>) { return api<any>(endpoints.misc.academicState(), { method: "PUT", body: JSON.stringify(payload) }); }
export async function generateAcademicAiPlan(options: RequestInit = {}) { return api<{ plan: AcademicPlan; items: AcademicPlanItem[]; source_state: AcademicState }>(endpoints.misc.academicAiPlan(), { ...options, method: "POST", body: "{}" }); }
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
