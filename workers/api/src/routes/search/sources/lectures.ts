import { scoreFields } from "../../../lib/search-query";
import { TYPE_LABEL } from "../shared";

import type { SourceContext } from "../shared";

export async function addLectures(ctx: SourceContext) {
  const { db, query, subjectSlug, results, subjectNameBySlug } = ctx;
    const { data: lectureRows, error: lectureError } = await db
      .from("histology_lectures")
      .select("id,title,description_algorithm_ref,body_markdown,subject_slug")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(300);
    if (lectureError) throw lectureError;

    for (const raw of (lectureRows || []) as Array<Record<string, any>>) {
      const slug = raw.subject_slug ? String(raw.subject_slug) : null;
      if (subjectSlug && slug !== subjectSlug) continue;
      const title = String(raw.title || "");
      const body = String(raw.body_markdown || "");
      const description = String(raw.description_algorithm_ref || "");
      const subjectName = (slug && subjectNameBySlug.get(slug)) || slug || "";
      const score = scoreFields([title, description, body.slice(0, 4000), subjectName, slug], query);
      if (!score) continue;
      results.push({
        type: "lecture",
        type_label: TYPE_LABEL.lecture,
        id: String(raw.id),
        title,
        subject: subjectName,
        subject_slug: slug,
        topic: "",
        snippet: String(description || body.replace(/[#*_>`]/g, " ")).replace(/\s+/g, " ").slice(0, 200),
        hint: "конспект лекции",
        has_answer: false,
        href: "/lectures",
        score,
      });
    }
}
