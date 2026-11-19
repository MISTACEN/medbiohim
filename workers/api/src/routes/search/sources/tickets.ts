import { scoreFields } from "../../../lib/search-query";
import { TYPE_LABEL } from "../shared";

import type { SourceContext } from "../shared";

export async function addTickets(ctx: SourceContext) {
  const { db, query, term, subjectSlug, results, matchedSlugs, subjectNameBySlug } = ctx;
    let queryBuilder = db
      .from("exam_questions")
      .select("id,text,answer,subject_slug,type")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(80);
    if (subjectSlug) queryBuilder = queryBuilder.eq("subject_slug", subjectSlug);
    else if (matchedSlugs.length) queryBuilder = queryBuilder.in("subject_slug", matchedSlugs);
    else if (term) queryBuilder = queryBuilder.ilike("text", `%${term}%`);
    const { data: ticketRows, error: ticketError } = await queryBuilder;
    if (ticketError) throw ticketError;

    for (const raw of (ticketRows || []) as Array<Record<string, any>>) {
      const slug = raw.subject_slug ? String(raw.subject_slug) : null;
      const text = String(raw.text || "");
      const subjectName = (slug && subjectNameBySlug.get(slug)) || slug || "";
      const score = scoreFields([text, subjectName, slug], query);
      if (!score) continue;
      results.push({
        type: "ticket",
        type_label: TYPE_LABEL.ticket,
        id: String(raw.id),
        title: text.slice(0, 160),
        subject: subjectName,
        subject_slug: slug,
        topic: "",
        snippet: text.slice(0, 200),
        hint: "экзаменационный билет",
        has_answer: Boolean(String(raw.answer || "").trim()),
        answer: raw.answer || undefined,
        href: "/tickets",
        score,
      });
    }
}
