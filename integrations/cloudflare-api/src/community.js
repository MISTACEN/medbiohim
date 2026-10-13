import { authenticateSupabaseRequest } from "./supabase-auth.js";

const fail = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createClient(request, env, fetcher) {
  const auth = await authenticateSupabaseRequest(request, env, fetcher);
  if (!auth.ok) return auth;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const key = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(String(env.SUPABASE_URL || "").trim()); if (base.protocol !== "https:" || !key) throw new Error("config"); }
  catch { return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function rest(path, params = {}, init = {}) {
    const url = new URL("/rest/v1/" + path, base);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    const response = await fetcher(url.toString(), {
      ...init,
      method: init.method || "GET",
      headers: {
        apikey: key, authorization: "Bearer " + token, accept: "application/json",
        ...(init.body != null ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    const text = await response.text();
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch {} }
    if (!response.ok) { const error = new Error("Supabase REST failed"); error.status = response.status; throw error; }
    return payload;
  }
  const rows = async (table, params = {}, init = {}) => {
    const data = await rest(table, params, init);
    return Array.isArray(data) ? data : [];
  };
  return { ok: true, user: auth.user, rows };
}

async function resolveGroup(rows, uid, requested) {
  const memberships = await rows("group_memberships", {
    select: "group_id,is_active", user_id: "eq." + uid, is_active: "eq.true", limit: "100",
  });
  const groups = [...new Set(memberships.map((row) => String(row.group_id || "")).filter((id) => UUID.test(id)))];
  if (!groups.length) return fail(422, "NO_GROUP", "Для сообщества нужна активная учебная группа");
  if (requested) {
    const id = String(requested).trim();
    if (!UUID.test(id)) return fail(422, "VALIDATION_ERROR", "group_id должен быть UUID");
    if (!groups.includes(id)) return fail(403, "FORBIDDEN", "Нет доступа к указанной группе");
    return { ok: true, groupId: id };
  }
  if (groups.length > 1) return fail(409, "GROUP_REQUIRED", "Выберите учебную группу", { details: { group_ids: groups } });
  return { ok: true, groupId: groups[0] };
}

export async function listSupabaseCommunityPosts(request, env, requestedGroupId = "", fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  try {
    const group = await resolveGroup(client.rows, client.user.id, requestedGroupId);
    if (!group.ok) return group;
    const items = await client.rows("community_posts", {
      select: "id,author_id,group_id,tag,text,title,body,created_at,updated_at",
      is_deleted: "eq.false",
      or: "(group_id.eq." + group.groupId + ",group_id.is.null)",
      order: "created_at.desc",
      limit: "100",
    });
    return { ok: true, data: { items, group_id: group.groupId } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для чтения сообщества");
    return fail(503, "DB_UNAVAILABLE", "Сообщество временно недоступно");
  }
}

export async function createSupabaseCommunityPost(request, env, input, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const title = String(body.title || "").trim();
  const text = String(body.body || body.text || "").trim();
  if (!title || !text) return fail(422, "VALIDATION_ERROR", "title and body required");
  if (title.length > 180 || text.length > 12000) return fail(422, "VALIDATION_ERROR", "Заголовок или текст сообщения слишком длинный");
  try {
    const group = await resolveGroup(client.rows, client.user.id, body.group_id || "");
    if (!group.ok) return group;
    const rows = await client.rows("community_posts", { select: "id,author_id,group_id,tag,text,title,body,created_at,updated_at" }, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        author_id: client.user.id,
        group_id: group.groupId,
        title,
        body: text,
        text,
        is_deleted: false,
      }),
    });
    if (!rows[0]) return fail(503, "DB_UNAVAILABLE", "Сообщение не было сохранено");
    return { ok: true, data: { post: rows[0] } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Публикация в указанной группе запрещена");
    if (error?.status === 400 || error?.status === 422) return fail(422, "VALIDATION_ERROR", "База данных отклонила сообщение");
    return fail(503, "DB_UNAVAILABLE", "Не удалось создать сообщение сообщества");
  }
}
