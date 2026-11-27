/**
 * Варианты ответа для одобренной карточки студента.
 *
 * Публикация без вариантов делает снимок «экспонатом атласа», но не заданием
 * тренажёра. Если админ выбрал методичку, вопрос собирается так же, как у
 * обычных карточек: верный вариант — ключ методички, три обманки — соседние
 * препараты того же раздела. Формат `{id,label,correct}` совпадает с
 * `trainer_feed_cards.question.options`, поэтому проверка ответа в
 * `histology_training_answer` не меняется.
 */
const GUIDE_KEY = /^[a-z0-9][a-z0-9-]{0,79}$/;
const DISTRACTORS = 3;

export const IDENTIFY_PROMPT = "Какой препарат изображён на фотографии?";

export type IdentifyQuestion =
  | { question: Record<string, unknown> }
  | { message: string };

type GuideRow = { key: string; name: string; section: string | null };
type GuidePoolRow = { key: string; name: string | null };

export async function buildIdentifyQuestion(db: any, guideKey: string): Promise<IdentifyQuestion> {
  if (!GUIDE_KEY.test(guideKey)) return { message: "Некорректный ключ методички" };

  const { data: guide, error } = await db
    .from("preparation_guides")
    .select("key,name,section")
    .eq("key", guideKey)
    .maybeSingle();
  if (error) return { message: "Не удалось прочитать методичку" };
  if (!guide) return { message: "Методичка не найдена" };
  const target = guide as GuideRow;

  const { data: pool, error: poolError } = await db
    .from("preparation_guides")
    .select("key,name")
    .eq("section", String(target.section || ""))
    .neq("key", target.key)
    .order("key", { ascending: true })
    .limit(DISTRACTORS);
  if (poolError) return { message: "Не удалось подобрать варианты ответа" };

  const distractors = ((pool || []) as GuidePoolRow[]).filter((row) => String(row.name || "").trim());
  if (distractors.length < DISTRACTORS) {
    return { message: "В разделе методички мало препаратов для трёх вариантов ответа" };
  }

  const options = [
    { id: target.key, label: target.name, correct: true },
    ...distractors.slice(0, DISTRACTORS).map((row) => ({
      id: row.key,
      label: String(row.name).trim(),
      correct: false,
    })),
  ];

  return { question: { prompt: IDENTIFY_PROMPT, mode: "identify", options } };
}
