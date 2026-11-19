import { createServiceClient } from "../../lib/supabase";
import { primaryTerm, TYPE_PRIORITY } from "./shared";
import { scoreFields } from "../../lib/search-query";
import type { CollectOptions, SearchHit, SearchKind, SourceContext, SubjectRow } from "./shared";
import { addSubjects } from "./sources/subjects";
import { addPreparations } from "./sources/preparations";
import { addMaterials } from "./sources/materials";
import { addLectures } from "./sources/lectures";
import { addQuestions } from "./sources/questions";
import { addTickets } from "./sources/tickets";
import { addPacks } from "./sources/packs";
import { addTests } from "./sources/tests";

export async function collect(c: any, options: CollectOptions) {
  // Контентные таблицы (trainer_feed_cards и др.) отдают данные только
  // серверному клиенту: у authenticated гранты отозваны, и пользовательский
  // клиент ронял весь поиск в 503. Фильтры is_published/is_active остаются.
  const db = createServiceClient(c.env) || c.get("supabase");
  const { query, subjectSlug, limit, materialHint } = options;
  const include = (kind: SearchKind) => !options.kind || options.kind === kind;
  const allowed = (kind: SearchKind) => !options.kinds || options.kinds.includes(kind);
  const term = primaryTerm(query);
  const results: SearchHit[] = [];

  // Предметы нужны не только как результат, но и как «мостик»: по ним
  // находятся материалы, лекции и билеты, если запрос содержит название предмета.
  const { data: subjectRows, error: subjectError } = await db
    .from("subjects")
    .select("id,name,slug,description,course_number,semester")
    .eq("is_active", true)
    .limit(500);
  if (subjectError) throw subjectError;

  const subjects = ((subjectRows || []) as SubjectRow[]).map((row) => ({
    ...row,
    id: String(row.id),
    name: String(row.name || ""),
    slug: row.slug ? String(row.slug) : null,
    score: scoreFields([row.name, row.slug], query),
  }));
  const matchedSubjects = subjects.filter((row) => row.score > 0);
  const matchedIds = [...new Set(matchedSubjects.map((row) => row.id))];
  const matchedSlugs = [...new Set(matchedSubjects.map((row) => row.slug).filter((slug): slug is string => Boolean(slug)))];
  const subjectNameBySlug = new Map(subjects.filter((row) => row.slug).map((row) => [row.slug as string, row.name]));

  const ctx: SourceContext = {
    db, query, term, subjectSlug, materialHint, results, subjects, matchedSubjects, matchedIds, matchedSlugs, subjectNameBySlug, TYPE_PRIORITY,
  };

  if (include("subjects") && allowed("subjects")) {
    await addSubjects(ctx);
  }

  if (include("preparations") && allowed("preparations") && (!subjectSlug || subjectSlug === "histology")) {
    await addPreparations(ctx);
  }

  if (include("materials") && allowed("materials")) {
    await addMaterials(ctx);
  }

  if (include("lectures") && allowed("lectures")) {
    await addLectures(ctx);
  }

  if (include("questions") && allowed("questions")) {
    await addQuestions(ctx);
  }

  if (include("tickets") && allowed("tickets")) {
    await addTickets(ctx);
  }

  if (include("packs") && allowed("packs")) {
    await addPacks(ctx);
  }

  if (include("tests") && allowed("tests")) {
    await addTests(ctx);
  }

  results.sort((a, b) => (
    b.score - a.score
    || (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0)
    || a.title.localeCompare(b.title, "ru")
  ));

  const subjectCounts = new Map<string, { subject: string; subject_slug: string; count: number }>();
  const typeCounts: Record<string, number> = {};
  for (const result of results) {
    typeCounts[result.type] = (typeCounts[result.type] || 0) + 1;
    if (result.subject_slug) {
      const current = subjectCounts.get(result.subject_slug)
        || { subject: result.subject || result.subject_slug, subject_slug: result.subject_slug, count: 0 };
      current.count += 1;
      subjectCounts.set(result.subject_slug, current);
    }
  }

  return {
    items: results.slice(0, limit),
    total: results.length,
    facets: { subjects: [...subjectCounts.values()], types: typeCounts },
  };
}
