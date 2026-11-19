import { AGENT_PLAN_KIND } from "../../../lib/exam-agent";

export async function ensureAgentPlan(
  db: any,
  userId: string,
  subjectSlug: string,
  eventDate: string,
): Promise<{ id: string; user_id: string; subject_slug: string | null; event_date: string } | null> {
  const { data: existing, error } = await db
    .from("study_plans")
    .select("id,user_id,subject_slug,event_date,status")
    .eq("user_id", userId)
    .eq("subject_slug", subjectSlug)
    .eq("event_kind", AGENT_PLAN_KIND)
    .eq("event_date", eventDate)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insertError } = await db
    .from("study_plans")
    .insert({
      user_id: userId,
      subject_slug: subjectSlug,
      event_kind: AGENT_PLAN_KIND,
      event_date: eventDate,
      days: [],
      topics: [],
      generated_by: "rules",
    })
    .select("id,user_id,subject_slug,event_date")
    .maybeSingle();
  if (insertError) throw insertError;
  return data;
}
