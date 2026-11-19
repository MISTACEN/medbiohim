import { matchesMaterialHint, scoreFields } from "../../../lib/search-query";
import { TYPE_LABEL, materialHintLabel, relation } from "../shared";

import type { SourceContext } from "../shared";

export async function addMaterials(ctx: SourceContext) {
  const { db, query, term, subjectSlug, materialHint, results } = ctx;
    // created_at desc: новые материалы всегда попадают в LIMIT-окно, а не
    // вытесняются старыми строками (раньше окно было без сортировки).
    const { data: materialRows, error: materialError } = await db
      .from("materials")
      .select("id,title,type,subject_id,subjects(name,slug)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(500);
    if (materialError) throw materialError;

    const materialHitIds = new Set<string>();
    for (const raw of (materialRows || []) as Array<Record<string, any>>) {
      const subject = relation<{ name?: string; slug?: string }>(raw.subjects);
      const slug = subject?.slug ? String(subject.slug) : null;
      if (subjectSlug && slug !== subjectSlug) continue;
      const title = String(raw.title || "");
      const type = String(raw.type || "");
      const hint = materialHintLabel(title, type);
      const baseScore = scoreFields([title, subject?.name, slug, hint], query);
      // Вид материала — отдельный фильтр: «учебник по гистологии» не должен
      // приносить все таблицы и сборники тестов по этому предмету.
      const hintMatch = matchesMaterialHint([title, type, hint], materialHint);
      // Если назван вид материала («учебник», «атлас»), оставляем только его:
      // иначе запрос «учебник по гистологии» приносит все таблицы и сборники
      // тестов по этому предмету.
      if (query ? !baseScore : !hintMatch) continue;
      if (materialHint && !hintMatch) continue;
      const score = baseScore ? baseScore + (hintMatch ? 50 : 0) : 70;
      materialHitIds.add(String(raw.id));
      results.push({
        type: "material",
        type_label: TYPE_LABEL.material,
        id: String(raw.id),
        title,
        subject: subject?.name || "",
        subject_slug: slug,
        topic: hint,
        snippet: [hint, subject?.name].filter(Boolean).join(" · "),
        hint,
        has_answer: false,
        href: `/materials?q=${encodeURIComponent(title)}${slug ? `&subject_slug=${encodeURIComponent(slug)}` : ""}`,
        score,
      });
    }

    // Поиск по содержимому материала (content_html), а не только по заголовку:
    // тяжёлый HTML не тянем в воркер — сравниваем по id с уже найденными по
    // заголовку и добавляем только новые попадания (ниже заголовочных по счёту).
    if (term) {
      const { data: contentRows, error: contentError } = await db
        .from("materials")
        .select("id,title,type,subject_id,subjects(name,slug)")
        .eq("is_published", true)
        .ilike("content_html", `%${term}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (contentError) throw contentError;
      for (const raw of (contentRows || []) as Array<Record<string, any>>) {
        const id = String(raw.id);
        if (materialHitIds.has(id)) continue;
        const subject = relation<{ name?: string; slug?: string }>(raw.subjects);
        const slug = subject?.slug ? String(subject.slug) : null;
        if (subjectSlug && slug !== subjectSlug) continue;
        const title = String(raw.title || "");
        const type = String(raw.type || "");
        const hint = materialHintLabel(title, type);
        if (materialHint && !matchesMaterialHint([title, type, hint], materialHint)) continue;
        materialHitIds.add(id);
        results.push({
          type: "material",
          type_label: TYPE_LABEL.material,
          id,
          title,
          subject: subject?.name || "",
          subject_slug: slug,
          topic: hint,
          snippet: [hint, subject?.name, "совпадение в содержимом"].filter(Boolean).join(" · "),
          hint,
          has_answer: false,
          href: `/materials?q=${encodeURIComponent(title)}${slug ? `&subject_slug=${encodeURIComponent(slug)}` : ""}`,
          score: 40,
        });
      }
    }
}
