import { PREP_KINDS, MAX_TOPICS } from "./constants";
import type { PrepTopic, PrepReadiness, EventRow, ProgressRow } from "./types";
import { isoToday, diffDays, clampPercent } from "./dates";
import { averageMastery } from "./topics";

/**
 * Готовность к аттестационным событиям — один батч на все события /academic/state.
 * Возвращает Map по id события; события без id и не аттестационные пропускаются.
 */
export async function prepReadinessForEvents(
  supabase: any,
  events: EventRow[],
  progress: ProgressRow[],
  /** План подготовки строится по любому событию, готовность в сводке — только по аттестациям. */
  options: { includeAllKinds?: boolean } = {},
): Promise<Map<string, PrepReadiness>> {
  const result = new Map<string, PrepReadiness>();
  const today = isoToday();
  const candidates = (events || []).filter(
    (event) => event?.id && event.date
      && (options.includeAllKinds || PREP_KINDS.has(String(event.event_kind || ""))),
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

  // Дата предыдущей аттестации того же предмета: коллоквиум/КР обычно покрывают
  // материал после прошлой контрольной точки, а не весь семестр — окно тем
  // сужается с «всё до даты события» до «после прошлой аттестации».
  const prevControlDateBySubject = new Map<string, string>();
  if (subjectIds.length) {
    const { data: prevEvents, error: prevError } = await supabase
      .from("schedule_entries")
      .select("subject_id,date")
      .in("subject_id", subjectIds)
      .in("event_kind", [...PREP_KINDS])
      .not("date", "is", null)
      .lt("date", today)
      .order("date", { ascending: false })
      .limit(200);
    if (prevError) console.warn("[study-prep:prev-controls]", prevError.message);
    for (const row of prevEvents || []) {
      const subjectId = String(row?.subject_id || "");
      const date = String(row?.date || "");
      // Наиболее свежая прошлая аттестация предмета.
      if (subjectId && date && !prevControlDateBySubject.has(subjectId)) {
        prevControlDateBySubject.set(subjectId, date);
      }
    }
  }

  for (const event of candidates) {
    const id = String(event.id);
    const eventDate = String(event.date);
    const subjectId = event.subject_id ? String(event.subject_id) : "";
    const fromPlan = subjectId ? planTopicsBySubject.get(subjectId) || [] : [];
    // Темы, пройденные к дате события (по плану предмета — сверху ближайшие).
    // Узкое окно «после прошлой аттестации» применяется, только если в нём есть
    // темы: пустое окно (нет curriculum-строк после прошлой КР) откатывается к
    // прежнему поведению, чтобы план подготовки не опустел.
    const prevDate = prevControlDateBySubject.get(subjectId || "");
    const narrowed = prevDate ? fromPlan.filter((entry) => entry.date > prevDate && entry.date <= eventDate) : [];
    const relevant = narrowed.length ? narrowed : fromPlan.filter((entry) => entry.date <= eventDate);

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
      // Если ни по одной теме события нет строки прогресса, процент не измерен:
      // отдаём null, чтобы UI не писал «готовность 0%» про неизвестное.
      mastery_pct: topics.some((topic) => topic.topic_id && percentByTopic.has(topic.topic_id))
        ? averageMastery(topics)
        : null,
      topics,
      source,
    });
  }

  return result;
}

/** Раскладка тем по дням до события + финальный прогон накануне. */
