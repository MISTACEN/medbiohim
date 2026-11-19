import { histologyTagLabel, normalizeSearchText, scoreFields } from "../../../lib/search-query";
import { TYPE_LABEL } from "../shared";
import type { SearchHit } from "../shared";

import type { SourceContext } from "../shared";

export async function addPreparations(ctx: SourceContext) {
  const { db, query, results } = ctx;
    // Карточек около тысячи; фильтруем в памяти, чтобы JSONB-поля
    // (preparation->>name, organ) не зависели от синтаксиса PostgREST.
    const { data: cardRows, error: cardError } = await db
      .from("trainer_feed_cards")
      .select("id,subject_slug,preparation,mode_set,tags,is_published")
      .eq("subject_slug", "histology")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (cardError) throw cardError;

    const groups = new Map<string, { hit: SearchHit; count: number }>();
    for (const raw of (cardRows || []) as Array<Record<string, any>>) {
      const preparation = raw.preparation && typeof raw.preparation === "object" ? raw.preparation : {};
      const name = String(preparation.name || preparation.organ || "").trim();
      const organ = String(preparation.organ || "").trim();
      const stain = String(preparation.stain || "").trim();
      const tags = Array.isArray(raw.tags) ? raw.tags.map(histologyTagLabel) : [];
      // Do not SELECT question JSON here: it contains correct-answer flags.
      const score = scoreFields([name, organ, stain, ...tags], query);
      if (!score) continue;

      const isElectronogram = String(raw.mode_set || "") === "electronogram";
      const section = tags.find((tag) => tag && tag.toLowerCase() !== "identify" && tag.toLowerCase() !== "mbh") || "";
      const key = normalizeSearchText(name || organ || String(raw.id));
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.hit.score = Math.max(existing.hit.score, score);
        continue;
      }
      const kindLabel = isElectronogram ? "Электронограмма" : "Микропрепарат";
      groups.set(key, {
        count: 1,
        hit: {
          type: "preparation",
          type_label: TYPE_LABEL.preparation,
          id: String(raw.id),
          title: name || organ || "Препарат",
          subject: "Гистология",
          subject_slug: "histology",
          topic: section,
          snippet: [kindLabel, stain, section].filter(Boolean).join(" · "),
          hint: [kindLabel, stain, section].filter(Boolean).join(" · "),
          has_answer: false,
          href: `/atlas?card=${encodeURIComponent(String(raw.id))}`,
          score,
        },
      });
    }
    for (const { hit, count } of groups.values()) {
      results.push(count > 1
        ? { ...hit, count, hint: `${hit.hint} · ${count} ${count < 5 ? "карточки" : "карточек"}` }
        : hit);
    }
}
