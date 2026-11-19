

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CARD_FIELDS =
  "id,user_id,source_type,source_id,front,back,subject_id,subject_slug,topic,ease,interval,reps,due_at,reviewed_at,stability,difficulty,state,lapses,created_at,updated_at";

export type SrsRow = {
  id?: string;
  user_id?: string;
  source_type?: string | null;
  source_id?: string | null;
  front?: string | null;
  back?: string | null;
  subject_id?: string | null;
  subject_slug?: string | null;
  topic?: string | null;
  ease?: number | string | null;
  interval?: number | string | null;
  reps?: number | string | null;
  due_at?: string | null;
  reviewed_at?: string | null;
};

export function toEpoch(value: unknown, fallback: number): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.round(parsed / 1000) : fallback;
}

export function formatCard(row: SrsRow, subjectNames: Map<string, string>, now: number) {
  const subjectSlug = String(row.subject_slug || "");
  const subjectName = subjectNames.get(subjectSlug) || "";
  const dueAt = toEpoch(row.due_at, now);
  return {
    id: String(row.id || ""),
    front: String(row.front || ""),
    back: String(row.back || ""),
    subject: subjectName || subjectSlug,
    subject_slug: subjectSlug,
    topic: String(row.topic || ""),
    source: row.source_type === "personal" ? "personal" : "question",
    ease: Number(row.ease ?? 2.5),
    interval: Number(row.interval ?? 0),
    reps: Number(row.reps ?? 0),
    due_at: dueAt,
    due_in_hours: Math.round(((dueAt - now) / 3600) * 10) / 10,
    reviewed_at: row.reviewed_at || null,
  };
}

export async function subjectNames(supabase: any): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const { data } = await supabase
      .from("subjects")
      .select("name,slug")
      .eq("is_active", true)
      .limit(500);
    for (const row of data || []) {
      const slug = String((row as any).slug || "");
      if (slug) names.set(slug, String((row as any).name || ""));
    }
  } catch {
    // Subject names are decorative; cards still render with the slug.
  }
  return names;
}

export async function loadCards(supabase: any, userId: string, limit: number): Promise<SrsRow[]> {
  const { data, error } = await supabase
    .from("srs_cards")
    .select(CARD_FIELDS)
    .eq("user_id", userId)
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SrsRow[];
}

export function filterCards(
  rows: SrsRow[],
  options: { subjectId?: string | null; subjectSlug?: string | null; scope?: string | null },
): SrsRow[] {
  const subjectId = String(options.subjectId || "");
  const subjectSlug = String(options.subjectSlug || "");
  const scope = String(options.scope || "");
  return rows.filter((row) => {
    const source = row.source_type === "personal" ? "personal" : "question";
    if (scope === "shared" && source !== "question") return false;
    if (scope === "personal" && source !== "personal") return false;
    if (subjectId) return String(row.subject_id || "") === subjectId;
    if (subjectSlug) return String(row.subject_slug || "") === subjectSlug;
    return true;
  });
}

export function summarize(rows: SrsRow[], subjectNamesBySlug: Map<string, string>, newAvailable: number) {
  const now = Math.round(Date.now() / 1000);
  let due = 0;
  let learning = 0;
  const subjects = new Map<string, { subject: string; subject_slug: string; count: number }>();
  for (const row of rows) {
    if (toEpoch(row.due_at, now) <= now) due += 1;
    if (Number(row.reps ?? 0) > 0 && Number(row.interval ?? 0) < 2) learning += 1;
    const slug = String(row.subject_slug || "");
    if (!slug) continue;
    const entry = subjects.get(slug) || {
      subject: subjectNamesBySlug.get(slug) || slug,
      subject_slug: slug,
      count: 0,
    };
    entry.count += 1;
    subjects.set(slug, entry);
  }
  return {
    due,
    learning,
    total: rows.length,
    new_available: newAvailable,
    subjects: [...subjects.values()].sort((a, b) => b.count - a.count),
  };
}

export async function countNewQuestions(supabase: any, cards: SrsRow[]): Promise<number> {
  const covered = new Set(
    cards.filter((row) => row.source_type === "question" && row.source_id).map((row) => String(row.source_id)),
  );
  try {
    const { data, error } = await supabase
      .from("questions")
      .select("id")
      .eq("is_published", true)
      .is("archived_at", null)
      .limit(2000);
    if (error) return 0;
    return (data || []).filter((row: any) => !covered.has(String(row.id))).length;
  } catch {
    return 0;
  }
}
