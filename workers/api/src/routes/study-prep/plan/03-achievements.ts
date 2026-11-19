import { ok, fail, requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";

import type { PlanRouter } from "./types";

export function registerAchievementRoutes(studyPrep: PlanRouter) {
studyPrep.get("/achievements", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  try {
    const { data, error } = await db
      .from("activity_events")
      .select("kind,created_at")
      .eq("user_id", user.id)
      .limit(5000);
    if (error) throw error;
    const rows = data || [];
    const count = (kinds: string[]) => rows.filter((row: any) => kinds.includes(String(row.kind || ""))).length;
    const days = new Set<string>();
    for (const row of rows) {
      const day = String((row as any).created_at || "").slice(0, 10);
      if (day) days.add(day);
    }
    const tests = count(["test_finished"]);
    const reviews = count(["srs_review"]);
    const lectures = count(["lecture_opened"]);
    const cloze = count(["cloze_completed"]);
    const tutor = count(["tutor_message"]);
    const activeDays = days.size;

    const badges = [
      { id: "first_test", title: "Первый тест", hint: "пройти один тест", goal: 1, value: tests },
      { id: "ten_tests", title: "Десятка", hint: "10 тестов", goal: 10, value: tests },
      { id: "first_card", title: "Первое повторение", hint: "повторить карточку", goal: 1, value: reviews },
      { id: "hundred_cards", title: "Сотка карточек", hint: "100 повторений", goal: 100, value: reviews },
      { id: "first_lecture", title: "Первая лекция", hint: "открыть лекцию", goal: 1, value: lectures },
      { id: "cloze_5", title: "Конспект с пропусками", hint: "5 cloze-конспектов", goal: 5, value: cloze },
      { id: "tutor_10", title: "Свой вопрос", hint: "10 вопросов тьютору", goal: 10, value: tutor },
      { id: "week_streak", title: "Неделя без пропусков", hint: "7 активных дней", goal: 7, value: activeDays },
      { id: "month_streak", title: "Месяц учёбы", hint: "30 активных дней", goal: 30, value: activeDays },
    ].map((badge) => ({
      ...badge,
      value: Math.min(badge.value, badge.goal),
      earned: badge.value >= badge.goal,
    }));

    return c.json(ok({ badges, earned: badges.filter((b) => b.earned).length, total: badges.length }, rid));
  } catch (error) {
    console.error("[study-prep:achievements]", error);
    const { body: errBody, status } = fail("ACHIEVEMENTS_ERROR", "Не удалось собрать значки", 503, rid);
    return c.json(errBody, status as 503);
  }
});
}
