

// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";
// Корпус «Подготовка к ЦНС» для RAG тьютора (только physiology, вне лекций).

/**
 * Срез учебного контекста для режима «study» (/study): расписание вперёд,
 * несданные ДЗ, слабые темы, долги, SRS-очередь. Собирается по запросу
 * (context_scope) из пользовательского клиента (RLS) и НЕ сохраняется
 * в историю чата. Компактный текст — чтобы не съедать бюджет токенов.
 */
/** Человекочитаемые подписи event_kind для контекста ИИ (см. study/agenda.ts). */
export const STUDY_KIND_LABELS: Record<string, string> = {
  class: "занятие",
  assessment: "аттестация",
  credit: "зачёт",
  exam: "экзамен",
  retake: "пересдача",
  makeup: "отработка",
  colloquium: "коллоквиум",
  control_work: "контрольная",
  consultation: "консультация",
  other: "событие",
};

export function prepLabel(p: unknown): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  const rec = p as { name?: string; title?: string };
  return String(rec.name || rec.title || "");
}

/**
 * Темы предметов из департаментских планов (site_content subject_plan:<slug>)
 * на ближайшие даты — чтобы ИИ-план говорил «что готовить», а не «посетить».
 * Возвращает сгруппированные по предмету строки вида «DD.MM — Лекция: …».
 */
export function subjectPlanLines(planPayload: any, from: string, to: string, limit = 8): string[] {
  const weeks = Array.isArray(planPayload?.weeks) ? planPayload.weeks : [];
  const lines: string[] = [];
  for (const week of weeks) {
    if (lines.length >= limit) break;
    const date = String(week?.date || week?.planned_date || "").slice(0, 10);
    if (!date || date < from || date > to) continue;
    const bits: string[] = [];
    const lecture = String(week?.lecture || "").trim();
    const practice = String(week?.practice || "").trim();
    const lab = String(week?.laboratory || week?.lab || "").trim();
    if (lecture) bits.push(`Лекция: ${lecture}`);
    if (practice) bits.push(`Практика: ${practice}`);
    if (lab) bits.push(`Лабораторная: ${lab}`);
    const preps = (Array.isArray(week?.preparations) ? week.preparations : [])
      .map(prepLabel).filter(Boolean).slice(0, 4);
    if (preps.length) bits.push(`Подготовить: ${preps.join("; ")}`);
    if (!bits.length) continue;
    lines.push(`- ${date}: ${bits.join(" · ")}`);
  }
  return lines;
}

export async function buildStudyContext(supabase: any, userId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const parts: string[] = [];

  // Группы студента — и для расписания, и для ДЗ (раньше расписание не
  // фильтровалось по группе вовсе).
  let groupIds: string[] = [];
  try {
    const { data: memberships } = await supabase
      .from("group_memberships")
      .select("group_id").eq("user_id", userId).eq("is_active", true).limit(10);
    groupIds = (memberships || []).map((m: any) => m.group_id).filter(Boolean);
  } catch { /* без групп — как раньше */ }

  const eventRows: any[] = [];
  const subjectSlugs = new Set<string>();
  try {
    let query = supabase
      .from("schedule_entries")
      .select("date,start_time,event_kind,subject_name,notes,room,subjects(slug),schedules!inner(group_id,is_active)")
      .gte("date", today).lte("date", horizon)
      .order("date", { ascending: true }).limit(24);
    if (groupIds.length) query = query.in("schedules.group_id", groupIds);
    const { data: events } = await query;
    for (const e of (events || [])) {
      const sch = Array.isArray(e.schedules) ? e.schedules[0] : e.schedules;
      if (sch?.is_active === false) continue;
      eventRows.push(e);
      const subj = Array.isArray(e.subjects) ? e.subjects[0] : e.subjects;
      if (subj?.slug) subjectSlugs.add(String(subj.slug));
    }
  } catch { /* расписание необязательно для ответа */ }

  // Планы предметов: темы занятий на горизонт. Ключевые события (коллоквиум,
  // контрольная, зачёт, экзамен) важнее рядовых занятий — их темы поднимаем.
  const planLines: string[] = [];
  if (subjectSlugs.size) {
    try {
      const keys = [...subjectSlugs].map((slug) => `subject_plan:${slug}`);
      const { data: plans } = await supabase
        .from("site_content")
        .select("key,payload").in("key", keys).limit(20);
      for (const row of (plans || [])) {
        const slug = String(row.key || "").replace("subject_plan:", "");
        const lines = subjectPlanLines(row.payload, today, horizon);
        if (lines.length) planLines.push(`Предмет «${slug}»:` + "\n" + lines.join("\n"));
      }
    } catch { /* планы предметов — украшение контекста */ }
  }

  if (eventRows.length) {
    parts.push("Ближайшие события расписания (готовиться к каждому занятию заранее, «просто прийти» — не задача):");
    for (const e of eventRows.slice(0, 14)) {
      const subj = Array.isArray(e.subjects) ? e.subjects[0] : e.subjects;
      const kind = STUDY_KIND_LABELS[String(e.event_kind || "class")] || "занятие";
      const note = String(e.notes || "").trim();
      parts.push(`- ${e.date}${e.start_time ? " " + String(e.start_time).slice(0, 5) : ""}: ${e.subject_name || "Предмет"} — ${kind}${e.room ? ", ауд. " + e.room : ""}${note ? ` · заметка: ${note.slice(0, 120)}` : ""}${subj?.slug ? ` [${subj.slug}]` : ""}`);
    }
  }
  if (planLines.length) {
    parts.push("Темы из планов предметов на ближайшие даты (источник тем для подготовки):");
    parts.push(...planLines);
  }

  try {
    if (groupIds.length) {
      const { data: homeworks } = await supabase
        .from("homeworks")
        .select("id,title,description,due_date,schedule_entry_id,subject_id,subjects(name)")
        .or(groupIds.map((id: string) => `group_id.eq.${id}`).join(",") + ",group_id.is.null")
        .order("due_date", { ascending: true }).limit(40);
      const hwIds = (homeworks || []).map((h: any) => h.id).filter(Boolean);
      let doneIds = new Set<string>();
      if (hwIds.length) {
        const { data: progress } = await supabase
          .from("homework_progress")
          .select("homework_id,completed").eq("user_id", userId).in("homework_id", hwIds).limit(200);
        doneIds = new Set((progress || []).filter((p: any) => p.completed === true).map((p: any) => String(p.homework_id)));
      }
      const pending = (homeworks || [])
        .filter((h: any) => !doneIds.has(String(h.id)) && (!h.due_date || h.due_date <= horizon))
        .slice(0, 10);
      if (pending.length) {
        parts.push("Несданные ДЗ (по сроку, с описанием задания):");
        for (const h of pending) {
          const subject = Array.isArray(h.subjects) ? h.subjects[0] : h.subjects;
          const desc = String(h.description || "").trim().slice(0, 240);
          parts.push(`- ${h.due_date || "без срока"}: ${subject?.name || ""} — ${h.title || "задание"}${desc ? ` · что нужно: ${desc}` : ""}${h.due_date && h.due_date < today ? " (ПРОСРОЧЕНО)" : ""}`);
        }
      }
    }
  } catch { /* ДЗ необязательны */ }

  try {
    const { data: weak } = await supabase
      .from("user_topic_progress")
      .select("percent,topics(title,modules(subject_id,subjects(name)))")
      .eq("user_id", userId).lt("percent", 70)
      .order("percent", { ascending: true }).limit(8);
    const rows = (weak || []).map((p: any) => {
      const topic = Array.isArray(p.topics) ? p.topics[0] : p.topics;
      const module_ = Array.isArray(topic?.modules) ? topic.modules[0] : topic?.modules;
      const subject = Array.isArray(module_?.subjects) ? module_.subjects[0] : module_?.subjects;
      return { name: topic?.title || "тема", subject: subject?.name || "", percent: p.percent };
    });
    if (rows.length) {
      parts.push("Слабые темы (прогресс ниже 70%):");
      for (const w of rows) parts.push(`- ${w.subject} — ${w.name} (${w.percent}%)`);
    }
  } catch { /* слабые темы необязательны */ }

  try {
    const { count } = await supabase
      .from("srs_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).lte("due_at", new Date().toISOString());
    if (Number(count || 0) > 0) parts.push(`Карточек к повторению сегодня: ${count}.`);
  } catch { /* SRS необязателен */ }

  return parts.length ? parts.join("\n") : null;
}
