/**
 * Фаза 1 дорожной карты (docs/AI-STUDY-ROADMAP.md §2.1): «готовность к событию»
 * и план подготовки по дням.
 *
 * Связь «событие → темы» строится детерминированно, без LLM:
 *   schedule_entries(date, event_kind, subject_id)
 *     → curriculum_items.topic_id (темы, пройденные к дате события)
 *     → user_topic_progress.percent (освоенность темы)
 *   нет тем в плане → темы предмета из topics/modules (сначала непройденные).
 *
 * Готовность = среднее percent по темам события. План раскладывает темы по дням
 * (по возрастанию освоенности) и ставит финальный прогон накануне события.
 * «Почему» у шага — правило по освоенности, а не текст модели: так план не
 * зависит от доступности ИИ, не тратит квоты и воспроизводим в тестах.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const studyPrep = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** События, к которым имеет смысл готовиться по темам предмета. */
export const PREP_KINDS = new Set(["exam", "credit", "colloquium", "control_work", "assessment"]);

/** Сколько тем максимум берём в план по одному событию. */
const MAX_TOPICS = 8;
/** Сколько тем разбираем за один учебный день. */
const TOPICS_PER_DAY = 2;
/** Порог освоенности темы: ниже — добавляем тест. */
const WEAK_PERCENT = 70;

export type PrepTopic = { topic_id: string | null; title: string; mastery_pct: number };
export type PrepItem = { kind: string; title: string; href: string; why: string; done: boolean };
export type PrepDay = { date: string; label: string; items: PrepItem[] };

export type PrepReadiness = {
  subject_slug: string | null;
  subject_name: string | null;
  event_date: string | null;
  days_left: number | null;
  mastery_pct: number;
  topics: PrepTopic[];
  source: "curriculum" | "progress" | "none";
};

type EventRow = {
  id?: string | null;
  date?: string | null;
  event_kind?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
};

type ProgressRow = {
  topic_id?: string;
  percent?: number | null;
  topic_name?: string | null;
  subject_id?: string | null;
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const at = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(at)) return iso;
  return new Date(at + days * 86400000).toISOString().slice(0, 10);
}

function diffDays(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIso + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function fmtDay(iso: string): string {
  return iso.split("-").reverse().join(".");
}

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Почему шаг стоит в плане — правило по освоенности темы. */
function masteryWhy(mastery: number): string {
  if (mastery <= 0) return "тема ещё не начата — начните с лекции и конспекта";
  if (mastery < 40) return `освоено ${mastery}% — база не сформирована, нужен разбор с начала`;
  if (mastery < WEAK_PERCENT) return `освоено ${mastery}% — знаний хватает на узнавание, не на ответ`;
  return `освоено ${mastery}% — короткое повторение перед событием`;
}

function averageMastery(topics: PrepTopic[]): number {
  if (!topics.length) return 0;
  return Math.round(topics.reduce((sum, topic) => sum + topic.mastery_pct, 0) / topics.length);
}

function studyHref(subjectSlug: string | null, tab: string): string {
  if (!subjectSlug) return "/study";
  return `/subjects/${encodeURIComponent(subjectSlug)}?tab=${tab}`;
}

/**
 * Готовность к аттестационным событиям — один батч на все события /academic/state.
 * Возвращает Map по id события; события без id и не аттестационные пропускаются.
 */
export async function prepReadinessForEvents(
  supabase: any,
  events: EventRow[],
  progress: ProgressRow[],
): Promise<Map<string, PrepReadiness>> {
  const result = new Map<string, PrepReadiness>();
  const today = isoToday();
  const candidates = (events || []).filter(
    (event) => event?.id && event.date && PREP_KINDS.has(String(event.event_kind || "")),
  );
  if (!candidates.length) return result;

  const subjectIds = [...new Set(candidates.map((event) => event.subject_id).filter(Boolean) as string[])];

  // slug предмета — для ссылок на план предмета.
  const slugById = new Map<string, string>();
  const nameById = new Map<string, string>();
  if (subjectIds.length) {
    const { data: subjects, error } = await supabase
      .from("subjects")
      .select("id,slug,name")
      .in("id", subjectIds)
      .limit(200);
    if (error) console.warn("[study-prep:subjects]", error.message);
    for (const subject of subjects || []) {
      if (subject?.id) {
        slugById.set(String(subject.id), String(subject.slug || ""));
        nameById.set(String(subject.id), String(subject.name || ""));
      }
    }
  }

  // Освоенность: user_topic_progress уже загружен вызывающим кодом.
  const percentByTopic = new Map<string, number>();
  const titleByTopic = new Map<string, string>();
  for (const row of progress || []) {
    if (!row?.topic_id) continue;
    percentByTopic.set(String(row.topic_id), clampPercent(row.percent));
    if (row.topic_name) titleByTopic.set(String(row.topic_id), String(row.topic_name));
  }

  // Темы плана предмета, пройденные к самой поздней дате события.
  const latest = candidates.map((event) => String(event.date)).sort().at(-1) as string;
  const planTopicsBySubject = new Map<string, Array<{ topic_id: string; title: string; date: string }>>();
  if (subjectIds.length) {
    const { data: items, error } = await supabase
      .from("curriculum_items")
      .select("subject_id,topic_id,title,planned_date,item_type")
      .in("subject_id", subjectIds)
      .eq("is_active", true)
      .not("planned_date", "is", null)
      .not("topic_id", "is", null)
      .lte("planned_date", latest)
      .order("planned_date", { ascending: false })
      .limit(600);
    if (error) console.warn("[study-prep:curriculum]", error.message);
    for (const item of items || []) {
      const subjectId = String(item?.subject_id || "");
      const topicId = String(item?.topic_id || "");
      if (!subjectId || !topicId) continue;
      const bucket = planTopicsBySubject.get(subjectId) || [];
      if (bucket.some((entry) => entry.topic_id === topicId)) continue;
      bucket.push({ topic_id: topicId, title: String(item.title || titleByTopic.get(topicId) || "Тема"), date: String(item.planned_date || "") });
      planTopicsBySubject.set(subjectId, bucket);
    }
  }

  // Запасной источник: темы предмета из справочника (modules → topics).
  const topicsBySubject = new Map<string, Array<{ id: string; title: string }>>();
  if (subjectIds.length) {
    const { data: modules, error: modulesError } = await supabase
      .from("modules")
      .select("id,subject_id")
      .in("subject_id", subjectIds)
      .limit(400);
    if (modulesError) console.warn("[study-prep:modules]", modulesError.message);
    const subjectByModule = new Map<string, string>();
    for (const subjectModule of modules || []) {
      if (subjectModule?.id && subjectModule?.subject_id) {
        subjectByModule.set(String(subjectModule.id), String(subjectModule.subject_id));
      }
    }
    const moduleIds = [...subjectByModule.keys()];
    if (moduleIds.length) {
      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("id,title,module_id")
        .in("module_id", moduleIds)
        .limit(600);
      if (topicsError) console.warn("[study-prep:topics]", topicsError.message);
      for (const topic of topics || []) {
        const subjectId = subjectByModule.get(String(topic?.module_id || ""));
        if (!subjectId || !topic?.id) continue;
        const bucket = topicsBySubject.get(subjectId) || [];
        bucket.push({ id: String(topic.id), title: String(topic.title || "Тема") });
        topicsBySubject.set(subjectId, bucket);
      }
    }
  }

  for (const event of candidates) {
    const id = String(event.id);
    const eventDate = String(event.date);
    const subjectId = event.subject_id ? String(event.subject_id) : "";
    const fromPlan = subjectId ? planTopicsBySubject.get(subjectId) || [] : [];
    // Темы, пройденные к дате события (по плану предмета — сверху ближайшие).
    const relevant = fromPlan.filter((entry) => entry.date <= eventDate);

    let topics: PrepTopic[] = [];
    let source: PrepReadiness["source"] = "none";
    if (relevant.length) {
      source = "curriculum";
      topics = relevant.slice(0, MAX_TOPICS).map((entry) => ({
        topic_id: entry.topic_id,
        title: entry.title,
        mastery_pct: percentByTopic.get(entry.topic_id) ?? 0,
      }));
    }

    if (topics.length < 2) {
      const fromCatalog = subjectId ? topicsBySubject.get(subjectId) || [] : [];
      const merged = new Map<string, PrepTopic>();
      for (const topic of topics) merged.set(topic.topic_id || topic.title, topic);
      for (const topic of fromCatalog) {
        if (merged.has(topic.id)) continue;
        merged.set(topic.id, {
          topic_id: topic.id,
          title: titleByTopic.get(topic.id) || topic.title,
          mastery_pct: percentByTopic.get(topic.id) ?? 0,
        });
      }
      if (merged.size > topics.length) {
        source = topics.length ? "curriculum" : "progress";
        topics = [...merged.values()].slice(0, MAX_TOPICS);
      }
    }

    result.set(id, {
      subject_slug: subjectId ? slugById.get(subjectId) || null : null,
      subject_name: String(event.subject_name || (subjectId ? nameById.get(subjectId) : "") || "") || null,
      event_date: eventDate,
      days_left: Math.max(0, diffDays(today, eventDate)),
      mastery_pct: averageMastery(topics),
      topics,
      source,
    });
  }

  return result;
}

/** Раскладка тем по дням до события + финальный прогон накануне. */
export function buildPlanDays(input: {
  topics: PrepTopic[];
  today: string;
  eventDate: string;
  subjectSlug: string | null;
  readiness: number;
}): PrepDay[] {
  const { topics, today, eventDate, subjectSlug, readiness } = input;
  const days: PrepDay[] = [];
  const planHref = studyHref(subjectSlug, "plan");
  const ordered = [...topics].sort((a, b) => a.mastery_pct - b.mastery_pct || a.title.localeCompare(b.title));

  const left = diffDays(today, eventDate);
  // Финальный прогон — вечер накануне; если событие уже завтра или сегодня, прогон сегодня.
  const rehearsal = left >= 2 ? addDays(eventDate, -1) : today;
  const teachEnd = addDays(rehearsal, -1);

  const teachDays: string[] = [];
  for (let cursor = today; diffDays(cursor, teachEnd) >= 0; cursor = addDays(cursor, 1)) {
    teachDays.push(cursor);
    if (teachDays.length >= 14) break;
  }

  const neededDays = Math.max(1, Math.ceil(ordered.length / TOPICS_PER_DAY));
  const slots: string[] = [];
  if (teachDays.length && ordered.length) {
    const count = Math.min(neededDays, teachDays.length);
    for (let index = 0; index < count; index += 1) {
      const position = count === 1 ? 0 : Math.round((index * (teachDays.length - 1)) / (count - 1));
      const date = teachDays[position];
      if (!slots.includes(date)) slots.push(date);
    }
  }

  slots.forEach((date, slotIndex) => {
    const chunk = ordered.slice(slotIndex * TOPICS_PER_DAY, slotIndex * TOPICS_PER_DAY + TOPICS_PER_DAY);
    const items: PrepItem[] = [];
    if (!chunk.length) {
      items.push({
        kind: "plan",
        title: "Свериться с планом предмета и выписать темы события",
        href: planHref,
        why: "по плану предмета темы с идентификаторами не нашлись — темы нужно уточнить вручную",
        done: false,
      });
    }
    for (const topic of chunk) {
      items.push({
        kind: "plan",
        title: `Разобрать по плану: ${topic.title}`,
        href: planHref,
        why: masteryWhy(topic.mastery_pct),
        done: false,
      });
      items.push({
        kind: "cards",
        title: `Собрать пак карточек по теме «${topic.title}»`,
        href: "/cards",
        why: "карточки дают активное повторение вместо перечитывания",
        done: false,
      });
      if (topic.mastery_pct < WEAK_PERCENT) {
        items.push({
          kind: "test",
          title: `Пройти тест по теме «${topic.title}»`,
          href: "/tests",
          why: `освоено ${topic.mastery_pct}% — тест покажет реальные пробелы`,
          done: false,
        });
      }
    }
    days.push({
      date,
      label: `День ${slotIndex + 1} из ${slots.length} · ${fmtDay(date)}`,
      items,
    });
  });

  const rehearsalItems: PrepItem[] = [
    {
      kind: "srs",
      title: "Прогнать все повторения по темам события",
      href: "/cards",
      why: "финальный прогон накануне: короткие повторения дают больше, чем новый материал",
      done: false,
    },
    {
      kind: "test",
      title: ordered.length
        ? `Пробный тест по всем темам: ${ordered.map((topic) => topic.title).slice(0, 4).join(", ")}`
        : "Пробный тест по предмету",
      href: "/tests",
      why: "проверка под формат события: видно, что ещё не отвечается",
      done: false,
    },
  ];
  if (ordered.length && readiness < WEAK_PERCENT) {
    const weakest = ordered[0];
    rehearsalItems.push({
      kind: "plan",
      title: `Перечитать конспект: ${weakest.title}`,
      href: planHref,
      why: `самая слабая тема события — ${weakest.mastery_pct}%`,
      done: false,
    });
  }
  days.push({
    date: rehearsal,
    label: `Финальный прогон · ${fmtDay(rehearsal)}`,
    items: rehearsalItems,
  });

  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function isMissingTable(error: any): boolean {
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205";
}

/** Событие расписания своей группы: дата, тип и предмет для плана. */
async function loadEvent(supabase: any, userId: string, entryId: string) {
  const { data, error } = await supabase
    .from("schedule_entries")
    .select("id,date,event_kind,subject_id,subject_name,schedule_id,schedules!inner(group_id,is_active)")
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const schedule = Array.isArray(data.schedules) ? data.schedules[0] : data.schedules;
  if (schedule?.is_active === false) return null;
  if (schedule?.group_id) {
    const { data: membership } = await supabase
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", userId)
      .eq("group_id", schedule.group_id)
      .eq("is_active", true)
      .limit(1);
    if (!membership?.length) return null;
  }
  return data as EventRow & { schedule_id?: string | null };
}

async function loadProgress(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_topic_progress")
    .select("topic_id,percent,status,topics(title,modules(subject_id))")
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false })
    .limit(500);
  if (error) console.warn("[study-prep:progress]", error.message);
  return (data || []).map((row: any) => {
    const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
    const topicModule = Array.isArray(topic?.modules) ? topic.modules[0] : topic?.modules;
    return {
      topic_id: row.topic_id,
      percent: row.percent,
      topic_name: topic?.title || "",
      subject_id: topicModule?.subject_id ?? null,
    } satisfies ProgressRow;
  });
}

function planPayload(plan: any, persisted: boolean, notice?: string) {
  return {
    plan,
    persisted,
    ...(notice ? { service_notice: notice } : {}),
  };
}

// GET /study-prep/plan?event=<schedule_entry_id> — сохранённый план или предпросмотр.
studyPrep.get("/plan", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const eventId = String(c.req.query("event") || "").trim();
  if (!UUID.test(eventId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужен параметр event (id события расписания)", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const event = await loadEvent(db, user.id, eventId);
    if (!event) {
      const { body, status } = fail("EVENT_NOT_FOUND", "Событие не найдено в расписании вашей группы", 404, rid);
      return c.json(body, status as 404);
    }
    const { data: saved, error } = await db
      .from("study_plans")
      .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at")
      .eq("user_id", user.id)
      .eq("schedule_entry_id", eventId)
      .eq("status", "active")
      .maybeSingle();
    if (!error && saved) return c.json(ok(planPayload(saved, true), rid));

    // Предпросмотр: правила без сохранения (в т.ч. пока миграция не применена).
    const progress = await loadProgress(db, user.id);
    const readiness = await prepReadinessForEvents(db, [event], progress);
    const prep = readiness.get(eventId);
    const topics = prep?.topics ?? [];
    const mastery = prep?.mastery_pct ?? 0;
    const days = buildPlanDays({
      topics,
      today: isoToday(),
      eventDate: String(event.date),
      subjectSlug: prep?.subject_slug ?? null,
      readiness: mastery,
    });
    const preview = {
      id: null,
      schedule_entry_id: eventId,
      subject_slug: prep?.subject_slug ?? null,
      event_kind: String(event.event_kind || "colloquium"),
      event_date: String(event.date),
      days,
      topics,
      mastery_pct: mastery,
      status: "active",
      generated_by: "rules",
    };
    const notice = error && isMissingTable(error) ? "План пока не сохраняется: миграция study_plans не применена." : undefined;
    return c.json(ok(planPayload(preview, false, notice), rid));
  } catch (error) {
    console.error("[study-prep:get]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось загрузить план подготовки", 503, rid);
    return c.json(body, status as 503);
  }
});

// POST /study-prep/plan {schedule_entry_id} — создать или пересобрать план (идемпотентно).
studyPrep.post("/plan", requireAuth, async (c) => {
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
  const eventId = String(payload?.schedule_entry_id || "").trim();
  if (!UUID.test(eventId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужен schedule_entry_id", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const event = await loadEvent(db, user.id, eventId);
    if (!event) {
      const { body, status } = fail("EVENT_NOT_FOUND", "Событие не найдено в расписании вашей группы", 404, rid);
      return c.json(body, status as 404);
    }
    const progress = await loadProgress(db, user.id);
    const readiness = await prepReadinessForEvents(db, [event], progress);
    const prep = readiness.get(eventId);
    const topics = prep?.topics ?? [];
    const mastery = prep?.mastery_pct ?? 0;
    const days = buildPlanDays({
      topics,
      today: isoToday(),
      eventDate: String(event.date),
      subjectSlug: prep?.subject_slug ?? null,
      readiness: mastery,
    });
    const { data: existing, error: existingError } = await db
      .from("study_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("schedule_entry_id", eventId)
      .maybeSingle();
    if (existingError) {
      if (isMissingTable(existingError)) {
        return c.json(ok(planPayload({
          id: null, schedule_entry_id: eventId, subject_slug: prep?.subject_slug ?? null,
          event_kind: String(event.event_kind || "colloquium"), event_date: String(event.date),
          days, topics, mastery_pct: mastery, status: "active", generated_by: "rules",
        }, false, "План пока не сохраняется: миграция study_plans не применена."), rid));
      }
      throw existingError;
    }
    const body = {
      user_id: user.id,
      schedule_entry_id: eventId,
      subject_slug: prep?.subject_slug ?? null,
      event_kind: String(event.event_kind || "colloquium"),
      event_date: String(event.date),
      days,
      topics,
      mastery_pct: mastery,
      status: "active",
      generated_by: "rules",
      updated_at: new Date().toISOString(),
    };
    const result = existing?.id
      ? await db.from("study_plans").update(body).eq("id", existing.id).eq("user_id", user.id)
          .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at").maybeSingle()
      : await db.from("study_plans").insert(body)
          .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at").maybeSingle();
    if (result.error) throw result.error;
    return c.json(ok(planPayload(result.data, true), rid), existing?.id ? 200 : 201);
  } catch (error) {
    console.error("[study-prep:create]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось собрать план подготовки", 503, rid);
    return c.json(body, status as 503);
  }
});

// PATCH /study-prep/plan/:id {day, index, done} — отметка шага.
studyPrep.patch("/plan/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const planId = String(c.req.param("id") || "").trim();
  if (!UUID.test(planId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный id плана", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const day = String(payload?.day || "").trim();
  const index = Number(payload?.index);
  const done = payload?.done === true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(index) || index < 0) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны day (yyyy-mm-dd) и index шага", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: plan, error } = await db
      .from("study_plans")
      .select("id,days,status")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!plan) {
      const { body, status } = fail("PLAN_NOT_FOUND", "План не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const days = Array.isArray(plan.days) ? plan.days : [];
    const target = days.find((entry: any) => String(entry?.date || "") === day);
    if (!target || !Array.isArray(target.items) || !target.items[index]) {
      const { body, status } = fail("VALIDATION_ERROR", "Шаг плана не найден", 422, rid);
      return c.json(body, status as 422);
    }
    target.items[index].done = done;
    const everyDone = days.every((entry: any) =>
      Array.isArray(entry?.items) ? entry.items.every((item: any) => item?.done === true) : true);
    const { data: updated, error: updateError } = await db
      .from("study_plans")
      .update({ days, status: everyDone ? "completed" : "active", updated_at: new Date().toISOString() })
      .eq("id", planId)
      .eq("user_id", user.id)
      .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at")
      .maybeSingle();
    if (updateError) throw updateError;
    return c.json(ok(planPayload(updated, true), rid));
  } catch (error) {
    console.error("[study-prep:patch]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось обновить план", 503, rid);
    return c.json(body, status as 503);
  }
});

// POST /study-prep/plan/:id/compress — сжать повторения под дату события (Фаза 6).
// Карточки предмета с due_at позже дня накануне события становятся доступны раньше.
// Только сдвиг вперёд по времени (раньше), никогда не отложить: SRS-расписание
// не должно ухудшаться.
studyPrep.post("/plan/:id/compress", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const planId = String(c.req.param("id") || "").trim();
  if (!UUID.test(planId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный id плана", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: plan, error } = await db
      .from("study_plans")
      .select("id,subject_slug,event_date,topics")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!plan) {
      const { body, status } = fail("PLAN_NOT_FOUND", "План не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const subjectSlug = plan.subject_slug ? String(plan.subject_slug) : "";
    const topics = Array.isArray(plan.topics)
      ? (plan.topics as any[]).map((topic) => String(topic?.title || "")).filter(Boolean).slice(0, 20)
      : [];
    if (!subjectSlug && !topics.length) {
      const { body, status } = fail("VALIDATION_ERROR", "В плане нет предмета и тем — сжимать нечего", 422, rid);
      return c.json(body, status as 422);
    }
    const target = new Date(Date.parse(String(plan.event_date) + "T00:00:00Z") - 86400000);
    const targetIso = target.toISOString();
    let query = db
      .from("srs_cards")
      .update({ due_at: targetIso, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .gt("due_at", targetIso);
    query = subjectSlug ? query.eq("subject_slug", subjectSlug) : query.in("topic", topics);
    const { data: moved, error: updateError } = await query.select("id");
    if (updateError) throw updateError;
    return c.json(ok({
      moved: Array.isArray(moved) ? moved.length : 0,
      target_due: targetIso,
      event_date: plan.event_date,
      scope: subjectSlug ? "subject" : "topics",
    }, rid));
  } catch (error) {
    console.error("[study-prep:compress]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось сжать повторения", 503, rid);
    return c.json(body, status as 503);
  }
});

export default studyPrep;
