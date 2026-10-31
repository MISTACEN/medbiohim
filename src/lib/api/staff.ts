/**
 * Роли и быстрые фиксы: возможности пользователя, запросы старост,
 * предпросмотр/применение/откат правок и уведомления.
 */
import { api } from "./client";
import { endpoints } from "../endpoints";

export type StaffCapabilities = {
  roles: string[];
  groups: Array<{ group_id: string; group_name: string | null; course_number?: number | null; semester?: number | null; stream?: string | null; role_in_group: string; subgroup?: string | null }>;
  starosta_groups: string[];
  can: { moderate: boolean; admin: boolean; starosta: boolean };
};

export async function staffCapabilities(): Promise<any> {
  return api(endpoints.staff.capabilities()) as any;
}

export async function staffGroupManage(groupId: string): Promise<any> {
  return api(endpoints.staff.groupManage(groupId)) as any;
}

export async function staffUpdateGroup(groupId: string, payload: { semester?: number; stream?: string | null }): Promise<any> {
  return api(endpoints.staff.group(groupId), { method: "PATCH", body: JSON.stringify(payload) }) as any;
}

export async function staffUpdateGroupMember(groupId: string, userId: string, payload: { subgroup?: string | null; course_override?: number | null }): Promise<any> {
  return api(endpoints.staff.groupMember(groupId, userId), { method: "PATCH", body: JSON.stringify(payload) }) as any;
}

export async function staffUpdateHomework(groupId: string, homeworkId: string, payload: Record<string, unknown>): Promise<any> {
  return api(endpoints.staff.groupHomework(groupId, homeworkId), { method: "PATCH", body: JSON.stringify(payload) }) as any;
}

export async function staffRequestJoin(groupId: string, message: string): Promise<any> {
  return api(endpoints.staff.joinRequests(groupId), { method: "POST", body: JSON.stringify({ message }) }) as any;
}

export async function staffReviewJoinRequest(groupId: string, requestId: string, approve: boolean, note = ""): Promise<any> {
  return api(endpoints.staff.joinRequest(groupId, requestId), { method: "PATCH", body: JSON.stringify({ approve, note }) }) as any;
}

export async function staffRequests(status?: string): Promise<any> {
  const search = new URLSearchParams();
  if (status) search.set("status", status);
  return api(endpoints.staff.requests(search.toString() || undefined)) as any;
}

export async function staffCreateRequest(payload: { kind: "course_change" | "admission_year_change" | "material_publish" | "role_change"; group_id?: string; payload?: Record<string, unknown>; reason?: string }): Promise<any> {
  return api(endpoints.staff.requests(), { method: "POST", body: JSON.stringify(payload) }) as any;
}

export async function staffReviewRequest(id: string, approve: boolean, note = ""): Promise<any> {
  return api(endpoints.staff.request(id), { method: "PATCH", body: JSON.stringify({ approve, note }) }) as any;
}

export type FixPreview = {
  target: string;
  id: string;
  changes: Array<{ field: string; label: string; before: unknown; after: unknown }>;
  message: string;
  requires_confirmation: boolean;
};

export async function staffFixPreview(target: string, id: string, patch: Record<string, unknown>): Promise<any> {
  return api(endpoints.staff.fixesPreview(), { method: "POST", body: JSON.stringify({ target, id, patch }) }) as any;
}

export async function staffFixApply(target: string, id: string, patch: Record<string, unknown>, reason = ""): Promise<any> {
  return api(endpoints.staff.fixesApply(), { method: "POST", body: JSON.stringify({ target, id, patch, reason }) }) as any;
}

export async function staffFixLog(): Promise<any> {
  return api(endpoints.staff.fixes()) as any;
}

export async function staffRevertFix(id: string): Promise<any> {
  return api(endpoints.staff.fixRevert(id), { method: "POST", body: "{}" }) as any;
}

export async function staffMergeTopics(sourceTopicId: string, targetTopicId: string, options: { preview?: boolean; reason?: string } = {}): Promise<any> {
  return api(endpoints.staff.topicsMerge(), {
    method: "POST",
    body: JSON.stringify({ source_topic_id: sourceTopicId, target_topic_id: targetTopicId, ...options }),
  }) as any;
}

export async function staffNotifications(): Promise<any> {
  return api(endpoints.staff.notifications()) as any;
}

export async function staffMarkNotificationsRead(id?: string): Promise<any> {
  return api(endpoints.staff.notificationsRead(), { method: "POST", body: JSON.stringify(id ? { id } : {}) }) as any;
}
