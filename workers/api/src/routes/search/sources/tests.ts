import { scoreFields } from "../../../lib/search-query";
import { TYPE_LABEL, relation } from "../shared";

import type { SourceContext } from "../shared";

export async function addTests(ctx: SourceContext) {
  const { db, query, subjectSlug, results } = ctx;
    // Тесты как самостоятельный тип результата: «тест по эмбриологии» должен
    // находить сам тест, а не только вопросы его банка.
    const { data: testRows, error: testError } = await db
      .from("tests")
      .select("id,title,time_limit_sec,subject_id,subjects(name,slug)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (testError) throw testError;

    for (const raw of (testRows || []) as Array<Record<string, any>>) {
      const subject = relation<{ name?: string; slug?: string }>(raw.subjects);
      const slug = subject?.slug ? String(subject.slug) : null;
      if (subjectSlug && slug !== subjectSlug) continue;
      const title = String(raw.title || "");
      const subjectName = subject?.name || "";
      const score = scoreFields([title, subjectName, slug], query);
      if (!score) continue;
      const minutes = raw.time_limit_sec ? Math.round(Number(raw.time_limit_sec) / 60) : null;
      const hint = [minutes ? `${minutes} мин` : null, "тест"].filter(Boolean).join(" · ");
      results.push({
        type: "test",
        type_label: TYPE_LABEL.test,
        id: String(raw.id),
        title,
        subject: subjectName,
        subject_slug: slug,
        topic: "",
        snippet: [subjectName, minutes ? `время: ${minutes} мин` : null].filter(Boolean).join(" · "),
        hint: hint || "тест",
        has_answer: false,
        href: `/tests?open=${encodeURIComponent(String(raw.id))}`,
        score,
      });
    }
}
