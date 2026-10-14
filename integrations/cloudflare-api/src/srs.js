import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 5_000;
const CARD_FIELDS = [
  "id", "user_id", "source_type", "source_id", "front", "back", "subject_id",
  "subject_slug", "topic", "ease", "interval", "reps", "due_at", "reviewed_at",
  "created_at", "updated_at",
].join(",");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[A-Za-z0-9_-]{1,120}$/;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function restFailure(error, code = "SRS_UNAVAILABLE", message = "Карточки повторения временно недоступны") {
  const status = Number(error?.status || 0);
  if (status === 401) return failure(401, "UNAUTHORIZED", "Требуется войти в систему");
  if (status === 403) return failure(403, "FORBIDDEN", "Нет доступа к личным карточкам");
  if (status === 404) return failure(404, "NOT_FOUND", "Карточка не найдена");
  if (status === 400 || status === 422) return failure(422, "VALIDATION_ERROR", "Проверьте данные карточки");
  return failure(503, code, message);
}

function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeSlug(value) {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const slug = value.trim();
  if (!slug) return { ok: true, value: null };
  return SLUG.test(slug) ? { ok: true, value: slug } : { ok: false };
}

function cardTime(value, fallback) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : fallback;
}

function formatCard(row, now = Math.floor(Date.now() / 1000)) {
  const dueAt = cardTime(row?.due_at, now);
  const subjectSlug = String(row?.subject_slug || "");
  const subjectName = String(row?.subject_name || subjectSlug);
  return {
    id: String(row?.id || ""),
    front: String(row?.front || ""),
    back: String(row?.back || ""),
    subject: subjectName,
    subject_slug: subjectSlug,
    topic: String(row?.topic || ""),
    source: row?.source_type === "personal" ? "personal" : "question",
    ease: Number.isFinite(Number(row?.ease)) ? Number(row.ease) : 2.5,
    interval: Number.isFinite(Number(row?.interval)) ? Number(row.interval) : 0,
    reps: Number.isFinite(Number(row?.reps)) ? Number(row.reps) : 0,
    due_at: dueAt,
    due_in_hours: Math.round(((dueAt - now) / 3600) * 10) / 10,
    reviewed_at: row?.reviewed_at || null,
  };
}

async function createClient(request, env, fetcher) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !anonKey || !token || !identity.user?.id) throw new Error("configuration");
    if (!base.hostname.endsWith(".supabase.co")) throw new Error("configuration");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST должен использовать HTTPS и anon key");
  }

  async function rows(table, query = {}, options = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") endpoint.searchParams.set(key, String(value));
    }
    const headers = {
      apikey: anonKey,
      authorization: "Bearer " + token,
      accept: "application/json",
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.prefer) headers.prefer = options.prefer;

    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: options.method || "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw Object.assign(new Error("Supabase REST request failed"), { status: 0 });
    }
    if (response.status >= 300 && response.status < 400) {
      throw Object.assign(new Error("Supabase REST redirect refused"), { status: response.status });
    }

    let payload = null;
    if (response.status !== 204) {
      try {
        const text = await response.text();
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      throw Object.assign(new Error("Supabase REST operation failed"), {
        status: response.status,
        code: payload && typeof payload === "object" ? payload.code : undefined,
      });
    }
    if (payload === null) return [];
    if (!Array.isArray(payload)) {
      throw Object.assign(new Error("Invalid Supabase collection"), { status: 0 });
    }
    return payload;
  }

  return { ok: true, userId: String(identity.user.id), rows };
}

async function cardsForUser(client, limit = 2000) {
  const cards = await client.rows("srs_cards", {
    select: CARD_FIELDS,
    user_id: "eq." + client.userId,
    order: "due_at.asc",
    limit: String(limit),
  });
  let subjects = [];
  try {
    subjects = await client.rows("subjects", {
      is_active: "eq.true",
      select: "id,name,slug",
      limit: "500",
    });
  } catch {
    // Subject labels are cosmetic; keep cards usable with their saved slug.
  }
  const namesBySlug = new Map(subjects.map((subject) => [
    String(subject.slug || ""),
    String(subject.name || subject.slug || ""),
  ]));
  return cards.map((card) => ({
    ...card,
    subject_name: namesBySlug.get(String(card.subject_slug || "")) || String(card.subject_slug || ""),
  }));
}

async function summaryForUser(client) {
  const [cards, questions] = await Promise.all([
    cardsForUser(client, 2000),
    client.rows("questions", {
      is_published: "eq.true",
      archived_at: "is.null",
      select: "id",
      limit: "2000",
    }),
  ]);
  const now = Math.floor(Date.now() / 1000);
  let due = 0;
  let learning = 0;
  const subjects = new Map();
  const existing = new Set();
  for (const card of cards) {
    if (cardTime(card.due_at, 0) <= now) due += 1;
    if (Number(card.reps || 0) > 0 && Number(card.interval || 0) < 2) learning += 1;
    if (card.source_type === "question" && card.source_id) existing.add(String(card.source_id));
    const slug = String(card.subject_slug || "");
    if (slug) {
      const current = subjects.get(slug) || {
        subject: String(card.subject_name || slug),
        subject_slug: slug,
        count: 0,
      };
      current.count += 1;
      subjects.set(slug, current);
    }
  }
  let newAvailable = 0;
  for (const question of questions) {
    if (!existing.has(String(question.id || ""))) newAvailable += 1;
  }
  return {
    due,
    learning,
    total: cards.length,
    new_available: newAvailable,
    subjects: [...subjects.values()],
  };
}

export async function getSrsSummary(request, env, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  try {
    return { ok: true, data: await summaryForUser(client) };
  } catch (error) {
    return restFailure(error);
  }
}

export async function ensureSrsDeck(request, env, input = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const count = boundedInt(body.count, 20, 1, 50);
  const slugResult = normalizeSlug(body.subject_slug);
  if (!slugResult.ok) return failure(422, "VALIDATION_ERROR", "Некорректный предмет");
  const subjectSlug = slugResult.value;

  try {
    const cards = await cardsForUser(client, 5000);
    const existing = new Set(cards
      .filter((card) => card.source_type === "question" && card.source_id)
      .map((card) => String(card.source_id)));
    const subjectRows = await client.rows("subjects", {
      is_active: "eq.true",
      select: "id,name,slug",
      limit: "500",
    });
    const byId = new Map(subjectRows.map((subject) => [String(subject.id || ""), subject]));
    let subjectId = null;
    if (subjectSlug) {
      const subject = subjectRows.find((item) => String(item.slug || "") === subjectSlug);
      subjectId = String(subject?.id || "");
      if (!subjectId) return { ok: true, data: { added: 0, total: cards.length } };
    }

    const query = {
      is_published: "eq.true",
      archived_at: "is.null",
      select: "id,text,answer,subject_id,topic",
      order: "created_at.asc",
      limit: "2000",
    };
    if (subjectId) query.subject_id = "eq." + subjectId;
    const questions = await client.rows("questions", query);
    let added = 0;
    for (const question of questions) {
      if (added >= count) break;
      const id = String(question.id || "");
      if (!UUID.test(id) || existing.has(id)) continue;
      const subject = byId.get(String(question.subject_id || ""));
      try {
        await client.rows("srs_cards", {}, {
          method: "POST",
          prefer: "return=representation",
          body: {
            user_id: client.userId,
            source_type: "question",
            source_id: id,
            front: String(question.text || ""),
            back: String(question.answer || ""),
            subject_id: question.subject_id || null,
            subject_slug: subject?.slug || subjectSlug,
            topic: question.topic || null,
            ease: 2.5,
            interval: 0,
            reps: 0,
            due_at: new Date().toISOString(),
          },
        });
        added += 1;
        existing.add(id);
      } catch (error) {
        // A concurrent ensureDeck call may have inserted the same question card.
        if (Number(error?.status) === 409 || error?.code === "23505") continue;
        throw error;
      }
    }
    return { ok: true, data: { added, total: cards.length + added } };
  } catch (error) {
    return restFailure(error);
  }
}

export async function listSrsDueCards(request, env, filters = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const slugResult = normalizeSlug(filters.subject_slug);
  if (!slugResult.ok) return failure(422, "VALIDATION_ERROR", "Некорректный предмет");
  const subjectSlug = slugResult.value;
  const limit = boundedInt(filters.limit, 20, 1, 50);
  const scope = String(filters.scope || "");
  try {
    const rows = await cardsForUser(client, 2000);
    const now = Math.floor(Date.now() / 1000);
    const due = rows.filter((card) => {
      if (scope === "shared" && card.source_type !== "question") return false;
      if (scope === "personal" && card.source_type !== "personal") return false;
      if (subjectSlug && String(card.subject_slug || "") !== subjectSlug) return false;
      return cardTime(card.due_at, 0) <= now;
    }).map((card) => formatCard(card, now)).sort((a, b) => a.due_at - b.due_at);
    return { ok: true, data: { items: due.slice(0, limit), count: Math.min(due.length, limit) } };
  } catch (error) {
    return restFailure(error);
  }
}

export async function listSrsCards(request, env, filters = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const slugResult = normalizeSlug(filters.subject_slug);
  if (!slugResult.ok) return failure(422, "VALIDATION_ERROR", "Некорректный предмет");
  const subjectSlug = slugResult.value;
  const limit = boundedInt(filters.limit, 100, 1, 200);
  const scope = String(filters.scope || "");
  try {
    const rows = await cardsForUser(client, 2000);
    const now = Math.floor(Date.now() / 1000);
    const cards = rows.filter((card) => {
      if (scope === "shared" && card.source_type !== "question") return false;
      if (scope === "personal" && card.source_type !== "personal") return false;
      if (subjectSlug && String(card.subject_slug || "") !== subjectSlug) return false;
      return true;
    }).map((card) => formatCard(card, now)).sort((a, b) => a.due_at - b.due_at);
    return { ok: true, data: { items: cards.slice(0, limit), count: Math.min(cards.length, limit) } };
  } catch (error) {
    return restFailure(error);
  }
}

export async function addSrsCard(request, env, input = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const front = typeof body.front === "string" ? body.front.trim() : "";
  const back = typeof body.back === "string" ? body.back.trim() : "";
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const slugResult = normalizeSlug(body.subject_slug);
  if (!slugResult.ok) return failure(422, "VALIDATION_ERROR", "Некорректный предмет");
  const subjectSlug = slugResult.value || "";
  if (!front) return failure(422, "VALIDATION_ERROR", "front обязателен");
  if (front.length > 10_000 || back.length > 10_000 || topic.length > 200) {
    return failure(422, "VALIDATION_ERROR", "Текст карточки слишком длинный");
  }

  let subjectId = null;
  let subjectName = subjectSlug;
  try {
    if (subjectSlug) {
      const subjects = await client.rows("subjects", {
        slug: "eq." + subjectSlug,
        is_active: "eq.true",
        select: "id,name,slug",
        limit: "1",
      });
      subjectId = subjects[0]?.id || null;
      subjectName = String(subjects[0]?.name || subjectSlug);
    }
    const inserted = await client.rows("srs_cards", {}, {
      method: "POST",
      prefer: "return=representation",
      body: {
        user_id: client.userId,
        source_type: "personal",
        front,
        back,
        subject_id: subjectId,
        subject_slug: subjectSlug || null,
        topic: topic || null,
        ease: 2.5,
        interval: 0,
        reps: 0,
        due_at: new Date().toISOString(),
      },
    });
    const card = inserted[0];
    if (!card) return failure(503, "SRS_WRITE_UNCONFIRMED", "Не удалось подтвердить сохранение карточки");
    return { ok: true, status: 201, data: { card: formatCard({ ...card, subject_name: subjectName }) } };
  } catch (error) {
    return restFailure(error);
  }
}

export async function reviewSrsCard(request, env, input = {}, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const cardId = String(body.card_id || body.id || "").trim();
  const rating = boundedInt(body.rating, 0, 0, 5);
  if (!UUID.test(cardId)) return failure(422, "VALIDATION_ERROR", "card_id должен быть UUID");
  if (rating < 1 || rating > 4) return failure(422, "VALIDATION_ERROR", "rating должен быть от 1 до 4");

  try {
    const rows = await client.rows("srs_cards", {
      id: "eq." + cardId,
      user_id: "eq." + client.userId,
      select: CARD_FIELDS,
      limit: "1",
    });
    if (!rows[0]) return failure(404, "NOT_FOUND", "Карточка не найдена");
    const row = rows[0];
    let ease = Number(row.ease ?? 2.5);
    let interval = Number.parseInt(String(row.interval ?? 0), 10) || 0;
    let reps = Number.parseInt(String(row.reps ?? 0), 10) || 0;

    if (rating === 1) {
      reps = 0;
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
    } else if (rating === 2) {
      reps += 1;
      interval = Math.max(1, Math.ceil(Math.max(1, interval) * 1.4));
      ease = Math.max(1.3, ease - 0.05);
    } else if (rating === 3) {
      reps += 1;
      interval = interval > 0 ? Math.max(1, Math.ceil(interval * ease)) : 1;
    } else {
      reps += 1;
      interval = interval > 0 ? Math.max(1, Math.ceil(interval * ease * 1.3)) : 2;
      ease = Math.min(3.2, ease + 0.15);
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + interval * 86_400_000).toISOString();
    const reviewedAt = now.toISOString();
    const updated = await client.rows("srs_cards", {
      id: "eq." + cardId,
      user_id: "eq." + client.userId,
    }, {
      method: "PATCH",
      prefer: "return=representation",
      body: { ease, interval, reps, due_at: dueAt, reviewed_at: reviewedAt, updated_at: reviewedAt },
    });
    const updatedCard = updated[0] || { ...row, ease, interval, reps, due_at: dueAt, reviewed_at: reviewedAt };
    let summary = null;
    let summaryDegraded = false;
    try {
      summary = await summaryForUser(client);
    } catch {
      // Do not report a mutation failure after the review itself has been persisted.
      summaryDegraded = true;
    }
    return {
      ok: true,
      data: {
        card: formatCard(updatedCard),
        summary,
        ...(summaryDegraded ? { summary_degraded: true } : {}),
      },
    };
  } catch (error) {
    return restFailure(error);
  }
}

export async function deleteSrsCard(request, env, cardId, fetcher = fetch) {
  const client = await createClient(request, env, fetcher);
  if (!client.ok) return client;
  const id = String(cardId || "").trim();
  if (!UUID.test(id)) return failure(422, "VALIDATION_ERROR", "Некорректный идентификатор карточки");
  try {
    const removed = await client.rows("srs_cards", {
      id: "eq." + id,
      user_id: "eq." + client.userId,
      select: "id",
    }, {
      method: "DELETE",
      prefer: "return=representation",
    });
    if (!removed.length) return failure(404, "NOT_FOUND", "Карточка не найдена");
    return { ok: true, data: { deleted: true } };
  } catch (error) {
    return restFailure(error);
  }
}
