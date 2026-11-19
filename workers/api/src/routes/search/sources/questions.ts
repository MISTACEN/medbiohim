import { scoreFields } from "../../../lib/search-query";
import { TYPE_LABEL, relation } from "../shared";

import type { SourceContext } from "../shared";

export async function addQuestions(ctx: SourceContext) {
  const { db, query, term, subjectSlug, results, subjects, matchedIds } = ctx;
    let queryBuilder = db
      .from("questions")
      .select("id,text,answer,subject_id,topic_id,subjects(name,slug),topics(title)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(80);
    if (subjectSlug) {
      const ids = subjects.filter((row) => row.slug === subjectSlug).map((row) => row.id);
      if (ids.length) queryBuilder = queryBuilder.in("subject_id", ids);
    } else if (matchedIds.length) {
      queryBuilder = queryBuilder.in("subject_id", matchedIds);
    } else if (term) {
      queryBuilder = queryBuilder.ilike("text", `%${term}%`);
    }
    const { data: questionRows, error: questionError } = await queryBuilder;
    if (questionError) throw questionError;

    for (const raw of (questionRows || []) as Array<Record<string, any>>) {
      const subject = relation<{ name?: string; slug?: string }>(raw.subjects);
      const topic = relation<{ title?: string }>(raw.topics);
      const text = String(raw.text || "");
      const score = scoreFields([text, subject?.name, topic?.title], query);
      if (!score) continue;
      results.push({
        type: "question",
        type_label: TYPE_LABEL.question,
        id: String(raw.id),
        title: text.slice(0, 160),
        subject: subject?.name || "",
        subject_slug: subject?.slug || null,
        topic: topic?.title || "",
        snippet: text.slice(0, 200),
        hint: "вопрос из банка",
        has_answer: Boolean(String(raw.answer || "").trim()),
        answer: raw.answer || undefined,
        href: "/practice",
        score,
      });
    }
}
