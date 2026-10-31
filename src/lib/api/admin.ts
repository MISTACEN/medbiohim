/**
 * Админ-панель: обзор, БД-консоль, контент, расписание, пользователи, Telegram
 * (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { endpoints } from "../endpoints";

const ADMIN_DB_ID = "supabase_primary";

export async function adminPresence(within = 180) { return api<any>(endpoints.admin.presence(within)); }
export async function adminOverview(): Promise<any> { return api(endpoints.admin.overview()) as any; }
export async function adminUpdateSite(site: Record<string, unknown>): Promise<any> { return api(endpoints.admin.site(), { method: "PUT", body: JSON.stringify(site) }) as any; }

export async function adminDatabaseConnections(): Promise<any> {
  return api(endpoints.admin.databaseConnections()) as any;
}
export async function adminDatabaseSaveConnection(id: string, payload: Record<string, unknown>): Promise<any> {
  return api(endpoints.admin.databaseConnection(id), {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as any;
}
export async function adminDatabaseTestConnection(id: string): Promise<any> {
  return api(endpoints.admin.databaseConnectionTest(id), { method: "POST", body: "{}" }) as any;
}
export async function adminDatabaseTables(id: string): Promise<any> {
  return api(endpoints.admin.databaseTables(id)) as any;
}
export async function adminDatabaseSchema(id: string, table: string): Promise<any> {
  return api(endpoints.admin.databaseSchema(id, table)) as any;
}
export async function adminDatabaseRows(id: string, table: string, limit = 100, offset = 0, q = ""): Promise<any> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q.trim()) params.set("q", q.trim());
  return api(endpoints.admin.databaseRows(id, table, params.toString())) as any;
}
export async function adminDatabaseInsert(id: string, table: string, row: Record<string, unknown>): Promise<any> {
  return api(endpoints.admin.databaseRows(id, table), {
    method: "POST", body: JSON.stringify(row),
  }) as any;
}
export async function adminDatabaseUpdate(id: string, table: string, key: Record<string, unknown>, row: Record<string, unknown>): Promise<any> {
  return api(endpoints.admin.databaseRows(id, table), {
    method: "PATCH", body: JSON.stringify({ key, row }),
  }) as any;
}
export async function adminDatabaseDelete(id: string, table: string, key: Record<string, unknown>): Promise<any> {
  return api(endpoints.admin.databaseRows(id, table), {
    method: "DELETE", body: JSON.stringify({ key }),
  }) as any;
}
export async function adminDatabaseSql(id: string, sql: string, confirmed = false): Promise<any> {
  return api(endpoints.admin.databaseSql(id), {
    method: "POST", body: JSON.stringify({ sql, confirm: confirmed }),
  }) as any;
}

export async function adminDbAudit(params: { limit?: number; offset?: number; table?: string; source?: string } = {}): Promise<any> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.table) search.set("table", params.table);
  if (params.source) search.set("source", params.source);
  return api(endpoints.admin.dbAudit(search.toString() || undefined)) as any;
}
export async function adminDbAuditVersion(id: string): Promise<any> { return api(endpoints.admin.dbAuditVersion(id)) as any; }
export async function adminRollbackAudit(id: string): Promise<any> { return api(endpoints.admin.dbAuditRollback(id), { method: "POST", body: "{}" }) as any; }
export async function adminDbDelete(table: string, id: string): Promise<any> { return api(endpoints.admin.databaseRows(ADMIN_DB_ID, table, `id=${encodeURIComponent(id)}`), { method: "DELETE" }) as any; }
export async function adminDbDeleteByKey(table: string, key: Record<string, unknown>): Promise<any> { return adminDbDelete(table, String(key.id || "")); }
export async function adminDbInsert(table: string, row: Record<string, unknown>): Promise<any> { return api(endpoints.admin.databaseRows(ADMIN_DB_ID, table), { method: "POST", body: JSON.stringify(row) }) as any; }
export async function adminDbList(table: string, limit = 200): Promise<any> { return api(endpoints.admin.databaseRows(ADMIN_DB_ID, table, `limit=${encodeURIComponent(String(limit))}`)) as any; }
export async function adminDbMeta(..._args: any[]): Promise<any> { return api(endpoints.admin.databaseTables(ADMIN_DB_ID)) as any; }
export async function adminDbUpdate(table: string, id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.databaseRows(ADMIN_DB_ID, table), { method: "PATCH", body: JSON.stringify({ id, patch: payload }) }) as any; }
export async function adminDbUpdateByKey(table: string, key: Record<string, unknown>, payload: Record<string, unknown>): Promise<any> { return adminDbUpdate(table, String(key.id || ""), payload); }
// MA10: атомарная сборка одного теста или нескольких вариантов одним запросом.
// Сервер (RPC medbiohim_build_test_variants) создаёт все тесты и ссылки на
// вопросы в одной транзакции: частичного успеха не бывает.
export async function adminBuildTestVariants(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.buildTestVariants(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function adminBindTelegramChat(chatId: string | number, groupId: string): Promise<any> { return api(endpoints.admin.telegramChatBind(chatId), { method: "POST", body: JSON.stringify({ group_id: groupId }) }) as any; }
export async function adminTelegramChats(): Promise<any> { return api(endpoints.admin.telegramChats()) as any; }
export async function adminTelegramAiStatus(): Promise<any> { return api(endpoints.admin.telegramAiStatus()) as any; }
export async function adminTelegramMessages(chatId?: string | number, limit = 50): Promise<any> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (chatId != null && String(chatId) !== "") q.set("chat_id", String(chatId));
  return api(endpoints.admin.telegramMessages(q.toString())) as any;
}
export async function adminPublishTelegramMessage(id: string): Promise<any> { return api(endpoints.admin.telegramMessagePublish(id), { method: "POST", body: "{}" }) as any; }
export async function adminSetTelegramWebhook(): Promise<any> { return api(endpoints.admin.telegramSetWebhook(), { method: "POST", body: "{}" }) as any; }
export async function adminSetUserRole(userId: string, role: string, action = "assign"): Promise<any> { return api(endpoints.admin.userRoles(), { method: "POST", body: JSON.stringify({ user_id: userId, role, action }) }) as any; }
export async function adminListUsers(params: { q?: string; role?: string; groupId?: string; limit?: number; offset?: number } = {}): Promise<any> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.role) search.set("role", params.role);
  if (params.groupId) search.set("group_id", params.groupId);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  return api(endpoints.admin.users(search.toString() || undefined)) as any;
}
export async function adminContentArchive(table: string, id: string): Promise<any> { return api(endpoints.admin.contentArchive(), { method: "POST", body: JSON.stringify({ table, id }) }) as any; }
export async function adminContentMove(table: string, id: string, payload: Record<string, unknown> = {}): Promise<any> { return api(endpoints.admin.contentMove(), { method: "POST", body: JSON.stringify({ table, id, ...payload }) }) as any; }
export async function adminContentImport(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.contentImport(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function adminImportContentPackage(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.contentPackageImport(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function adminValidateContent(): Promise<any> { return api(endpoints.admin.contentValidate()) as any; }
export async function adminCreateAnnouncement(title: string, body: string, pinned = false): Promise<any> { return api(endpoints.admin.announcements(), { method: "POST", body: JSON.stringify({ title, body, pinned }) }) as any; }
export async function adminListAnnouncements(): Promise<any> { return api(endpoints.admin.announcements()) as any; }
export async function adminUpdateAnnouncement(id: string, patch: { title?: string; body?: string; pinned?: boolean }): Promise<any> { return api(endpoints.admin.announcement(id), { method: "PATCH", body: JSON.stringify(patch) }) as any; }
export async function adminDeleteAnnouncement(id: string): Promise<any> { return api(endpoints.admin.announcement(id), { method: "DELETE" }) as any; }
export async function adminListCommunity(): Promise<any> { return api(endpoints.admin.community()) as any; }
export async function adminUpdateCommunity(id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.communityDetail(id), { method: "PATCH", body: JSON.stringify(payload) }) as any; }
export async function adminDeleteCommunity(id: string): Promise<any> { return api(endpoints.admin.communityDetail(id), { method: "DELETE" }) as any; }
export async function adminCommunityReports() { return api(endpoints.community.adminReports()) as any; }
export async function adminUpdateCommunityReport(id: string, status: string) { return api(endpoints.community.adminReport(id), { method: "PATCH", body: JSON.stringify({ status }) }) as any; }
export async function adminListHomeworks(): Promise<any> { return api(endpoints.admin.homeworks()) as any; }
export async function adminCreateHomework(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.homeworks(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function adminDeleteHomework(id: string): Promise<any> { return api(endpoints.admin.homework(id), { method: "DELETE" }) as any; }
export async function adminListLectures(status?: string, subject?: string): Promise<any> {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (subject) q.set("subject", subject);
  return api(endpoints.admin.lectures(q.toString() || undefined)) as any;
}
export async function adminGenerateLecture(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.lectureGenerate(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function adminUpdateLecture(id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.lecture(id), { method: "PATCH", body: JSON.stringify(payload) }) as any; }
export async function adminDeleteLecture(id: string): Promise<any> { return api(endpoints.admin.lecture(id), { method: "DELETE" }) as any; }
export async function adminPublishLecture(id: string): Promise<any> { return api(endpoints.admin.lecturePublish(id), { method: "POST", body: "{}" }) as any; }
export async function adminRejectLecture(id: string): Promise<any> { return api(endpoints.admin.lectureReject(id), { method: "POST", body: "{}" }) as any; }
export async function adminListMaterials(): Promise<any> { return api(endpoints.admin.materials()) as any; }
export async function adminDeleteMaterial(id: string): Promise<any> { return api(endpoints.admin.material(id), { method: "DELETE" }) as any; }
export async function adminListQuestions(params: Record<string, unknown> = {}): Promise<any> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== "") q.set(k, String(v)); });
  return api(endpoints.admin.questions(q.toString() || undefined)) as any;
}
export async function adminCreateQuestion(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.questions(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function adminUpdateQuestion(id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.question(id), { method: "PUT", body: JSON.stringify(payload) }) as any; }
export async function adminDeleteQuestion(id: string): Promise<any> { return api(endpoints.admin.question(id), { method: "DELETE" }) as any; }
export async function adminUpdateBankQuestion(id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.questionBank(id), { method: "PUT", body: JSON.stringify(payload) }) as any; }
export async function adminUpdateQuestionReport(id: string, status: string): Promise<any> { return api(endpoints.admin.questionReport(id), { method: "PATCH", body: JSON.stringify({ status }) }) as any; }
export async function adminProblemCenter(): Promise<any> { return api(endpoints.admin.problemCenter()) as any; }
export async function adminCreateWork(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.problemCenterWork(), { method: "POST", body: JSON.stringify(payload) }) as any; }
export async function adminUpdateWork(id: string, payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.problemCenterWorkDetail(id), { method: "PATCH", body: JSON.stringify(payload) }) as any; }
export async function adminListSchedule(groupId?: string, semester?: number): Promise<any> {
  const q = new URLSearchParams();
  if (groupId) q.set("group_id", groupId);
  if (semester != null) q.set("semester", String(semester));
  return api(endpoints.admin.schedule() + (q.toString() ? "?" + q : "")) as any;
}
/** Резолвер когорты: название файла/листа → стабильная группа (год поступления). */
export async function adminResolveCohort(label: string): Promise<any> { return api(endpoints.admin.scheduleResolveGroup(label)) as any; }
export async function adminSaveSchedule(payload: Record<string, unknown>): Promise<any> { return api(endpoints.admin.schedule(), { method: "PUT", body: JSON.stringify(payload) }) as any; }
export async function adminImportScheduleXlsx(file: File, groupId: string, semester?: number) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("group_id", groupId);
  if (semester != null) fd.append("semester", String(semester));
  return api<any>(endpoints.admin.scheduleImport(), { method: "POST", body: fd });
}
export async function adminImportCurriculumXlsx(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return api<any>(endpoints.admin.importCurriculum(), { method: "POST", body: fd });
}
export async function adminFileAudit(limit = 200): Promise<any> { return api(endpoints.admin.filesAudit(`limit=${encodeURIComponent(String(limit))}`)) as any; }
export async function adminMediaCapabilities(): Promise<any> { return api(endpoints.admin.filesCapabilities()) as any; }
export async function adminListAttestations(subjectSlug?: string) {
  const q = subjectSlug ? `subject_slug=${encodeURIComponent(subjectSlug)}` : "";
  return api<any>(endpoints.admin.attestations(q || undefined));
}
export async function adminGetAttestation(subjectSlug: string, slug: string) { return api<any>(endpoints.admin.attestation(subjectSlug, slug)); }
export async function adminSaveAttestation(subjectSlug: string, slug: string, payload: unknown) { return api<any>(endpoints.admin.attestation(subjectSlug, slug), { method: "PUT", body: JSON.stringify(payload) }); }
export async function adminDeleteAttestation(subjectSlug: string, slug: string) { return api<any>(endpoints.admin.attestation(subjectSlug, slug), { method: "DELETE" }); }
