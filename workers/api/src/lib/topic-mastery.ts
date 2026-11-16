/**
 * Освоенность темы из реальных результатов теста.
 *
 * `user_topic_progress` — источник для «готовности к событию» и слабых тем, но
 * до сих пор её никто не заполнял: таблица всегда пустая, поэтому готовность
 * навсегда 0%. Здесь пишем процент лучшей попытки по теме теста.
 *
 * Правила: берём максимум (лучшую попытку), статус — по порогу; сбой записи
 * не должен ломать завершение теста, поэтому ошибки только логируются.
 */
const COMPLETED_PERCENT = 80;

export function progressStatus(percent: number): "not_started" | "in_progress" | "completed" {
  if (percent >= COMPLETED_PERCENT) return "completed";
  if (percent > 0) return "in_progress";
  return "not_started";
}

export async function recordTopicMastery(
  db: any,
  userId: string,
  testId: string,
  percent: number | null | undefined,
): Promise<void> {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  try {
    const { data: test } = await db.from("tests").select("topic_id").eq("id", testId).maybeSingle();
    const topicId = String(test?.topic_id || "");
    if (!topicId) return;
    const { data: existing } = await db
      .from("user_topic_progress")
      .select("percent")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .maybeSingle();
    const previous = Math.max(0, Math.min(100, Math.round(Number(existing?.percent) || 0)));
    const next = Math.max(previous, value);
    if (existing && next === previous) return;
    await db.from("user_topic_progress").upsert(
      {
        user_id: userId,
        topic_id: topicId,
        percent: next,
        status: progressStatus(next),
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: "user_id,topic_id" },
    );
  } catch (error) {
    console.warn("[topic-mastery]", error instanceof Error ? error.message : String(error));
  }
}
