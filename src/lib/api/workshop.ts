/**
 * Мастерская (Workshop): публикация студенческих материалов, версии и модерация.
 */
import { api, API_URL } from "./client";
import { endpoints } from "../endpoints";
import { getAccessToken, refreshAccessToken } from "@/lib/auth/session";

export type WorkshopItemFile = { id: string; file_id?: string | null; name: string; mime: string; size: number; position: number };
export type WorkshopQuestion = { id: string; text: string; topic?: string | null; position: number };
export type WorkshopItem = {
  id: string;
  author_id: string;
  author_name?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  topic?: string | null;
  title: string;
  summary?: string | null;
  kind: "photo_lecture" | "notes" | "test_questions" | "pdf" | "other";
  tags: string[];
  status: "draft" | "pending" | "published" | "hidden" | "rejected" | "deleted";
  version_no: number;
  report_count?: number;
  personal_data_flags?: string[];
  moderation_note?: string | null;
  created_at?: string;
  updated_at?: string;
  files?: WorkshopItemFile[];
  questions?: WorkshopQuestion[];
};

export type WorkshopFileDraft = { file_id: string; name: string; mime: string; size: number };

export async function workshopSettings(): Promise<any> {
  return api(endpoints.workshop.settings()) as any;
}

export async function updateWorkshopSettings(payload: { moderation_mode?: "open" | "manual"; personal_data_warning?: boolean }): Promise<any> {
  return api(endpoints.workshop.settings(), { method: "PATCH", body: JSON.stringify(payload) }) as any;
}

export async function suggestWorkshop(files: Array<{ name: string; mime: string; size?: number }>, text = "", title = ""): Promise<any> {
  return api(endpoints.workshop.suggest(), {
    method: "POST",
    body: JSON.stringify({ files, text, title }),
  }) as any;
}

export async function listWorkshopItems(params: {
  mine?: boolean;
  status?: string;
  subjectId?: string;
  kind?: string;
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<any> {
  const search = new URLSearchParams();
  if (params.mine) search.set("mine", "1");
  if (params.status) search.set("status", params.status);
  if (params.subjectId) search.set("subject_id", params.subjectId);
  if (params.kind) search.set("kind", params.kind);
  if (params.tag) search.set("tag", params.tag);
  if (params.q) search.set("q", params.q);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  return api(endpoints.workshop.items(search.toString() || undefined)) as any;
}

export async function getWorkshopItem(id: string): Promise<any> {
  return api(endpoints.workshop.item(id)) as any;
}

export async function createWorkshopItem(payload: {
  title?: string;
  summary?: string;
  kind?: WorkshopItem["kind"];
  subject_id?: string | null;
  topic?: string | null;
  tags?: string[];
  group_id?: string | null;
  files?: WorkshopFileDraft[];
  questions?: string[];
  question_text?: string;
  personal_data_confirmed?: boolean;
}): Promise<any> {
  return api(endpoints.workshop.items(), { method: "POST", body: JSON.stringify(payload) }) as any;
}

export async function updateWorkshopItem(id: string, payload: Record<string, unknown>): Promise<any> {
  return api(endpoints.workshop.item(id), { method: "PATCH", body: JSON.stringify(payload) }) as any;
}

export async function setWorkshopItemHidden(id: string, hidden: boolean): Promise<any> {
  return api(endpoints.workshop.itemVisibility(id), { method: "POST", body: JSON.stringify({ hidden }) }) as any;
}

export async function deleteWorkshopItem(id: string): Promise<any> {
  return api(endpoints.workshop.item(id), { method: "DELETE" }) as any;
}

export async function workshopVersions(id: string): Promise<any> {
  return api(endpoints.workshop.itemVersions(id)) as any;
}

export async function restoreWorkshopVersion(id: string, versionNo: number): Promise<any> {
  return api(endpoints.workshop.itemRestore(id, versionNo), { method: "POST", body: "{}" }) as any;
}

export async function reportWorkshopItem(id: string, reason: string): Promise<any> {
  return api(endpoints.workshop.itemReport(id), { method: "POST", body: JSON.stringify({ reason }) }) as any;
}

export async function workshopModerationQueue(): Promise<any> {
  return api(endpoints.workshop.moderationQueue()) as any;
}

export async function moderateWorkshopItem(id: string, payload: { action: "approve" | "reject" | "hide" | "unhide"; note?: string; hidden_until?: string }): Promise<any> {
  return api(endpoints.workshop.moderationItem(id), { method: "POST", body: JSON.stringify(payload) }) as any;
}

export async function workshopReports(): Promise<any> {
  return api(endpoints.workshop.moderationReports()) as any;
}

export async function resolveWorkshopReport(id: string, status: "resolved" | "dismissed"): Promise<any> {
  return api(endpoints.workshop.moderationReport(id), { method: "PATCH", body: JSON.stringify({ status }) }) as any;
}

/** Object URL файла мастерской: файлы отдаются только через аутентифицированный прокси. */
const workshopFileCache = new Map<string, string>();

export async function getWorkshopFileUrl(itemId: string, fileId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const key = `${itemId}|${fileId}`;
  const cached = workshopFileCache.get(key);
  if (cached) return cached;
  const request = async (token: string | null) => fetch(`${API_URL}${endpoints.workshop.itemFile(itemId, fileId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  try {
    let token = getAccessToken();
    let response = await request(token);
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) { token = refreshed; response = await request(token); }
    }
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    const url = URL.createObjectURL(blob);
    workshopFileCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export function forgetWorkshopFile(itemId: string, fileId: string): void {
  const key = `${itemId}|${fileId}`;
  const url = workshopFileCache.get(key);
  if (url?.startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch {} }
  workshopFileCache.delete(key);
}
