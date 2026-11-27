import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { isTrainableCard, mapTrainerCard } from "./shared";
import type { TrainerRow } from "./shared";

import type { TrainersRouter } from "./types";

/** Размер страницы чтения из БД: лента маленькая (сотни строк), читаем целиком. */
const FEED_PAGE = 200;
const FEED_MAX_ROWS = 2000;

export function registerFeedRoutes(trainers: TrainersRouter) {
trainers.get("/feed", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 30), 1), 250);
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  const subject = c.req.query("subject");
  const specialty = c.req.query("specialty");
  const topic = c.req.query("topic");
  try {
    const select = "id,subject_slug,specialty_slug,mode_set,source_key,preparation,hotspots,question,tags,difficulty,is_published,is_archived,created_at,plan_module_id,plan_topic_id,plan_status,trainer_card_images(id,object_key,external_url,caption,hotspots,sort_order),modules(title),topics(title)";
    const buildQuery = (client: any) => {
      let next = client.from("trainer_feed_cards").select(select).eq("is_published", true).eq("is_archived", false);
      if (subject) next = next.eq("subject_slug", subject);
      if (specialty) next = next.eq("specialty_slug", specialty);
      if (topic) next = next.contains("tags", [topic]);
      return next.order("created_at", { ascending: true });
    };
    // Пагинация считается по пригодным карточкам, поэтому читаем все строки
    // страницами, отбрасываем нерешаемые и только потом режем offset/limit.
    const loadAll = async (client: any) => {
      const rows: TrainerRow[] = [];
      for (let start = 0; start < FEED_MAX_ROWS; start += FEED_PAGE) {
        const { data, error } = await buildQuery(client).range(start, start + FEED_PAGE - 1);
        if (error) return { rows, error };
        const batch = (data || []) as TrainerRow[];
        rows.push(...batch);
        if (batch.length < FEED_PAGE) break;
      }
      return { rows, error: null };
    };

    let loaded = await loadAll(supabase);
    if (loaded.error) {
      console.warn("[trainers:feed] user-scoped query failed; trying published-only service query", loaded.error.message);
      const service = createServiceClient(c.env);
      if (service) loaded = await loadAll(service);
    }
    if (loaded.error) {
      console.error("[trainers:feed]", loaded.error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    const all = loaded.rows.map((row, index) => mapTrainerCard(row, index)).filter(isTrainableCard);
    const items = all.slice(offset, offset + limit).map((card, index) => ({ ...card, order_index: offset + index }));
    return c.json(ok({ items, limit, offset, total: all.length, source: "supabase" }, rid));
  } catch (error) {
    console.error("[trainers:feed]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лента тренажёра недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.get("/feed/:id{[0-9a-fA-F-]{36}}", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("trainer_feed_cards")
      .select("id,subject_slug,specialty_slug,mode_set,source_key,preparation,hotspots,question,tags,difficulty,is_published,is_archived,plan_module_id,plan_topic_id,plan_status,trainer_card_images(id,object_key,external_url,caption,hotspots,sort_order),modules(title),topics(title)")
      .eq("id", c.req.param("id"))
      .eq("is_published", true)
      .eq("is_archived", false)
      .maybeSingle();
    if (error || !data) {
      const { body, status } = fail("NOT_FOUND", "Карточка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(mapTrainerCard(data as TrainerRow, 0), rid));
  } catch (error) {
    console.error("[trainers:feed-card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Карточка недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

trainers.get("/feed/stats", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  // Права на `trainer_feed_answers` отозваны у authenticated: читать историю
  // может только серверный клиент, иначе статистика всегда была 503.
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "Статистика тренажёра недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data: answers, error } = await supabase
      .from("trainer_feed_answers")
      .select("card_id,is_correct,is_skipped,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) throw error;
    const rows = answers || [];
    if (!rows.length) {
      return c.json(ok({ summary: { answered: 0, correct: 0, accuracy: null, cards: 0 }, by_card: [], by_topic: [], mistakes: [] }, rid));
    }

    const cardIds = Array.from(new Set(rows.map((row: any) => String(row.card_id))));
    const { data: cards, error: cardsError } = await supabase
      .from("trainer_feed_cards")
      .select("id,plan_topic_id,topics(title)")
      .in("id", cardIds)
      .limit(500);
    if (cardsError) throw cardsError;
    const topicByCard = new Map<string, string | null>(
      (cards || []).map((row: any) => [String(row.id), (Array.isArray(row.topics) ? row.topics[0]?.title : row.topics?.title) || null])
    );

    const byCard = new Map<string, { attempts: number; correct: number; skipped: number; last_correct: boolean | null; last_skipped: boolean; last_at: string }>();
    for (const row of rows) {
      const key = String(row.card_id);
      const agg = byCard.get(key) || { attempts: 0, correct: 0, skipped: 0, last_correct: null, last_skipped: false, last_at: "" };
      agg.attempts += 1;
      if (row.is_correct === true) agg.correct += 1;
      if (row.is_skipped === true) agg.skipped += 1;
      if (row.is_skipped === true) {
        agg.last_skipped = true;
      } else {
        agg.last_correct = row.is_correct === true;
        agg.last_skipped = false;
      }
      agg.last_at = String(row.created_at || "");
      byCard.set(key, agg);
    }

    const byCardItems = Array.from(byCard, ([card_id, agg]) => {
      const graded = agg.attempts - agg.skipped;
      return {
        card_id,
        topic: topicByCard.get(card_id) || null,
        attempts: agg.attempts,
        correct: agg.correct,
        skipped: agg.skipped,
        accuracy: graded > 0 ? Math.round((agg.correct / graded) * 100) : null,
        last_correct: agg.last_correct,
        last_skipped: agg.last_skipped,
        last_answered_at: agg.last_at,
      };
    });

    const byTopicMap = new Map<string, { topic: string; attempts: number; correct: number; cards: number }>();
    for (const item of byCardItems) {
      const key = item.topic || "Без темы";
      const agg = byTopicMap.get(key) || { topic: key, attempts: 0, correct: 0, cards: 0 };
      agg.attempts += item.attempts - item.skipped;
      agg.correct += item.correct;
      agg.cards += 1;
      byTopicMap.set(key, agg);
    }
    const byTopic = Array.from(byTopicMap.values())
      .map((agg) => ({ ...agg, accuracy: agg.attempts > 0 ? Math.round((agg.correct / agg.attempts) * 100) : null }))
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));

    // Очередь ошибок: последний ответ неверный или был пропуском.
    const mistakes = byCardItems
      .filter((item) => item.last_correct === false || item.last_skipped)
      .sort((a, b) => String(a.last_answered_at).localeCompare(String(b.last_answered_at)))
      .slice(0, 50);

    const answered = rows.filter((row: any) => row.is_skipped !== true).length;
    const correct = rows.filter((row: any) => row.is_correct === true).length;

    return c.json(ok({
      summary: { answered, correct, accuracy: answered ? Math.round((correct / answered) * 100) : null, cards: byCard.size },
      by_card: byCardItems.sort((a, b) => String(b.last_answered_at).localeCompare(String(a.last_answered_at))).slice(0, 100),
      by_topic: byTopic,
      mistakes,
    }, rid));
  } catch (error) {
    console.error("[trainers:stats]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Статистика тренажёра недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});
}
