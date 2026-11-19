





import { AGENT_PLAN_KIND } from "../../lib/exam-agent";


export const QUEST_CHEST_BONUS = 20;

export async function buildDailyQuests(db: any, userId: string) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [dueResult, todayResult] = await Promise.all([
    db.from("srs_cards").select("id", { count: "exact", head: true }).eq("user_id", userId).lte("due_at", new Date().toISOString()),
    db.from("activity_events").select("kind").eq("user_id", userId).gte("created_at", todayStart.toISOString()).limit(500),
  ]);
  if (todayResult.error) throw todayResult.error;
  const kinds: string[] = (todayResult.data || []).map((row: any) => String(row.kind || ""));
  const reviewed = kinds.filter((kind) => kind === "srs_review").length;
  const tested = kinds.filter((kind) => kind === "test_finished").length;
  const studied = kinds.filter((kind) => kind === "lecture_opened" || kind === "cloze_completed").length;
  const due = dueResult.error ? 0 : dueResult.count || 0;
  const target = Math.min(Math.max(due, 10), 30);

  const quests = [
    {
      id: "srs",
      title: due > 0 ? `Повторить ${target} карточек` : "Повторить 10 карточек",
      hint: due > 0 ? `в очереди ${due}` : "очередь пуста — можно взять любые",
      done: reviewed >= target,
      progress: Math.min(target, reviewed),
      goal: target,
      href: "/cards",
    },
    {
      id: "test",
      title: "Пройти один тест",
      hint: tested ? `сегодня пройдено: ${tested}` : "любой банк по слабой теме",
      done: tested > 0,
      progress: Math.min(1, tested),
      goal: 1,
      href: "/tests",
    },
    {
      id: "study",
      title: "Разобрать лекцию или конспект",
      hint: studied ? `сегодня открыто: ${studied}` : "лекция, cloze или конспект из файла",
      done: studied > 0,
      progress: Math.min(1, studied),
      goal: 1,
      href: "/lectures",
    },
  ];
  const allDone = quests.every((quest) => quest.done);
  const claimed = kinds.includes("quest_chest");
  return {
    date: todayStart.toISOString().slice(0, 10),
    quests,
    done: quests.filter((quest) => quest.done).length,
    chest: { bonus: QUEST_CHEST_BONUS, unlocked: allDone, claimed, available: allDone && !claimed },
  };
}

export const LEAGUE_WEIGHTS: Record<string, number> = {
  test_finished: 10,
  homework_marked: 6,
  cloze_completed: 4,
  lecture_opened: 3,
  assignment_updated: 2,
  srs_review: 2,
  tutor_message: 1,
  quest_chest: 5,
};

// GET /league — место среди однокурсников за 7 дней. Имена не отдаём: только
// свои очки, место, размер группы и отставание от следующего места.
