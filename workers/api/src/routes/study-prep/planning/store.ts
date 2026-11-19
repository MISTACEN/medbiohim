import type { EventRow, ProgressRow } from "./types";

export function isMissingTable(error: any): boolean {
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205";
}

/** Событие расписания своей группы: дата, тип и предмет для плана. */

/** Событие расписания своей группы: дата, тип и предмет для плана. */
export async function loadEvent(supabase: any, userId: string, entryId: string) {
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

export async function loadProgress(supabase: any, userId: string) {
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

export function planPayload(plan: any, persisted: boolean, notice?: string) {
  return {
    plan,
    persisted,
    ...(notice ? { service_notice: notice } : {}),
  };
}
