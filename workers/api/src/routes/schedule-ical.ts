/**
 * Персональный iCal-фид → личные события студента.
 *
 * Учебное расписание (schedule_entries) привязано к группе и меняется только
 * администратором, поэтому импорт из календаря живёт в отдельной user-scoped
 * таблице user_calendar_events. Синхронизация обновляет время/место и никогда
 * не перезаписывает уже привязанную тему.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { contentHash, matchByTitle, parseIcal, splitTitle, type IcalEvent } from "../lib/ical";

const ical = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 512 * 1024;
const MAX_EVENTS = 500;

type SubjectRow = { id: string; name: string; slug: string | null };
type TopicRow = { id: string; title: string; module_id: string; modules: { subject_id: string } | Array<{ subject_id: string }> | null };

const relation = (value: any) => (Array.isArray(value) ? value[0] : value);

/** Отсекаем SSRF: только http(s) и только публичные хосты. */
function assertPublicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  if (host === "169.254.169.254" || host === "::1" || host === "[::1]") return null;
  return url;
}

async function fetchFeed(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.5", "user-agent": "medbiohim-ical/1.0" },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`feed responded ${response.status}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !/calendar|text\/plain|octet-stream/.test(contentType)) {
      throw new Error(`unexpected content-type: ${contentType.slice(0, 60)}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadSubjects(db: any): Promise<SubjectRow[]> {
  const { data } = await db.from("subjects").select("id,name,slug").eq("is_active", true).limit(200);
  return Array.isArray(data) ? data : [];
}

async function loadTopicsBySubject(db: any): Promise<Map<string, TopicRow[]>> {
  const { data, error } = await db
    .from("topics")
    .select("id,title,module_id,modules!inner(subject_id)")
    .limit(2000);
  const grouped = new Map<string, TopicRow[]>();
  if (error || !Array.isArray(data)) return grouped;
  for (const topic of data) {
    const subjectId = String(relation(topic.modules)?.subject_id || "");
    if (!subjectId) continue;
    const bucket = grouped.get(subjectId) || [];
    bucket.push({ id: topic.id, title: topic.title, module_id: topic.module_id, modules: topic.modules });
    grouped.set(subjectId, bucket);
  }
  return grouped;
}

ical.get("/ical", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const from = c.req.query("from") || "";
  const to = c.req.query("to") || "";
  if ((from && !YMD.test(from)) || (to && !YMD.test(to))) {
    const { body, status } = fail("VALIDATION_ERROR", "from/to должны быть датами YYYY-MM-DD", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    let query = db
      .from("user_calendar_events")
      .select("id,external_id,title,subject_id,topic_id,starts_at,ends_at,location,description,source,source_url,synced_at")
      .eq("user_id", user.id)
      .order("starts_at", { ascending: true })
      .limit(300);
    if (from) query = query.gte("starts_at", `${from}T00:00:00`);
    if (to) query = query.lte("starts_at", `${to}T23:59:59`);
    const { data, error } = await query;
    if (error) throw error;
    return c.json(ok({ items: data || [], source: "supabase" }, rid));
  } catch (error) {
    console.error("[schedule:ical:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Личные события временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

ical.post("/ical", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");

  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }

  const text = typeof payload?.text === "string" ? payload.text : "";
  const rawUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
  const dryRun = payload?.dry_run === true;

  if ((text && rawUrl) || (!text && !rawUrl)) {
    const { body, status } = fail("VALIDATION_ERROR", "Передайте либо text, либо url", 422, rid);
    return c.json(body, status as 422);
  }
  if (text.length > MAX_TEXT) {
    const { body, status } = fail("PAYLOAD_TOO_LARGE", "Календарь слишком большой", 413, rid);
    return c.json(body, status as 413);
  }

  let feedUrl: URL | null = null;
  if (rawUrl) {
    feedUrl = assertPublicUrl(rawUrl);
    if (!feedUrl) {
      const { body, status } = fail("INVALID_URL", "Ссылка на календарь должна быть публичным http(s)-адресом", 422, rid);
      return c.json(body, status as 422);
    }
  }

  try {
    const sourceText = feedUrl ? await fetchFeed(feedUrl) : text;
    const events: IcalEvent[] = parseIcal(sourceText).slice(0, MAX_EVENTS);
    if (!events.length) {
      const { body, status } = fail("NO_EVENTS", "В календаре не нашлось ни одного события с датой и названием", 422, rid);
      return c.json(body, status as 422);
    }

    const subjects = await loadSubjects(db);
    const topicsBySubject = await loadTopicsBySubject(db);

    const prepared = events.map((event) => {
      const title = splitTitle(event.summary);
      const subjectMatch = matchByTitle(title.subject || event.summary, subjects, (subject) => subject.name, 0.55);
      const subject = subjectMatch?.item || null;
      const topicCandidates = subject ? topicsBySubject.get(subject.id) || [] : [];
      const topicMatch = title.topic
        ? matchByTitle(title.topic, topicCandidates, (topic) => topic.title, 0.55)
        : null;
      return {
        event,
        title,
        subjectId: subject?.id || null,
        subjectName: subject?.name || null,
        topicId: topicMatch?.item.id || null,
        topicTitle: topicMatch?.item.title || null,
        hash: contentHash([event.summary, event.location, event.startsAt, event.endsAt, event.description]),
      };
    });

    const externalIds = prepared.map((item) => item.event.uid);
    const existingByUid = new Map<string, { id: string; content_hash: string }>();
    for (let index = 0; index < externalIds.length; index += 100) {
      const chunk = externalIds.slice(index, index + 100);
      const { data, error } = await db
        .from("user_calendar_events")
        .select("id,external_id,content_hash")
        .eq("user_id", user.id)
        .in("external_id", chunk);
      if (error) throw error;
      for (const row of data || []) existingByUid.set(String(row.external_id), row);
    }

    const incoming: any[] = [];
    const touched: any[] = [];
    for (const item of prepared) {
      const base = {
        user_id: user.id,
        external_id: item.event.uid,
        title: item.event.summary.slice(0, 500),
        starts_at: item.event.startsAt,
        ends_at: item.event.endsAt,
        location: item.event.location ? item.event.location.slice(0, 300) : null,
        description: item.event.description ? item.event.description.slice(0, 4000) : null,
        source: "ical" as const,
        source_url: feedUrl ? feedUrl.toString() : null,
        content_hash: item.hash,
        synced_at: new Date().toISOString(),
      };
      const existing = existingByUid.get(item.event.uid);
      if (existing) {
        if (existing.content_hash !== item.hash) touched.push(base);
      } else {
        incoming.push({ ...base, subject_id: item.subjectId, topic_id: item.topicId });
      }
    }

    if (!dryRun) {
      if (incoming.length) {
        const { error } = await db
          .from("user_calendar_events")
          .upsert(incoming, { onConflict: "user_id,external_id" });
        if (error) throw error;
      }
      if (touched.length) {
        // Без subject_id/topic_id: ручная привязка темы должна пережить синхронизацию.
        const { error } = await db
          .from("user_calendar_events")
          .upsert(touched, { onConflict: "user_id,external_id" });
        if (error) throw error;
      }
    }

    return c.json(
      ok(
        {
          dry_run: dryRun,
          totals: {
            events: prepared.length,
            imported: incoming.length,
            updated: touched.length,
            skipped: prepared.length - incoming.length - touched.length,
            with_subject: prepared.filter((item) => item.subjectId).length,
            with_topic: prepared.filter((item) => item.topicId).length,
          },
          preview: prepared.slice(0, 20).map((item) => ({
            uid: item.event.uid,
            title: item.event.summary,
            subject: item.subjectName,
            topic: item.topicTitle,
            starts_at: item.event.startsAt,
            ends_at: item.event.endsAt,
            location: item.event.location,
          })),
        },
        rid
      )
    );
  } catch (error) {
    console.error("[schedule:ical:import]", error);
    const { body, status } = fail("ICAL_UNAVAILABLE", "Не удалось прочитать календарь", 502, rid);
    return c.json(body, status as 502);
  }
});

ical.delete("/ical/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID события", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await db
      .from("user_calendar_events")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    if (!data?.length) {
      const { body, status } = fail("NOT_FOUND", "Событие не найдено", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ deleted: id }, rid));
  } catch (error) {
    console.error("[schedule:ical:delete]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить событие", 503, rid);
    return c.json(body, status as 503);
  }
});

export default ical;
