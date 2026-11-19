import { scoreFields } from "../../../lib/search-query";
import { TYPE_LABEL, relation } from "../shared";

import type { SourceContext } from "../shared";

export async function addPacks(ctx: SourceContext) {
  const { db, query, results } = ctx;
    // Карточки-паки: опубликованные (мастерская) колоды студентов и ИИ.
    const { data: packRows, error: packError } = await db
      .from("card_packs")
      .select("id,title,description,subject_slug,is_published,users!card_packs_owner_id_fkey(full_name,display_name)")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(100);
    if (packError) throw packError;
    for (const raw of (packRows || []) as Array<Record<string, any>>) {
      const owner = relation<{ full_name?: string; display_name?: string }>(raw.users);
      const title = String(raw.title || "");
      const author = owner?.full_name || owner?.display_name || "";
      const score = scoreFields([title, String(raw.description || ""), author, String(raw.subject_slug || "")], query);
      if (!score) continue;
      results.push({
        type: "pack",
        type_label: TYPE_LABEL.pack,
        id: String(raw.id),
        title,
        subject: author,
        subject_slug: raw.subject_slug ? String(raw.subject_slug) : null,
        topic: "",
        snippet: String(raw.description || "") || "Пак карточек для повторения",
        hint: "",
        has_answer: false,
        href: `/cards?tab=workshop`,
        score,
      });
    }
}
