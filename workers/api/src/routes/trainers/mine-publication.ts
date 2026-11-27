/**
 * Связь «Своих препаратов» с уже опубликованной карточкой атласа.
 *
 * После одобрения у личной карточки есть `published_card_id`. Правка текста
 * должна доезжать до атласа (иначе админ одобрил одну версию, а в атласе
 * висит другая), а удаление — снимать публикацию. Снимок не меняется: его
 * проверил админ.
 */
import { createServiceClient } from "../../lib/supabase";

export type PublishedRow = {
  name: string;
  organ: string | null;
  stain: string | null;
  description: string | null;
  published_card_id: string | null;
};

export async function syncPublishedCard(c: any, row: PublishedRow): Promise<void> {
  if (!row.published_card_id) return;
  const service = createServiceClient(c.env);
  if (!service) return;
  try {
    const { data: card, error: readError } = await service
      .from("trainer_feed_cards")
      .select("id,preparation")
      .eq("id", row.published_card_id)
      .maybeSingle();
    if (readError || !card) return;
    const preparation = {
      ...((card.preparation as Record<string, unknown> | null) || {}),
      name: row.name,
      organ: row.organ,
      stain: row.stain,
      description: row.description,
    };
    const { error } = await service
      .from("trainer_feed_cards")
      .update({ preparation, updated_at: new Date().toISOString() })
      .eq("id", row.published_card_id);
    if (error) console.warn("[trainers:mine:sync]", error.message);
  } catch (error) {
    console.warn("[trainers:mine:sync]", String(error));
  }
}

/** Снять публикацию: архив + не публикуется, снимок больше не отдаётся. */
export async function withdrawPublishedCard(c: any, cardId: string): Promise<void> {
  if (!cardId) return;
  const service = createServiceClient(c.env);
  if (!service) return;
  const { error } = await service
    .from("trainer_feed_cards")
    .update({ is_published: false, is_archived: true, archived_at: new Date().toISOString() })
    .eq("id", cardId);
  if (error) console.warn("[trainers:mine:archive]", error.message);
}
