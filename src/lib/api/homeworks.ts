/**
 * Домашние задания и личные задания (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { endpoints } from "../endpoints";
import type { MyAssignmentStatus } from "./types";

export async function listHomeworks(groupId?: string) {
  const q = groupId ? `group_id=${encodeURIComponent(groupId)}` : "";
  return api<any>(endpoints.homeworks.list(q || undefined));
}
/** §8 Smart Paste: разобрать вставленный текст ДЗ по правилам (без AI). */
export async function smartParseHomework(text:string,options:RequestInit={}){return api<any>(endpoints.homeworks.smartParse(),{...options,method:"POST",body:JSON.stringify({text})})}

export async function createHomework(payload: { title: string; description?: string; subject_id?: string; due_date?: string; due_at?: string; group_id?: string; scope?: "group" | "personal"; schedule_entry_id?: string; attachment_file_ids?: string[] }) { return api<any>(endpoints.homeworks.list(), { method: "POST", body: JSON.stringify(payload) }); }
export async function setHomeworkDone(id: string, done: boolean) { return api<any>(endpoints.homeworks.progress(id), { method: "POST", body: JSON.stringify({ done }) }); }
export async function submitHomework(id: string, textAnswer?: string, fileId?: string) { return api<any>(endpoints.homeworks.submit(id), { method: "POST", body: JSON.stringify({ text_answer: textAnswer, file_id: fileId }) }); }
export async function listHomeworkSubmissions(id: string) { return api<any>(endpoints.homeworks.submissions(id)); }
export async function listMyAssignments(status?: string) {
  const q = status ? `status=${encodeURIComponent(status)}` : "";
  return api<any>(endpoints.homeworks.assignments(q || undefined));
}
export async function saveMyAssignments(items: Array<{ subject: string; topic: string; due_date?: string | null; status?: MyAssignmentStatus; grade?: string | null; note?: string | null; source?: "manual" | "csv" }>) { return api<any>(endpoints.homeworks.assignments(), { method: "POST", body: JSON.stringify({ items }) }); }
export async function updateMyAssignment(id: string, patch: { status?: MyAssignmentStatus; grade?: string | null; note?: string | null; due_date?: string | null }) { return api<any>(endpoints.homeworks.assignment(id), { method: "PATCH", body: JSON.stringify(patch) }); }
export async function deleteMyAssignment(id: string) { return api<any>(endpoints.homeworks.assignment(id), { method: "DELETE" }) as any; }
