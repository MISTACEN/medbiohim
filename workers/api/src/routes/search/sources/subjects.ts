import { TYPE_LABEL } from "../shared";

import type { SourceContext } from "../shared";

export async function addSubjects(ctx: SourceContext) {
  const { matchedSubjects, results } = ctx;
    for (const row of matchedSubjects) {
      if (!row.slug) continue; // без слага ссылка на предмет невозможна
      const hint = [
        row.course_number ? `${row.course_number} курс` : "",
        row.semester ? `${row.semester} семестр` : "",
      ].filter(Boolean).join(" · ");
      results.push({
        type: "subject",
        type_label: TYPE_LABEL.subject,
        id: row.id,
        title: row.name,
        subject: row.name,
        subject_slug: row.slug,
        topic: "",
        snippet: String(row.description || `Предмет «${row.name}»: материалы, тесты и аттестации.`),
        hint: hint || "предмет",
        has_answer: false,
        href: `/subjects/${encodeURIComponent(row.slug)}`,
        score: row.score,
      });
    }
}
