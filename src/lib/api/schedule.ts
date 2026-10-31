/**
 * Расписание, посещаемость, планировщик, iCal (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { filterSafe, isScheduleRow } from "@/lib/guards";
import { endpoints } from "../endpoints";
import type { ScheduleEntry, ScheduleListData } from "./types";

export async function listSchedule(from?: string, to?: string, groupId?: string, options: RequestInit = {}) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  if (groupId) q.set("group_id", groupId);
  const r = await api<ScheduleListData>(endpoints.schedule.list(q.toString() || undefined), options);
  if (r?.ok && r.data) r.data = { ...r.data, items: filterSafe(r.data?.items, isScheduleRow) as ScheduleEntry[] };
  return r;
}
export async function getScheduleMeta(course?: number, semester?: number, options: RequestInit = {}): Promise<any> {
  const q = new URLSearchParams();
  if (course != null) q.set("course", String(course));
  if (semester != null) q.set("semester", String(semester));
  return api(endpoints.schedule.meta(q.toString() || undefined), options) as any;
}
export async function getScheduleFeedLink() { return api<any>(endpoints.schedule.feedLink()); }
export async function importIcalCalendar(payload: { text?: string; url?: string; dry_run?: boolean }) { return api<any>(endpoints.schedule.ical(), { method: "POST", body: JSON.stringify(payload) }); }
export async function listIcalEvents(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return api<any>(endpoints.schedule.ical(q.toString() || undefined));
}
export async function deleteIcalEvent(id: string) { return api<any>(endpoints.schedule.icalEvent(id), { method: "DELETE" }); }
export async function markAttendance(entryId: string, status: "present" | "excused" | "sick" | "unexcused", note?: string, groupId?: string) {
  const q = groupId ? `group_id=${encodeURIComponent(groupId)}` : "";
  return api<any>(endpoints.schedule.attendance(entryId, q || undefined), { method: "POST", body: JSON.stringify({ status, note }) });
}
export async function getStudentPlanner(from?: string, to?: string, groupId?: string, options: RequestInit = {}) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  if (groupId) q.set("group_id", groupId);
  return api<any>(endpoints.schedule.planner(q.toString() || undefined), options);
}
